import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  actionReviewDocumentSignature,
  buildActionReviewPostFields,
  filterActionReviewTasks,
  isActionReviewDocument,
  isActionReviewSnapshotSettled,
  paginateActionReviewRows,
  parseActionReviewDocument,
  prepareActionReviewPostback,
  toIsoActionReviewDate,
  toWebFormsActionReviewDate,
} from '../../src/lib/actionReviewModel.js';

const fixture = `<!doctype html>
<html>
  <body>
    <form action="Default.aspx?Page=286" method="post">
      <input type="hidden" name="__VIEWSTATE" value="view-state">
      <input type="hidden" name="__EVENTVALIDATION" value="event-validation">
      <select id="SalesRep" name="ctl00$SalesRep">
        <option value="1114">Alex Sylvester</option>
        <option value="2370" selected>Cullen Champagne</option>
      </select>
      <select id="DateOption" name="ctl00$DateOption">
        <option value="ON" selected>ON</option>
        <option value="BETWEEN">BETWEEN</option>
      </select>
      <input id="DateTime" name="ctl00$DateTime" value="07/29/2026">
      <input id="SecondDateTime" name="ctl00$SecondDateTime" value="7/30/2026">
      <input type="button" name="ctl00$ctl00" value="Submit">

      <table id="ActivityTable">
        <tbody>
          <tr>
            <td></td>
            <td>Cullen</td>
            <td>Starting</td>
            <td>Out</td>
            <td>
              <a href="javascript:CreateActivityDetailModal(9086891);">Started Order Follow-up Workflow #3016517</a>
              <div style="display:none">Workflow Type order_followup Workflow Step init</div>
            </td>
            <td>7/29/2026 8:19:00 AM</td>
          </tr>
        </tbody>
      </table>

      <table class="email-history">
        <thead>
          <tr><th colspan="7">Emails Not Shown:</th></tr>
          <tr><th></th><th>From</th><th>To</th><th>Subject</th><th>Date</th><th>Size</th><th></th></tr>
        </thead>
        <tbody>
          <tr><td colspan="7"></td></tr>
          <tr>
            <td></td>
            <td>LogoProof@golfballs.com</td>
            <td>Cullen@golfballs.com</td>
            <td>Custom Logo Proof Approved</td>
            <td>7/29/2026 12:44:00 PM</td>
            <td>8,283</td>
            <td><a href="Default.aspx?Page=268&amp;MessageID=40698357">Download</a></td>
          </tr>
        </tbody>
      </table>

      <table id="TableTasks">
        <tbody>
          <tr id="taskrow_755756">
            <td>Order Anniversary Follow Up Call</td>
            <td>Order History Special</td>
            <td>New</td>
            <td>7/7/2026</td>
            <td>7/21/2026</td>
            <td>View</td>
          </tr>
          <tr id="taskrow_760227">
            <td></td>
            <td>Proposal follow up via phone</td>
            <td>Proposal Follow-up</td>
            <td>Complete</td>
            <td>7/13/2026</td>
            <td>7/27/2026</td>
            <td>View</td>
          </tr>
          <tr id="taskrow2_760227"><td colspan="6">expanded details</td></tr>
        </tbody>
      </table>
    </form>
  </body>
</html>`;

