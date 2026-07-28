/**
 * Regression: the "skip if emailed within N days" guard reads the contact's
 * Email-history rows via the schema. Those rows must be found in RAW fetched
 * HTML (what EmailRunner background-fetches), which does NOT carry the
 * `data-gb-ep="1"` marker — that attribute is injected at runtime by the
 * email-preview content script on the live page only. Keying off the native
 * Page=268/MessageID view link fixes the guard: without it every fetched
 * contact looked never-emailed, so a coworker's recent email never skipped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { contactEmailRows } from '../../src/lib/page-engine/helpers.js';

// Raw server HTML as fetched in the background: native view links, NO data-gb-ep.
function rawContactEmailHistory() {
  return new JSDOM(`
    <!doctype html>
    <table id="emailHistory">
      <tbody>
        <tr>
          <td><a href="/Default.aspx?Page=268&MessageID=A1&MessageGUID=g1">view</a></td>
          <td>partner@golfballs.com</td>
          <td>buyer@acme.test</td>
          <td>Checking in</td>
          <td>7/21/2026</td>
          <td>12 KB</td>
        </tr>
        <tr>
          <td><a href="/Default.aspx?Page=268&MessageID=A2">view</a></td>
          <td>me@golfballs.com</td>
          <td>buyer@acme.test</td>
          <td>Samples</td>
          <td>3/02/2026</td>
          <td>8 KB</td>
        </tr>
        <tr><td colspan="6">No message link here — not an email row</td></tr>
      </tbody>
    </table>
  `).window.document;
}

describe('contactEmailRows — native email-history rows from raw HTML', () => {
  it('finds message rows by their Page=268/MessageID link, skipping non-email rows', () => {
    const doc = rawContactEmailHistory();
    const rows = contactEmailRows(doc);
    assert.equal(rows.length, 2);
    // cell 1 = from, cell 4 = date (the email-preview reader layout)
    assert.equal(rows[0].children[1].textContent.trim(), 'partner@golfballs.com');
    assert.equal(rows[0].children[4].textContent.trim(), '7/21/2026');
  });

  it('would be zero under the old data-gb-ep selector — the actual bug', () => {
    const doc = rawContactEmailHistory();
    // Proves the raw HTML carries no runtime marker; the old selector saw
    // nothing, which is why lastEmailMs was always 0 in the fetch path.
    assert.equal(doc.querySelectorAll('tr[data-gb-ep="1"]').length, 0);
    assert.ok(contactEmailRows(doc).length > 0);
  });

  it('returns [] when the portlet has no message rows at all', () => {
    const doc = new JSDOM('<!doctype html><table><tr><td>nothing</td></tr></table>').window.document;
    assert.equal(contactEmailRows(doc).length, 0);
  });
});
