/**
 * Unit tests — src/lib/emailRunnerMatch.js (EmailRunner's "Matched Only" gate)
 *
 * Pure module driven with an injected resolveMatchForHtml, so no chrome/DOM
 * mocking is needed to cover the three row shapes (cached snapshot / fetched
 * HTML / imported CSV) and the fail-closed behavior for unverifiable rows.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { resolveMatchedOnlyOutcome } from '../../src/lib/emailRunnerMatch.js';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const GROUPED_TEMPLATE = {
  type: 'account',
  accountConditions: {
    outerJoiner: 'AND',
    groups: [{ joiner: 'AND', conditions: [{ source: 'schema', ref: 'account.tier', op: 'is', value: 'gold' }] }],
  },
};

describe('resolveMatchedOnlyOutcome — cached snapshot rows', () => {
  it('matches a grouped tree against the cached snapshot data', async () => {
    const snapshot = { schemaId: 'account', data: { account: { tier: 'gold' } } };
    const outcome = await resolveMatchedOnlyOutcome({ template: GROUPED_TEMPLATE, cachedSnapshot: snapshot });
    assert.deepEqual(outcome, { matched: true, reason: '' });
  });

  it('reports a mismatch with a reason', async () => {
    const snapshot = { schemaId: 'account', data: { account: { tier: 'silver' } } };
    const outcome = await resolveMatchedOnlyOutcome({ template: GROUPED_TEMPLATE, cachedSnapshot: snapshot });
    assert.equal(outcome.matched, false);
    assert.equal(outcome.reason, 'Did not match template rules');
  });

  it('fails closed on legacy flat rules — no DOM in a cached snapshot to evaluate them', async () => {
    const legacyTemplate = { type: 'account', accountConditions: [{ field: 'tier', op: 'equals', val: 'gold' }] };
    const snapshot = { schemaId: 'account', data: { account: { tier: 'gold' } } };
    const outcome = await resolveMatchedOnlyOutcome({ template: legacyTemplate, cachedSnapshot: snapshot });
    assert.equal(outcome.matched, false);
    assert.match(outcome.reason, /legacy match rules/);
  });
});

describe('resolveMatchedOnlyOutcome — fetched HTML rows', () => {
  it('delegates to the injected resolveMatchForHtml with the template and base URL', async () => {
    const calls = [];
    const resolveMatchForHtml = async (html, template, baseUrl) => {
      calls.push({ html, template, baseUrl });
      return { matched: true };
    };
    const outcome = await resolveMatchedOnlyOutcome(
      { template: GROUPED_TEMPLATE, fetchedText: '<html></html>', baseUrl: 'https://crm.example/contact/1' },
      { resolveMatchForHtml },
    );
    assert.deepEqual(outcome, { matched: true, reason: '' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].html, '<html></html>');
    assert.equal(calls[0].baseUrl, 'https://crm.example/contact/1');
    assert.equal(calls[0].template, GROUPED_TEMPLATE);
  });

  it('reports a resolver error as a reason instead of silently matching', async () => {
    const resolveMatchForHtml = async () => ({ matched: false, error: 'parse failed' });
    const outcome = await resolveMatchedOnlyOutcome(
      { template: GROUPED_TEMPLATE, fetchedText: '<html></html>' },
      { resolveMatchForHtml },
    );
    assert.equal(outcome.matched, false);
    assert.equal(outcome.reason, 'Match check failed: parse failed');
  });

  it('fails closed when no match resolver is available on the page', async () => {
    const outcome = await resolveMatchedOnlyOutcome(
      { template: GROUPED_TEMPLATE, fetchedText: '<html></html>' },
      { resolveMatchForHtml: null },
    );
    assert.equal(outcome.matched, false);
    assert.match(outcome.reason, /Match engine unavailable/);
  });
});

describe('resolveMatchedOnlyOutcome — rows with no page to evaluate', () => {
  it('fails closed for an imported CSV row, even with fetched text present', async () => {
    const outcome = await resolveMatchedOnlyOutcome(
      { template: GROUPED_TEMPLATE, imported: true, fetchedText: '<html></html>' },
      { resolveMatchForHtml: async () => ({ matched: true }) },
    );
    assert.equal(outcome.matched, false);
    assert.match(outcome.reason, /Imported rows/);
  });

  it('fails closed when there is no cached snapshot and nothing was fetched', async () => {
    const outcome = await resolveMatchedOnlyOutcome({ template: GROUPED_TEMPLATE });
    assert.equal(outcome.matched, false);
    assert.match(outcome.reason, /No page data/);
  });
});

describe('EmailRunner "Matched Only" wiring', () => {
  it('EmailRunner reads the resolver and skips the row with the gate\'s reason', async () => {
    const runner = await readSource('src/modals/EmailRunner.jsx');
    assert.match(runner, /import \{ resolveMatchedOnlyOutcome \} from '\.\.\/lib\/emailRunnerMatch\.js'/);
    assert.match(runner, /const \[matchedOnly, setMatchedOnly\] = useState\(false\)/);
    assert.match(runner, /await resolveMatchedOnlyOutcome\(/);
    assert.match(runner, /!matchOutcome\.matched/);
    assert.match(runner, /title="Require a rule match"/);
  });

  it('main.js exposes the offscreen-doc match resolver EmailRunner calls', async () => {
    const vanilla = await readSource('src/vanilla/main.js');
    assert.match(vanilla, /window\.__gbResolveMatchForHtml = async \(html, template, baseUrl\)/);
    assert.match(vanilla, /gbEvalTemplateMatch\(template, doc, engine\)/);
  });
});
