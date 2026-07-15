import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

await import('../../calendar-form-state.js');
const { extractHiddenFields, normalizeFields, buildParams } = globalThis.GBCalendarForm;

describe('ASP.NET calendar hidden-state extraction', () => {
  it('preserves split ViewState fragments and decodes HTML entities', () => {
    const html = `
      <input type="hidden" name="__VIEWSTATEFIELDCOUNT" value="3" />
      <input value="part0&#43;A&amp;B" id="__VIEWSTATE" name="__VIEWSTATE" type="hidden" />
      <input type='hidden' name='__VIEWSTATE1' value='part1&#x2B;C' />
      <input type="hidden" name="__VIEWSTATE2" value="part2" />
      <input type="hidden" name="__VIEWSTATEGENERATOR" value="CA0B0334" />
      <input type="hidden" name="__EVENTVALIDATION" value="evt&#43;value" />
      <input type="text" name="ctl00$unsafe" value="ignored" />`;
    assert.deepEqual(extractHiddenFields(html), {
      __VIEWSTATEFIELDCOUNT: '3',
      __VIEWSTATE: 'part0+A&B',
      __VIEWSTATE1: 'part1+C',
      __VIEWSTATE2: 'part2',
      __VIEWSTATEGENERATOR: 'CA0B0334',
      __EVENTVALIDATION: 'evt+value',
    });
  });

  it('accepts only a bounded ASP.NET state envelope containing __VIEWSTATE', () => {
    assert.deepEqual(normalizeFields({ __VIEWSTATE: 'state', __VIEWSTATE1: 'tail' }), {
      __VIEWSTATE: 'state', __VIEWSTATE1: 'tail',
    });
    assert.equal(normalizeFields({ __EVENTVALIDATION: 'event-only' }), null);
    assert.equal(normalizeFields({ __VIEWSTATE: 'state', 'ctl00$evil': 'x' }), null);
  });
});

describe('ASP.NET calendar form reconstruction', () => {
  it('posts every ViewState fragment during a date-selection event', () => {
    const params = buildParams({
      __VIEWSTATE: 'head', __VIEWSTATE1: 'tail', __VIEWSTATEFIELDCOUNT: '2', __EVENTVALIDATION: 'evt',
    }, { eventTarget: 'ctl00$ApprovalDate', eventArgument: '9587' });
    assert.equal(params.get('__VIEWSTATE'), 'head');
    assert.equal(params.get('__VIEWSTATE1'), 'tail');
    assert.equal(params.get('__VIEWSTATEFIELDCOUNT'), '2');
    assert.equal(params.get('__EVENTTARGET'), 'ctl00$ApprovalDate');
    assert.equal(params.get('__EVENTARGUMENT'), '9587');
  });

  it('adds the real update button only on the final submit', () => {
    const params = buildParams({ __VIEWSTATE: 'state' }, { submit: true });
    assert.equal(params.get('__EVENTTARGET'), '');
    assert.equal(params.get('ctl00$btnUpdateDeliveryDate'), 'Update Delivery Date');
  });
});
