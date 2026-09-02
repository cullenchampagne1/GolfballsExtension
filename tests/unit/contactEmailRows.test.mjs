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
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { extract } from '../../src/lib/page-engine/extract.js';
import { contactEmailRows, emailHistoryField } from '../../src/lib/page-engine/helpers.js';
import { accountSchema } from '../../src/lib/page-schemas/contact.js';

const autoSendBridgeSource = await readFile(
  new URL('../../src/vanilla/main.js', import.meta.url),
  'utf8',
);
const emailPreviewSource = await readFile(
  new URL('../../src/content/email-preview.jsx', import.meta.url),
  'utf8',
);

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

// Mirrors the account HTML supplied with the regression: Attachment(s) was
// inserted between Subject and Date, shifting all later cells by one.
function attachmentColumnEmailHistory() {
  return new JSDOM(`
    <!doctype html>
    <input id="AccountID" value="902">
    <select id="PartnerCampaignID"><option selected>Direct</option></select>
    <div class="caption">Email History</div>
    <table id="emailHistory">
      <tbody>
        <tr><th colspan="8">Emails Not Shown:</th></tr>
        <tr>
          <th></th><th>From</th><th>To</th><th>Subject</th>
          <th>Attachment(s)</th><th>Date</th><th>Size</th><th></th>
        </tr>
        <tr data-gb-ep="1">
          <td></td><td>loganb@golfballs.com</td><td>buyer@acme.test</td>
          <td>New Custom Logo Rep!</td><td><i title="1 attachment"></i></td>
          <td>2/4/2026 10:20:00 AM</td><td>19718</td>
          <td><a href="/Default.aspx?Page=268&amp;MessageGUID=g1&amp;MessageID=A1">Download</a></td>
        </tr>
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

  it('maps Date and Size by heading when Attachment(s) shifts their positions', () => {
    const doc = attachmentColumnEmailHistory();
    const [row] = contactEmailRows(doc);
    assert.equal(emailHistoryField(row, 'from'), 'loganb@golfballs.com');
    assert.equal(emailHistoryField(row, 'subject'), 'New Custom Logo Rep!');
    assert.equal(emailHistoryField(row, 'date'), '2/4/2026 10:20:00 AM');
    assert.equal(emailHistoryField(row, 'sizeBytes'), '19718');
  });

  it('feeds the corrected attachment-column date into root Page Engine email history', () => {
    const result = extract(accountSchema, attachmentColumnEmailHistory());
    assert.deepEqual(result.errors, []);
    assert.equal(result.data.emails[0].date, '2026-02-04T10:20:00');
    assert.equal(result.data.emails[0].sizeBytes, 19718);
  });

  it('wires the auto-send recent-email guard to the root Email History collection', () => {
    assert.match(autoSendBridgeSource, /const emails = engine\.resolvePath\(doc, 'emails', \[\]\) \|\| \[\];/);
    assert.doesNotMatch(autoSendBridgeSource, /resolvePath\(doc, 'contact\.emails'/);
  });

  it('uses the same heading-aware fields for Email Viewer row metadata', () => {
    for (const field of ['from', 'to', 'subject', 'date']) {
      assert.match(emailPreviewSource, new RegExp(`${field}: emailHistoryField\\(row, '${field}'\\)`));
    }
    assert.doesNotMatch(emailPreviewSource, /date:\s*cells\[4\]/);
  });
});
