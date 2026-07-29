import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { crmSearchResultsMax } from '../../src/lib/customPageLayout.js';

describe('custom page layout · CRM Search result height', () => {
  it('reserves the desktop search-column top offset in the viewport budget', () => {
    assert.equal(crmSearchResultsMax(900, 1), 626);
  });

  it('converts the viewport into the custom-page zoom coordinate system', () => {
    assert.equal(crmSearchResultsMax(900, 0.8), 851);
  });

  it('keeps a usable minimum on short or malformed viewports', () => {
    assert.equal(crmSearchResultsMax(420, 1), 340);
    assert.equal(crmSearchResultsMax('bad', 1), 626);
  });
});
