/**
 * Account-page extraction primitives used by account campaign hydration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { firstAccountContactField } from '../../src/lib/page-engine/helpers.js';

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
