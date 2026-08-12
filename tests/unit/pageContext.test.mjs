import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { detectPageType, isOrderPrintUrl } = await import('../../src/lib/pageType.js');

function page(url) {
  return new JSDOM('<!doctype html><body></body>', { url }).window.document;
}

describe('admin page-context routing', () => {
  it('recognizes the filtered Orders/Index route', () => {
    assert.equal(detectPageType(page(
      'https://api.golfballs.com/golfballs/AdminNew/Default.aspx?Folder=Orders&Page=Index&status=2&max_rows=50',
    )), 'order-index');
  });

  it('recognizes the unfiltered numeric Page=20 Orders Index route', () => {
    assert.equal(detectPageType(page(
      'https://api.golfballs.com/golfballs/AdminNew/Default.aspx?Page=20',
    )), 'order-index');
  });

  it('does not treat another numeric admin page as Orders Index', () => {
    assert.equal(detectPageType(page(
      'https://api.golfballs.com/golfballs/AdminNew/Default.aspx?Page=21',
    )), 'other');
  });

  it('recognizes a PrintOrder invoice PDF as an order page', () => {
    const url = 'https://api.golfballs.com/golfballs/printOrder.aspx?orderID=5163663-7355070&invoice=true';
    assert.equal(isOrderPrintUrl(url), true);
    assert.equal(detectPageType(page(url)), 'order');
  });

  it('rejects PrintOrder lookalikes outside the authenticated CRM host', () => {
    assert.equal(isOrderPrintUrl(
      'https://example.com/golfballs/printOrder.aspx?orderID=5163663-7355070&invoice=true',
    ), false);
  });
});
