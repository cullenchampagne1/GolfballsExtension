/**
 * Unit tests — src/modals/ProposalEmail.jsx template coverage.
 *
 * The four proposal-email templates are pure HTML builders, but they live in a
 * JSX module behind React / motion / ui-kit imports, so they're guarded the way
 * proposalEmailOrder.test.mjs guards the composer layout: by reading the source
 * and asserting each builder's own body. The NUMBERS those builders print are
 * covered behaviorally in proposalEmailSource.test.mjs (the `setupFee` /
 * `setupLabel` fields and the $675.76 total) and lineSetupFee.test.mjs.
 *
 * What this pins: no template may quietly omit the "Set Up Fee" row. Dropping
 * it from one template silently quotes that customer below what the cart
 * charges — the bug this whole change set exists to fix.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../src/modals/ProposalEmail.jsx', import.meta.url), 'utf8');

/** The body of a top-level `function <name>(m) { … }` template builder. */
function templateBody(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `template builder ${name} not found`);
  // Builders are top-level, so the next line that starts a new top-level
  // declaration ends this one.
  const rest = SRC.slice(start + 1);
  const next = rest.search(/\n(?:function |const |export |\/\* ── TEMPLATE)/);
  return next === -1 ? rest : rest.slice(0, next);
}

const TEMPLATES = {
  corporate: 'tplCorporate',
  classic: 'tplClassic',
  quote: 'tplQuote',
  separated: 'tplSeparated',
};

describe('proposal email · setup-fee row', () => {
  it('reads the fee from the row model, floored at zero and never on a free line', () => {
    assert.match(SRC, /const _setupOf = \(l\) => \(l && !l\.free && Number\(l\.setupFee\) > 0/);
    assert.match(SRC, /const _setupLabel = \(l\) => _esc\(\(l && l\.setupLabel\) \|\| 'Set Up Fee'\)/);
  });

  for (const [id, fn] of Object.entries(TEMPLATES)) {
    it(`the ${id} template renders the fee row and its amount`, () => {
      const body = templateBody(fn);
      assert.match(body, /_setupOf\(l\)/, `${fn} must consult the line's setup fee`);
      assert.match(body, /_setupLabel\(l\)/, `${fn} must print the fee's label`);
      assert.match(body, /_money\((?:fee|_setupOf\(l\))\)/, `${fn} must print the fee amount`);
    });
  }

  it('every registered template is covered by this test', () => {
    // A new template added to PROPOSAL_TEMPLATES without a fee row would quote
    // low, so the registry and this test's list must stay in lockstep.
    const registry = SRC.slice(SRC.indexOf('export const PROPOSAL_TEMPLATES'));
    const ids = [...registry.slice(0, registry.indexOf('];')).matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(ids.sort(), Object.keys(TEMPLATES).sort());
  });

  it('keeps the classic template byte-faithful to the site’s own sub-table row', () => {
    // golfballs.com nests the fee in a hairline-ruled sub-table under the item
    // (label 38% / spacer 25% / amount), which is what a pasted proposal has to
    // match so ours and theirs are indistinguishable.
    const body = templateBody('tplClassic');
    assert.match(body, /border-top:1px solid #cccccc/);
    assert.match(body, /width:38%/);
    assert.match(body, /width:25%/);
  });

  it('leaves the totals blocks alone — the row model already includes the fee', () => {
    // proposalToEmailSource folds setup into `total`, so every template's
    // "Estimated total" is total − discount and must NOT re-add the fee.
    const adds = [...SRC.matchAll(/_money\(total - \(m\.discount \|\| 0\)\)/g)];
    assert.ok(adds.length >= 3, 'templates still derive the total from the source model');
    assert.doesNotMatch(SRC, /total \+ _setupOf/, 'the fee must not be added twice');
  });
});