function documentFrom(html = fixture) {
  return new JSDOM(html, { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=286' }).window.document;
}

describe('Action Review · native document parsing', () => {
  it('parses all three table contracts and strips hidden activity metadata', () => {
    const doc = documentFrom();
    const review = parseActionReviewDocument(doc);

    assert.equal(isActionReviewDocument(doc), true);
    assert.deepEqual(review.reps, [
      { id: '1114', label: 'Alex Sylvester' },
      { id: '2370', label: 'Cullen Champagne' },
    ]);
    assert.deepEqual(review.selected, {
      rep: '2370',
      dateOption: 'ON',
      date1: '2026-07-29',
      date2: '2026-07-30',
    });
    assert.deepEqual(review.activities[0], {
      id: '9086891',
      employee: 'Cullen',
      category: 'Starting',
      direction: 'Out',
      subject: 'Started Order Follow-up Workflow #3016517',
      date: '7/29/2026 8:19:00 AM',
    });
    assert.deepEqual(review.emails[0], {
      from: 'LogoProof@golfballs.com',
      to: 'Cullen@golfballs.com',
      subject: 'Custom Logo Proof Approved',
      date: '7/29/2026 12:44:00 PM',
      size: 8283,
      href: 'Default.aspx?Page=268&MessageID=40698357',
    });
    assert.deepEqual(review.tasks, [
      {
        id: '755756',
        subject: 'Order Anniversary Follow Up Call',
        category: 'Order History Special',
        status: 'New',
        live: '7/7/2026',
        due: '7/21/2026',
      },
      {
        id: '760227',
        subject: 'Proposal follow up via phone',
        category: 'Proposal Follow-up',
        status: 'Complete',
        live: '7/13/2026',
        due: '7/27/2026',
      },
    ]);
    assert.equal(review.formState.__VIEWSTATE, 'view-state');
    assert.equal(review.formState['ctl00$ctl00'], undefined);
    assert.equal(review.formAction, 'Default.aspx?Page=286');
  });

  it('rejects a login-shaped document as an Action Review response', () => {
    const login = documentFrom('<form><input name="username"></form>');
    assert.equal(isActionReviewDocument(login), false);
  });

  it('tracks native table stability so a transient empty tbody is not accepted immediately', () => {
    const doc = documentFrom();

    assert.equal(actionReviewDocumentSignature(doc), 'a:1;e:1;t:2;r:2');
    assert.equal(isActionReviewSnapshotSettled({
      ready: true,
      elapsedMs: 125,
      stableMs: 125,
    }), false);
    assert.equal(isActionReviewSnapshotSettled({
      ready: true,
      elapsedMs: 900,
      stableMs: 300,
    }), true);
    assert.equal(isActionReviewSnapshotSettled({
      ready: false,
      elapsedMs: 2_000,
      stableMs: 2_000,
    }), false);
  });
});

describe('Action Review · WebForms date and postback contract', () => {
  it('converts Date, ISO, and native M/D/YYYY values without dropping a picked date', () => {
    assert.equal(toIsoActionReviewDate('07/29/2026'), '2026-07-29');
    assert.equal(toIsoActionReviewDate('2026-07-30'), '2026-07-30');
    assert.equal(toWebFormsActionReviewDate('2026-07-30'), '7/30/2026');
    assert.equal(toWebFormsActionReviewDate(new Date(2026, 6, 31)), '7/31/2026');
  });

  it('builds the exact GetSalesRep postback and refreshes the named filter fields', () => {
    const fields = buildActionReviewPostFields(
      { __VIEWSTATE: 'view-state', __EVENTVALIDATION: 'event-validation' },
      {
        rep: '2370',
        dateOption: 'BETWEEN',
        date1: '2026-07-29',
        date2: '2026-07-31',
      },
    );

    assert.equal(fields.__EVENTTARGET, 'GetSalesRep');
    assert.deepEqual(JSON.parse(fields.__EVENTARGUMENT), {
      SalesRep: '2370',
      DateOption: 'BETWEEN',
      DateTime: '7/29/2026',
      SecondDateTime: '7/31/2026',
    });
    assert.equal(fields['ctl00$SalesRep'], '2370');
    assert.equal(fields['ctl00$DateTime'], '7/29/2026');
    assert.equal(fields.__VIEWSTATE, 'view-state');
  });

  it('prepares the authenticated native form instead of depending on a fetch response', () => {
    const doc = documentFrom();
    const form = prepareActionReviewPostback(doc, {
      rep: '1114',
      dateOption: 'BETWEEN',
      date1: '2026-07-29',
      date2: '2026-07-31',
    });

    assert.equal(form, doc.querySelector('form'));
    assert.equal(form.querySelector('[name="__EVENTTARGET"]').value, 'GetSalesRep');
    assert.deepEqual(JSON.parse(form.querySelector('[name="__EVENTARGUMENT"]').value), {
      SalesRep: '1114',
      DateOption: 'BETWEEN',
      DateTime: '7/29/2026',
      SecondDateTime: '7/31/2026',
    });
    assert.equal(doc.querySelector('#SalesRep').value, '1114');
    assert.equal(doc.querySelector('#DateOption').value, 'BETWEEN');
    assert.equal(doc.querySelector('#DateTime').value, '7/29/2026');
    assert.equal(doc.querySelector('#SecondDateTime').value, '7/31/2026');
  });
});

describe('Action Review · large task-table presentation model', () => {
  const tasks = Array.from({ length: 225 }, (_, index) => ({
    id: String(index + 1),
    subject: index === 142 ? 'Proposal follow up via phone' : `Task ${index + 1}`,
    category: index % 2 ? 'Call' : 'Other',
    status: index % 3 ? 'New' : 'Complete',
    live: '7/29/2026',
    due: '7/30/2026',
  }));

  it('filters across concrete task fields and status without copying UI logic', () => {
    assert.deepEqual(
      filterActionReviewTasks(tasks, { query: 'proposal follow', status: 'new' }).map((task) => task.id),
      ['143'],
    );
    assert.equal(filterActionReviewTasks(tasks, { status: 'complete' }).length, 75);
  });

  it('paginates tens-of-thousands-style rows into a bounded DOM window', () => {
    const page = paginateActionReviewRows(tasks, 3, 100);
    assert.equal(page.rows.length, 25);
    assert.equal(page.rows[0].id, '201');
    assert.deepEqual(
      { page: page.page, pageCount: page.pageCount, start: page.start, end: page.end, total: page.total },
      { page: 3, pageCount: 3, start: 201, end: 225, total: 225 },
    );
  });
});
