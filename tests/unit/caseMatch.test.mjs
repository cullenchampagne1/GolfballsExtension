/**
 * Unit tests — src/lib/caseMatch.js
 *
 * Pure data + matching module (no DOM/chrome). Covers all 7 exports:
 * CASE_CATEGORIES, categorySections, evalCaseRule, matchesCaseTpl,
 * filterCaseTemplates, recommendedFromTemplate, pickBestCaseTemplate.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CASE_CATEGORIES,
  categorySections,
  evalCaseRule,
  matchesCaseTpl,
  filterCaseTemplates,
  recommendedFromTemplate,
  pickBestCaseTemplate,
} from '../../src/lib/caseMatch.js';

describe('CASE_CATEGORIES', () => {
  it('carries the full CRM enum including subcategory-less entries', () => {
    assert.deepEqual(CASE_CATEGORIES['Charge Error'], [
      'Fixed - System did not charge',
      'Fixed - System failed to attach charge',
      'Actual Charge Error - Resolved by Customer',
      'Actual Charge Error - Resolved by CSR',
      'Fraud',
      'Card did not populate',
    ]);
    assert.deepEqual(CASE_CATEGORIES['Place an Order'], []);
    assert.equal(Object.keys(CASE_CATEGORIES).length, 15);
  });
});

describe('categorySections', () => {
  it('keeps only categories that have subcategories, preserving order', () => {
    const sections = categorySections();
    assert.deepEqual(sections.map((s) => s.category), [
      'Order Status Update', 'Product Inquiry', 'Transfer', 'Returns/Reprint',
      'Charge Error', 'Order Change', 'Cancelation', 'Website Concerns',
      'General Inquiry', 'CSAT',
    ]);
    assert.deepEqual(sections[1].subs, ['Sale Made - Yes', 'Sale Made - No']);
  });
});

describe('evalCaseRule', () => {
  const email = {
    from: 'Angry.Customer@example.com',
    subject: 'RE: Order 5119355 never arrived',
    body: 'Hello, my package shows delivered but I never got it.',
  };

  it('contains does a case-insensitive substring check on the chosen field', () => {
    assert.equal(evalCaseRule({ field: 'subject', op: 'contains', value: 'never arrived' }, email), true);
    assert.equal(evalCaseRule({ field: 'subject', op: 'contains', value: 'refund' }, email), false);
  });

  it('defaults the op to contains when omitted', () => {
    assert.equal(evalCaseRule({ field: 'body', value: 'PACKAGE' }, email), true);
  });

  it('equals requires the full lowered field to match', () => {
    assert.equal(evalCaseRule({ field: 'from', op: 'equals', value: 'angry.customer@example.com' }, email), true);
    assert.equal(evalCaseRule({ field: 'from', op: 'equals', value: 'angry.customer' }, email), false);
  });

  it('starts_with / ends_with normalize spacing in the op name', () => {
    assert.equal(evalCaseRule({ field: 'subject', op: 'Starts With', value: 're: order' }, email), true);
    assert.equal(evalCaseRule({ field: 'subject', op: 'ends_with', value: 'arrived' }, email), true);
    assert.equal(evalCaseRule({ field: 'subject', op: 'ends_with', value: 'order' }, email), false);
  });

  it('not_contains passes only when the needle is absent', () => {
    assert.equal(evalCaseRule({ field: 'body', op: 'not_contains', value: 'invoice' }, email), true);
    assert.equal(evalCaseRule({ field: 'body', op: 'not_contains', value: 'delivered' }, email), false);
  });

  it('matches_regex tests case-insensitively and an invalid pattern is false', () => {
    assert.equal(evalCaseRule({ field: 'subject', op: 'matches_regex', value: 'order \\d{7}' }, email), true);
    assert.equal(evalCaseRule({ field: 'subject', op: 'matches_regex', value: '(' }, email), false);
  });

  it('an unknown op is permissive (returns true)', () => {
    assert.equal(evalCaseRule({ field: 'subject', op: 'fuzzy', value: 'zzz' }, email), true);
  });

  it('a missing email field reads as empty string', () => {
    assert.equal(evalCaseRule({ field: 'cc', op: 'contains', value: 'boss' }, email), false);
    assert.equal(evalCaseRule({ field: 'cc', op: 'equals', value: '' }, email), true);
  });
});

describe('matchesCaseTpl', () => {
  const email = { from: 'a@b.com', subject: 'Lost package', body: 'help' };

  it('matches when every rule passes and fails when one does not', () => {
    const tpl = { caseRules: [
      { field: 'subject', op: 'contains', value: 'lost' },
      { field: 'body', op: 'contains', value: 'help' },
    ] };
    assert.equal(matchesCaseTpl(tpl, email), true);
    tpl.caseRules.push({ field: 'from', op: 'contains', value: 'vip' });
    assert.equal(matchesCaseTpl(tpl, email), false);
  });

  it('a template with no rules matches everything', () => {
    assert.equal(matchesCaseTpl({}, email), true);
    assert.equal(matchesCaseTpl({ caseRules: [] }, email), true);
  });
});

describe('filterCaseTemplates', () => {
  it('keeps enabled case templates (enabled defaults to true) and drops the rest', () => {
    const all = [
      { id: 'c1', type: 'case' },
      { id: 'c2', type: 'case', enabled: false },
      { id: 'c3', type: 'case', enabled: true },
      { id: 'e1', type: 'email', enabled: true },
    ];
    assert.deepEqual(filterCaseTemplates(all).map((t) => t.id), ['c1', 'c3']);
    assert.deepEqual(filterCaseTemplates(null), []);
  });
});

describe('recommendedFromTemplate', () => {
  it('returns structured { category, subcategory } pairs with a display-only label', () => {
    const tpl = { caseTags: [{ category: 'Order Status Update', subcategory: 'Lost Package' }] };
    assert.deepEqual(recommendedFromTemplate(tpl), [{
      category: 'Order Status Update',
      subcategory: 'Lost Package',
      label: 'Lost Package · Order Status Update',
    }]);
  });

  it('dedupes repeated tags and skips incomplete ones', () => {
    const tpl = { caseTags: [
      { category: 'CSAT', subcategory: 'Detractor' },
      { category: 'CSAT', subcategory: 'Detractor' },
      { category: 'CSAT' },
      { subcategory: 'Orphan' },
      null,
      { category: 'Transfer', subcategory: 'Retail' },
    ] };
    assert.deepEqual(recommendedFromTemplate(tpl).map((r) => r.label), [
      'Detractor · CSAT',
      'Retail · Transfer',
    ]);
  });

  it('returns [] for a template without a caseTags array', () => {
    assert.deepEqual(recommendedFromTemplate(null), []);
    assert.deepEqual(recommendedFromTemplate({ caseTags: 'nope' }), []);
  });
});

describe('pickBestCaseTemplate', () => {
  const email = { subject: 'Where is my refund', body: '', from: '' };
  const templates = [
    { id: 'ship', caseRules: [{ field: 'subject', op: 'contains', value: 'shipping' }] },
    { id: 'refund', caseRules: [{ field: 'subject', op: 'contains', value: 'refund' }] },
    { id: 'generic', caseRules: [] },
  ];

  it('returns the first template whose rules match the email', () => {
    assert.equal(pickBestCaseTemplate(templates, email).id, 'refund');
  });

  it('falls back to the first template when none match', () => {
    const strict = templates.slice(0, 2);
    assert.equal(pickBestCaseTemplate(strict, { subject: 'hello', body: '', from: '' }).id, 'ship');
  });

  it('returns null when there are no templates', () => {
    assert.equal(pickBestCaseTemplate([], email), null);
    assert.equal(pickBestCaseTemplate(null, email), null);
  });
});
