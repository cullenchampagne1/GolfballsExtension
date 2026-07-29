/**
 * Unit tests — src/lib/taskCategories.js
 *
 * Pure enum module. Pins the id→label wire contract and the tone fallback.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TASK_CATEGORY_OPTIONS,
  getTaskCategoryLabel,
  getTaskCategoryTone,
} from '../../src/lib/taskCategories.js';

describe('getTaskCategoryLabel', () => {
  it('maps a known CRM id to its display label (string or number id)', () => {
    assert.equal(getTaskCategoryLabel('11'), 'High Priority');
    assert.equal(getTaskCategoryLabel(8), 'Proposal Follow-up');
  });

  it('returns "" for the "0"/Select placeholder', () => {
    assert.equal(getTaskCategoryLabel('0'), '');
    assert.equal(getTaskCategoryLabel(0), '');
  });

  it('returns "" for unknown ids and null/undefined', () => {
    assert.equal(getTaskCategoryLabel('999'), '');
    assert.equal(getTaskCategoryLabel(null), '');
    assert.equal(getTaskCategoryLabel(undefined), '');
  });
});

describe('getTaskCategoryTone', () => {
  it('maps mapped ids to their tone tokens', () => {
    assert.equal(getTaskCategoryTone('16'), 'error');   // Courier Claims
    assert.equal(getTaskCategoryTone(17), 'success');   // High Priority Opportunity
    assert.equal(getTaskCategoryTone('11'), 'warning'); // High Priority
  });

  it('falls back to neutral for unknown ids', () => {
    assert.equal(getTaskCategoryTone('999'), 'neutral');
    assert.equal(getTaskCategoryTone(undefined), 'neutral');
  });
});

describe('TASK_CATEGORY_OPTIONS', () => {
  it('is a picker-ready list of unique string ids with labels, led by Select', () => {
    assert.equal(TASK_CATEGORY_OPTIONS[0].id, '0');
    assert.equal(TASK_CATEGORY_OPTIONS[0].label, 'Select');
    assert.equal(TASK_CATEGORY_OPTIONS.length, 13);
    const ids = TASK_CATEGORY_OPTIONS.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(TASK_CATEGORY_OPTIONS.every((o) => typeof o.id === 'string' && typeof o.label === 'string'));
  });
});
