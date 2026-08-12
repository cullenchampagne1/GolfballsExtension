import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { shouldMountActionsShelf } from '../../src/lib/shelfAvailability.js';

describe('Actions Shelf document availability', () => {
  it('mounts on Golfballs PrintOrder invoice PDFs', () => {
    assert.equal(shouldMountActionsShelf({
      url: 'https://api.golfballs.com/golfballs/printOrder.aspx?orderID=5163663-7355070&invoice=true',
      pathname: '/golfballs/printOrder.aspx',
      contentType: 'application/pdf',
    }), true);
  });

  it('stays hidden on unrelated streamed and file-based PDFs', () => {
    assert.equal(shouldMountActionsShelf({
      url: 'https://api.golfballs.com/golfballs/ViewInvoice.aspx?id=42',
      pathname: '/golfballs/ViewInvoice.aspx',
      contentType: 'application/pdf; charset=binary',
    }), false);
    assert.equal(shouldMountActionsShelf({
      url: 'https://api.golfballs.com/files/catalog.pdf',
      pathname: '/files/catalog.pdf',
      contentType: '',
    }), false);
  });
});
