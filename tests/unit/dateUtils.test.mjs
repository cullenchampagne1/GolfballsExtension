/**
 * Unit tests — iframe/date-utils.js
 *
 * Plain (non-module) script: loaded with node:vm into a jsdom window, like
 * the vanilla content scripts are loaded on the page. Covers the ASP.NET
 * day-offset math (anchored on the values verified in the source comments:
 * Apr 1 2026 → 9587, Apr 12 2026 → 9598) and the calendar-cell date parser
 * across the highlight styles the CRM actually emits.
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = await readFile(new URL('../../iframe/date-utils.js', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', {
  runScripts: 'outside-only',
  virtualConsole: new VirtualConsole(),
});
vm.runInContext(source, dom.getInternalVMContext());
const { __gbDateToAspOffset, __gbParseDateFromCell } = dom.window;
const document = dom.window.document;

describe('__gbDateToAspOffset', () => {
  it('matches the CRM-verified offsets for April 2026', () => {
    assert.equal(__gbDateToAspOffset(new Date(2026, 3, 1)), 9587);
    assert.equal(__gbDateToAspOffset(new Date(2026, 3, 12)), 9598);
  });

  it('anchors the epoch at 2000-01-01 → 0', () => {
    assert.equal(__gbDateToAspOffset(new Date(2000, 0, 1)), 0);
    assert.equal(__gbDateToAspOffset(new Date(2000, 0, 2)), 1);
  });

  it('goes negative before the epoch', () => {
    assert.equal(__gbDateToAspOffset(new Date(1999, 11, 31)), -1);
  });

  it('counts leap days correctly (Feb 29 2024)', () => {
    // 2000→2024 = 24×365 + 6 leap days = 8766, plus Jan (31) + 28 = 8825.
    assert.equal(__gbDateToAspOffset(new Date(2024, 1, 29)), 8825);
  });
});

/* Build a realistic ASP.NET Calendar control table. `selected` marks the
   chosen day cell the way the CRM styles it. */
function calendar({ header = 'April 2026', dayCells }) {
  document.body.innerHTML = `
    <table id="calCommit">
      <tr><td colspan="7">
        <table><tr>
          <td><a title="Go to the previous month" href="#">&lt;</a></td>
          <td align="center">${header}</td>
          <td><a title="Go to the next month" href="#">&gt;</a></td>
        </tr></table>
      </td></tr>
      <tr>${dayCells}</tr>
    </table>`;
  return document;
}

describe('__gbParseDateFromCell', () => {
  it('returns the silver-highlighted day as MM/DD/YYYY with the header year', () => {
    const doc = calendar({
      dayCells: `
        <td><a title="April 01" href="#" style="color:Black">1</a></td>
        <td style="background-color:Silver;"><a title="April 12" href="#" style="color:White">12</a></td>`,
    });
    assert.equal(__gbParseDateFromCell('calCommit', doc), '04/12/2026');
  });

  it('recognises the legacy bgcolor="Silver" attribute variant', () => {
    const doc = calendar({
      dayCells: `
        <td><a title="April 03" href="#">3</a></td>
        <td bgcolor="Silver"><a title="April 07" href="#">7</a></td>`,
    });
    assert.equal(__gbParseDateFromCell('calCommit', doc), '04/07/2026');
  });

  it('recognises a white-styled anchor when the cell itself is unstyled', () => {
    const doc = calendar({
      dayCells: '<td><a title="April 30" href="#" style="color: White;">30</a></td>',
    });
    assert.equal(__gbParseDateFromCell('calCommit', doc), '04/30/2026');
  });

  it('uses the year shown in the calendar header, not the current year', () => {
    const doc = calendar({
      header: 'December 2025',
      dayCells: '<td style="background-color:Silver;"><a title="December 31" href="#">31</a></td>',
    });
    assert.equal(__gbParseDateFromCell('calCommit', doc), '12/31/2025');
  });

  it('never falls back to today: returns null when no day is highlighted', () => {
    const doc = calendar({
      dayCells: `
        <td><a title="April 01" href="#">1</a></td>
        <td><a title="April 02" href="#">2</a></td>`,
    });
    assert.equal(__gbParseDateFromCell('calCommit', doc), null);
  });

  it('ignores highlighted month-navigation links', () => {
    document.body.innerHTML = `
      <table id="calCommit">
        <tr><td>April 2026</td></tr>
        <tr><td style="background-color:Silver;"><a title="Go to the next month" href="#">&gt;</a></td></tr>
      </table>`;
    assert.equal(__gbParseDateFromCell('calCommit', document), null);
  });

  it('returns null when the calendar table is missing from the document', () => {
    document.body.innerHTML = '<div>no calendar here</div>';
    assert.equal(__gbParseDateFromCell('calMissing', document), null);
  });
});
