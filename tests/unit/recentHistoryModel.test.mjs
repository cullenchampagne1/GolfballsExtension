/**
 * My Recent History page model: generic table parsing (headers + cells with
 * first-link hrefs) and the per-card filter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { parseRecentHistory, filterHistoryRows } from '../../src/lib/recentHistoryModel.js';

const DOC = new JSDOM(`
  <table class="dataTable AHTable"><thead><tr><th>Account Id</th><th>Account Name</th></tr></thead>
    <tbody>
      <tr><td><a href="/Default.aspx?Page=271&accountID=9">9</a></td><td>Acme</td></tr>
      <tr><td><a href="/Default.aspx?Page=271&accountID=12">12</a></td><td>Pebble</td></tr>
    </tbody></table>
  <table class="dataTable OHTable"><thead><tr><th>Order Id</th><th>Status</th></tr></thead>
    <tbody><tr><td>555</td><td>Shipped</td></tr></tbody></table>
`, { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=279' }).window.document;

describe('parseRecentHistory', () => {
  it('finds tables by class, reads headers + cells + absolute first-link hrefs', () => {
    const tables = parseRecentHistory(DOC, 'https://api.golfballs.com/golfballs/adminnew/');
    assert.deepEqual(tables.map((t) => t.key), ['accounts', 'orders']);
    const acct = tables[0];
    assert.deepEqual(acct.headers, ['Account Id', 'Account Name']);
    assert.equal(acct.rows.length, 2);
    assert.match(acct.rows[0].cells[0].href, /accountID=9/);
    assert.equal(acct.rows[0].cells[1].text, 'Acme');
    assert.equal(acct.rows[0].cells[1].href, '');
  });
});

describe('mislabel correction', () => {
  it('relabels the phone-history "View Order" link that opens a CONTACT', () => {
    const doc = new JSDOM(`
      <table class="PCHTable"><thead><tr><th>Contact Name</th></tr></thead>
        <tbody><tr><td><a href="/default.aspx?Page=240&customerID=77">View Order </a></td></tr></tbody></table>
    `).window.document;
    const [t] = parseRecentHistory(doc, 'https://api.golfballs.com/golfballs/adminnew/');
    assert.equal(t.rows[0].cells[0].text, 'View Contact');
    assert.match(t.rows[0].cells[0].href, /customerID=77/);
  });
});

describe('filterHistoryRows', () => {
  const rows = parseRecentHistory(DOC)[0].rows;
  it('substring-filters across all cells, case-insensitive', () => {
    assert.equal(filterHistoryRows(rows, 'peb').length, 1);
    assert.equal(filterHistoryRows(rows, 'PEBBLE')[0].cells[1].text, 'Pebble');
    assert.equal(filterHistoryRows(rows, '').length, 2);
    assert.equal(filterHistoryRows(rows, 'zzz').length, 0);
  });
});
