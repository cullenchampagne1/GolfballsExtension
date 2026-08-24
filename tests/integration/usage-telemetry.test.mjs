/**
 * Integration flow — usage telemetry, buffer to wire.
 *
 * Real lib/usage-telemetry.js and lib/installation-auth.js run in a vm
 * sandbox; only chrome.* and fetch are mocked. Covers: surface open/close and
 * latency samples reaching one batched POST /client/telemetry; the batch
 * doubling as the presence heartbeat when there is nothing to report; the
 * envelope rejecting anything that is not a known content-free event; the
 * buffer's drop-oldest ceiling; and installation-auth timing real round-trips
 * through the sink without sampling the flush POST or notification long poll.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ORIGIN, createChrome, createContext, jsonResponse, loadScript, settle,
  validInstallation,
} from './helpers/harness.mjs';

const TELEMETRY_URL = `${API_ORIGIN}/projects/golfballs-extension/client/telemetry`;
const HEALTH_PATH = '/projects/golfballs-extension/client/health';
const NOTIFICATION_PATH = '/projects/golfballs-extension/client/notifications';

/** installation-auth + usage-telemetry in one sandbox, with the sink wired. */
function loadTelemetry({ fetchImpl } = {}) {
  const parts = createChrome({ stored: { gbApiInstallation: validInstallation() } });
  const context = createContext({ chrome: parts.chrome, fetchImpl });
  loadScript(context, 'lib/installation-auth.js');
  loadScript(context, 'lib/usage-telemetry.js');
  const reporter = context.GBUsageTelemetry.createReporter();
  context.GBUsageSink = reporter.sample;
  return { ...parts, context, reporter };
}

/** Collect every telemetry body the sandbox POSTs. */
function recordingFetch(sent, { failTelemetry = false } = {}) {
  return async (url, options = {}) => {
    if (String(url) === TELEMETRY_URL) {
      sent.push(JSON.parse(options.body));
      return failTelemetry
        ? jsonResponse({ detail: 'nope' }, 503)
        : jsonResponse({ ok: true, accepted: 0 });
    }
    return jsonResponse({ ok: true });
  };
}

