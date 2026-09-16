import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  loadActiveSalesReps,
  parseActiveSalesReps,
  SALES_REP_DIRECTORY_URL,
} from '../../src/lib/crmSalesReps.js';

const html = `<!doctype html><select id="ctl00_DropDownSalesRep">
  <option value="0">Select</option>
  <option value="42"> Ada Lovelace </option>
  <option value="77">Grace Hopper</option>
  <option value="77">Duplicate Grace</option>
</select>`;

describe('CRM active sales reps', () => {
  it('parses numeric rep IDs while dropping placeholders and duplicates', () => {
    const doc = new JSDOM(html).window.document;
    assert.deepEqual(parseActiveSalesReps(doc), [
      { id: '42', name: 'Ada Lovelace' },
      { id: '77', name: 'Grace Hopper' },
    ]);
  });

  it('loads the authenticated CRM directory used by Submit Proof', async () => {
    const calls = [];
    const reps = await loadActiveSalesReps({
      fetchImpl: async (url, options) => {
        calls.push([url, options]);
        return { ok: true, text: async () => html };
      },
      parseHtml: (source) => new JSDOM(source).window.document,
    });
    assert.deepEqual(calls, [[SALES_REP_DIRECTORY_URL, { credentials: 'include' }]]);
    assert.deepEqual(reps.map((rep) => rep.id), ['42', '77']);
  });
});
