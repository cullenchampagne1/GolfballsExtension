/**
 * The response-time card's data, and why it was unreadable.
 *
 * Three separate things went wrong at once, and each on its own would have
 * been survivable:
 *
 *   fabricated outliers   the telemetry reporter CLAMPED an over-cap latency
 *                         sample to exactly `LATENCY_MS_MAX` instead of
 *                         dropping it, so every 25s notification long-poll
 *                         from a since-fixed bug is in the table as a
 *                         five-second backend call — a dense line at the
 *                         ceiling dragging p95 and p99 above it
 *   zeroes for gaps       the endpoint computed one percentile per DAY with
 *                         `_percentile(...) or 0`, so a window on real
 *                         telemetry was a curve pinned to the axis with a few
 *                         spikes over it
 *   an empty axis         a 90-day window on a week-old install is mostly
 *                         blank, and the card had no way to narrow it
 *
 * The reporter half is testable here, in the project that owns it. The
 * endpoint half (`_bucket_samples` / `_level_curve` / `_latency_range`) is
 * covered by the backend suite, which can drive it against a real window.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const TELEMETRY = read('lib/usage-telemetry.js');
const ROUTES = read('.revstack/routes.py');

// The reporter's own accept/reject behaviour is exercised for real in
// `tests/integration/usage-telemetry.test.mjs`, which already loads it with
// `chrome` and `fetch` stubbed. This suite reads the two sources instead: its
// subject is the SHAPE of the fix — which cap rejects and which clamps, and
// which of them the endpoint then trusts.

describe('an over-cap latency sample is dropped, not clamped', () => {
  it('states the reason in the code, because the cap looks like a clamp', () => {
    // `finite()` clamps, and clamping is right for a dwell time — a long read
    // is a long read. For latency it manufactures a measurement.
    assert.match(TELEMETRY, /REJECTED above the cap, not clamped to it/);
    assert.match(TELEMETRY, /if \(!Number\.isFinite\(raw\) \|\| raw < 0 \|\| raw > LATENCY_MS_MAX\) return null;/);
    // The old spelling, which routed latency through the clamping helper.
    assert.doesNotMatch(TELEMETRY, /const ms = finite\(event\.ms, LATENCY_MS_MAX\)/);
  });

  it('keeps the cap where the long-poll cannot reach it', () => {
    // The notification GET is server-held up to 25s; the cap is well under
    // that so a hold timed as a call cannot be recorded at all.
    assert.match(TELEMETRY, /const LATENCY_MS_MAX = 5_000;/);
    assert.match(TELEMETRY, /LONG_POLL_SECONDS/);
  });

  it('still clamps a surface dwell, which is a different measurement', () => {
    // The distinction is the point: `MS_MAX` is 15 minutes because a modal
    // legitimately stays open that long.
    assert.match(TELEMETRY, /const ms = finite\(event\.ms, MS_MAX\);/);
  });
});

describe('the endpoint excludes the samples that were already recorded', () => {
  it('drops the ceiling itself, where the fabricated ones sit', () => {
    // Every clamped sample landed on exactly `_LATENCY_OUTLIER_MS`, so `<`
    // rather than `<=` removes that whole population and nothing else.
    assert.match(ROUTES, /ExtensionUsageEvent\.duration_ms < _LATENCY_OUTLIER_MS/);
  });

  it('buckets the window instead of reading one percentile per day', () => {
    assert.match(ROUTES, /_LATENCY_BUCKETS = 20/);
    assert.match(ROUTES, /def _bucket_samples\(/);
    assert.match(ROUTES, /def _level_curve\(/);
    // The bug this replaces, in the exact spelling `_percentile`'s docstring
    // warns against.
    assert.doesNotMatch(ROUTES, /_percentile\(by_day\[day\], 0\.5\) or 0/);
  });

  it('holds the last known level through a gap rather than claiming zero', () => {
    assert.match(ROUTES, /A latency percentile is a LEVEL, not a count/);
  });

  it('offers its own windows and leads with the narrowest that has data', () => {
    assert.match(ROUTES, /_LATENCY_WINDOWS = \(1, 7, 30, 90\)/);
    assert.match(ROUTES, /"default": ranges\[0\]\["id"\]/);
    // Each range states its span, which is what lets the view animate a
    // switch as a camera move rather than morphing unrelated points.
    assert.match(ROUTES, /"days": span_days,/);
  });

  it('trims each window to its first and last real measurement', () => {
    assert.match(ROUTES, /first, last = filled\[0\], filled\[-1\]/);
    assert.match(ROUTES, /if len\(filled\) < 2:/);
  });
});

describe('the adoption chart has the third curve the design draws', () => {
  it('sends Active, Returning and New', () => {
    // The gap between Active and Returning IS the day's new installs, which is
    // what makes the card answer "was this growth or the same people back".
    // It shipped with two curves and left that subtraction to the eye.
    const builder = ROUTES.slice(ROUTES.indexOf('def _console_usage_adoption_trend'));
    const body = builder.slice(0, builder.indexOf('\ndef ', 1));
    ['"id": "active"', '"id": "returning"', '"id": "new"'].forEach(
      (layer) => assert.ok(body.includes(layer), `${layer} is a layer`));
    assert.match(body, /"label": "Active installs"/);
    assert.match(body, /"label": "Returning"/);
    assert.match(body, /"label": "New"/);
  });

  it('derives Returning rather than querying it, and dashes it for saying so', () => {
    const builder = ROUTES.slice(ROUTES.indexOf('def _console_usage_adoption_trend'));
    const body = builder.slice(0, builder.indexOf('\ndef ', 1));
    assert.match(body, /max\(0, active - new\) for active, new/);
    // Dashed because derived — the design's own choice (`inst`).
    assert.match(body, /"values": \[max\(0, active - new\)[\s\S]{0,140}"dashed": True/);
    // And New is solid now: it is measured, so it does not get the dash.
    assert.match(body, /"id": "new", "label": "New", "values": new_installs\},/);
    assert.doesNotMatch(body, /"id": "new"[^\n]*"dashed": True/);
    assert.doesNotMatch(body, /_USAGE_COLORS/,
      'the endpoint leaves visual color ownership to the chart block');
  });

  it('clamps the derived curve at zero, because two queries have two floors', () => {
    // A credential whose first session is inside the window but whose activity
    // row fell outside it would otherwise make Returning negative.
    const builder = ROUTES.slice(ROUTES.indexOf('def _console_usage_adoption_trend'));
    const body = builder.slice(0, builder.indexOf('\ndef ', 1));
    assert.match(body, /Clamped at zero because the two queries have/);
  });
});