describe('usage telemetry', () => {
  it('batches a minute of surfaces and timings into one POST', async () => {
    const sent = [];
    const { reporter } = loadTelemetry({ fetchImpl: recordingFetch(sent) });

    reporter.record({ kind: 'surface_open', surface: 'CRM Search', surface_kind: 'modal' });
    reporter.record({ kind: 'surface_close', surface: 'CRM Search', surface_kind: 'modal', ms: 48_000 });
    reporter.record({ kind: 'surface_open', surface: 'Contact Details', surface_kind: 'page' });
    reporter.sample(142, true);
    assert.equal(reporter.pending(), 4, 'events buffer until a flush');

    assert.equal(await reporter.flush(), true);
    await settle();

    assert.equal(sent.length, 1, 'one POST carries the whole minute, not one per event');
    const batch = sent[0];
    assert.equal(batch.session_id, reporter.sessionId);
    assert.equal(batch.dropped, 0);
    assert.deepEqual(batch.events.map((e) => e.kind),
      ['surface_open', 'surface_close', 'surface_open', 'latency'],
      'the batch preserves the order events happened in');
    assert.equal(batch.events[0].surface, 'CRM Search');
    assert.equal(batch.events[1].ms, 48_000);
    assert.equal(batch.events[2].surface, 'Contact Details');
    assert.equal(batch.events[2].surface_kind, 'page');
    assert.equal(batch.events[3].ms, 142);
    assert.equal(reporter.pending(), 0, 'a flushed buffer is drained, not resent');
  });

  it('flushes an empty batch, because the batch IS the presence heartbeat', async () => {
    const sent = [];
    const { reporter } = loadTelemetry({ fetchImpl: recordingFetch(sent) });

    await reporter.flush();
    await settle();

    assert.equal(sent.length, 1, 'an idle-but-open browser still has to report in');
    assert.deepEqual(sent[0].events, []);
    assert.equal(typeof sent[0].started_at, 'number');
  });

  it('drops anything that is not a known content-free event', () => {
    const { reporter } = loadTelemetry({ fetchImpl: recordingFetch([]) });

    assert.equal(reporter.record({ kind: 'page_url', surface: 'https://crm/contact?id=8412' }), false);
    assert.equal(reporter.record({ kind: 'surface_open' }), false, 'a surface open needs a surface');
    assert.equal(reporter.record({ kind: 'latency' }), false, 'a latency sample needs a duration');
    assert.equal(reporter.record(null), false);
    assert.equal(reporter.pending(), 0, 'nothing rejected may reach the buffer');

    // A surface name is truncated rather than dropped, and an out-of-range
    // duration is clamped — a stalled request must not skew a percentile.
    assert.equal(reporter.record({ kind: 'surface_open', surface: 'x'.repeat(200) }), true);
    assert.equal(reporter.record({ kind: 'latency', ms: 9_999_999 }), true);
  });

  it('keeps the newest events when a very busy minute overruns the buffer', async () => {
    const sent = [];
    const { reporter, context } = loadTelemetry({ fetchImpl: recordingFetch(sent) });
    const capacity = context.GBUsageTelemetry.CAPACITY;

    for (let i = 0; i < capacity + 30; i += 1) {
      reporter.record({ kind: 'surface_open', surface: `S${i}`, surface_kind: 'modal' });
    }
    assert.equal(reporter.pending(), capacity, 'the buffer cannot grow without bound');

    await reporter.flush();
    await settle();

    const batch = sent[0];
    assert.equal(batch.dropped, 30, 'what was dropped is reported, not hidden');
    assert.equal(batch.events[0].surface, 'S30', 'the oldest events are the ones shed');
    assert.equal(batch.events.at(-1).surface, `S${capacity + 29}`);
  });

  it('never resends a batch the backend refused', async () => {
    const sent = [];
    const { reporter } = loadTelemetry({
      fetchImpl: recordingFetch(sent, { failTelemetry: true }),
    });

    reporter.record({ kind: 'surface_open', surface: 'CRM Search', surface_kind: 'modal' });
    assert.equal(await reporter.flush(), false, 'a refused flush reports failure');
    await settle();

    await reporter.flush();
    await settle();
    // Usage is not worth a retry queue that grows across an outage; the second
    // batch carries presence forward and the first minute's events are gone.
    assert.deepEqual(sent[1].events, []);
  });

  it('times real backend calls, but never its own flush', async () => {
    const sent = [];
    const { context, reporter } = loadTelemetry({ fetchImpl: recordingFetch(sent) });

    await context.GBInstallationAuth.apiJson(HEALTH_PATH);
    assert.equal(reporter.pending(), 1, 'a backend round-trip is one latency sample');

    await reporter.flush();
    await settle();
    assert.equal(sent[0].events.length, 1);
    assert.equal(sent[0].events[0].kind, 'latency');
    assert.equal(sent[0].events[0].ok, true);
    assert.ok(sent[0].events[0].ms >= 0);

    // The flush POST is itself an API call. Sampling it would make the reporter
    // measure its own reporting and regrow a batch every time it drained one.
    assert.equal(reporter.pending(), 0, 'the flush must not sample itself');
  });

  it('does not report the intentional notification wait as session latency', async () => {
    const { context, reporter } = loadTelemetry({ fetchImpl: recordingFetch([]) });

    await context.GBInstallationAuth.apiJson(
      `${NOTIFICATION_PATH}?after=0&limit=50&wait_seconds=25`,
    );
    assert.equal(
      reporter.pending(), 0,
      'the server-held notification GET is transport wait, not user-facing latency',
    );

    await context.GBInstallationAuth.apiJson(`${NOTIFICATION_PATH}/receipts`, {
      method: 'POST',
      body: JSON.stringify({ notification_ids: [12], state: 'delivered' }),
    });
    assert.equal(
      reporter.pending(), 1,
      'ordinary notification writes remain part of backend latency health',
    );
  });

  it('marks a failed request as a wait that still happened', async () => {
    const sent = [];
    const { context, reporter } = loadTelemetry({
      fetchImpl: async (url) => {
        if (String(url) === TELEMETRY_URL) { sent.push(null); return jsonResponse({ ok: true }); }
        throw new TypeError('network down');
      },
    });

    await assert.rejects(() => context.GBInstallationAuth.apiJson(HEALTH_PATH));
    assert.equal(reporter.pending(), 1, 'a failed call is still time the user sat through');
  });
});
