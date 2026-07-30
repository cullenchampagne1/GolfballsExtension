/**
 * Account-page extraction primitives used by account workflow hydration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { extract } from '../../src/lib/page-engine/extract.js';
import {
  firstAccountContactField,
  accountOrderRows,
  accountOrdersSummary,
  taskOwner,
} from '../../src/lib/page-engine/helpers.js';
import {
  accountSchema,
  opportunitySchema,
} from '../../src/lib/page-schemas/contact.js';
import { orderSchema } from '../../src/lib/page-schemas/order.js';

function accountDocument(href = '/Default.aspx?Page=240&customerID=771') {
  return new JSDOM(`
    <!doctype html>
    <div class="portlet box green">
      <div class="caption">Account Contacts</div>
      <table>
        <tbody>
          <tr>
            <td><a href="${href}">Avery Buyer</a></td>
            <td>avery@example.test</td>
            <td>555-0100</td>
            <td>Buyer</td>
            <td>Prior customer</td>
          </tr>
        </tbody>
      </table>
    </div>
  `, { url: 'https://crm.test/Default.aspx?Page=271&AccountID=902' }).window.document;
}

describe('account page · representative writer contact', () => {
  it('extracts the numeric customer id instead of returning the detail URL', () => {
    const doc = accountDocument();
    assert.equal(firstAccountContactField(doc, 'contactId'), '771');
    assert.equal(
      firstAccountContactField(doc, 'detailUrl'),
      'https://crm.test/Default.aspx?Page=240&customerID=771',
    );
  });

  it('fails closed when the account has no numeric contact link', () => {
    assert.equal(firstAccountContactField(accountDocument('/contacts/current'), 'contactId'), null);
  });
});

/* The account Orders portlet renders a 6-column table (Order / Contact /
   Summary / Date / Revenue / Status) plus a "Total: N  Revenue: $X"
   footer. These fixtures verify the account-scoped row-finder and the
   totals reader that back the per-page schema overrides. */
function accountOrdersDocument() {
  return new JSDOM(`
    <!doctype html>
    <div class="portlet box blue">
      <div class="caption">Account Orders</div>
      <div class="portlet-body">
        <table id="DataTables_Table_0">
          <thead><tr>
            <th>Order</th><th>Contact</th><th>Summary</th>
            <th>Date</th><th>Revenue</th><th>Status</th>
          </tr></thead>
          <tbody>
            <tr>
              <td><a href="/Default.aspx?page=ViewOrder&orderID=55021">55021</a></td>
              <td>Avery Buyer</td>
              <td>Titleist Pro V1 · 12 dz</td>
              <td>07/02/2026</td>
              <td>$1,240.00</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td><a href="/Default.aspx?page=ViewOrder&orderID=55044">55044</a></td>
              <td>Casey Rep</td>
              <td>Callaway Chrome · 4 dz</td>
              <td>07/18/2026</td>
              <td>$412.50</td>
              <td>Processing</td>
            </tr>
            <tr class="footer"><td colspan="6">Total: 17 &nbsp; Revenue: $4,036.91</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `, { url: 'https://crm.test/Default.aspx?Page=271&AccountID=159590' }).window.document;
}

describe('account page · orders (6-column, extra Contact column)', () => {
  it('finds only the linked order rows, skipping the totals footer', () => {
    const rows = accountOrderRows(accountOrdersDocument());
    assert.equal(rows.length, 2);
  });

  it('reads shifted columns so summary/date/revenue/status land in the right cell', () => {
    const [row] = accountOrderRows(accountOrdersDocument());
    const cell = (i) => (row.children[i].textContent || '').trim();
    // Contact is cell 1 (the extra column); Summary shifts from 1→2, etc.
    assert.equal(cell(0), '55021');
    assert.equal(cell(1), 'Avery Buyer');
    assert.equal(cell(2), 'Titleist Pro V1 · 12 dz');
    assert.equal(cell(4), '$1,240.00');
    assert.equal(cell(5), 'Shipped');
  });

  it('reads the portlet total order count and revenue for the stat blocks', () => {
    const doc = accountOrdersDocument();
    assert.equal(accountOrdersSummary(doc, 'count'), '17');
    assert.equal(accountOrdersSummary(doc, 'revenue'), '4,036.91');
  });

  it('returns null totals when no Orders portlet is present', () => {
    const doc = new JSDOM('<!doctype html><div>no orders here</div>').window.document;
    assert.equal(accountOrdersSummary(doc, 'count'), null);
    assert.equal(accountOrderRows(doc).length, 0);
  });
});

describe('shared detail pages · task owner extraction', () => {
  it('prefers a suffixed owner field and falls back to the labeled table column', () => {
    const keyed = new JSDOM(`
      <table><tbody><tr id="taskrow_42"><td id="employee_42">Cullen Champagne</td></tr></tbody></table>
    `).window.document;
    assert.equal(taskOwner(keyed, '42'), 'Cullen Champagne');

    const labeled = new JSDOM(`
      <table>
        <thead><tr><th>Task</th><th>Assigned To</th><th>Due</th></tr></thead>
        <tbody><tr id="taskrow_43"><td>Follow up</td><td>Taylor Reed</td><td>8/12/2026</td></tr></tbody>
      </table>
    `).window.document;
    assert.equal(taskOwner(labeled, '43'), 'Taylor Reed');
  });
});

describe('Page Engine territory and stable ids', () => {
  it('extracts the Territory value and visible name from account-shaped CRM pages', () => {
    const doc = new JSDOM(`
      <input id="AccountID" value="902">
      <select id="TerritoryID">
        <option value="12">P4 / BDR (Joshua)</option>
        <option value="15" selected>P5 / BDR (Cullen)</option>
      </select>
    `).window.document;
    const result = extract(accountSchema, doc);
    assert.equal(result.data.ids.account, '902');
    assert.equal(result.data.account.territoryId, '15');
    assert.equal(result.data.account.territoryName, 'P5 / BDR (Cullen)');
  });

  it('extracts the opportunity id required for stable opportunity upserts', () => {
    const doc = new JSDOM(`
      <input id="opportunityId" value="28042">
      <input id="AccountID" value="902">
      <select id="ddlSalesRepId"><option value="77" selected>Cullen Champagne</option></select>
    `).window.document;
    const result = extract(opportunitySchema, doc);
    assert.equal(result.data.ids.opportunity, '28042');
    assert.equal(result.data.account.salesRepId, '77');
  });

  it('extracts the configured sales-rep id from order pages', () => {
    const doc = new JSDOM(`
      <select id="ctl00_customSalesReps">
        <option value="77" selected>Cullen Champagne</option>
      </select>
    `).window.document;
    const result = extract(orderSchema, doc);
    assert.equal(result.data.order.salesRep, 'Cullen Champagne');
    assert.equal(result.data.order.salesRepId, '77');
  });
});
