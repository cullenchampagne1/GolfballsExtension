/**
 * Account/UpdateFromContactPage payload construction + response contract.
 * Fixtures mirror the real capture in generate_proposal.har (Scott
 * Plumbing, AccountID 159590), including the "Web Address is required"
 * rejection shape.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCOUNT_DTO_KEYS,
  buildAccountPayload,
  accountUpdateUrl,
  checkAccountResponse,
} from '../../src/lib/accountUpdate.js';

/* A reader standing in for the live host form. Keyed by input id, so
   `Context` must resolve through the #AccountContext alias. */
function formReader(values) {
  return (id) => (Object.prototype.hasOwnProperty.call(values, id) ? values[id] : '');
}

const LIVE = {
  AccountID: '159590',
  Name: 'Scott Plumbing',
  AccountWebAddress: 'na.com',
  MainCity: 'North Dakota ',
  MainState: 'Unknown',
  MainCountry: 'US',
  CreatedByAsName: 'Seth',
  CreatedDate: '1/12/2026 1:48:58 PM',
  ModifiedDate: '7/28/2026 1:57:15 PM',
  TerritoryID: '15',
  PartnerCampaignID: '0',
  AccountContext: '',   // note: id alias for the Context DTO key
};

describe('buildAccountPayload — full-replacement DTO', () => {
  it('emits every DTO key, sourcing un-edited fields from the host form', () => {
    const payload = buildAccountPayload({}, formReader(LIVE));
    assert.deepEqual(Object.keys(payload), ACCOUNT_DTO_KEYS);
    // audit/immutable fields survive untouched — the bug we must avoid is
    // blanking these because Account/Get.ajax can't supply them.
    assert.equal(payload.CreatedByAsName, 'Seth');
    assert.equal(payload.CreatedDate, '1/12/2026 1:48:58 PM');
    assert.equal(payload.TerritoryID, '15');
    assert.equal(payload.PartnerCampaignID, '0');
    // an absent field (never on the form) defaults to empty string
    assert.equal(payload.EstimatedRevenue, '');
  });

  it('overlays edits by DTO key while preserving the rest', () => {
    const payload = buildAccountPayload(
      { Name: 'Scott Plumbing LLC', AccountWebAddress: 'https://scottplumbing.com' },
      formReader(LIVE),
    );
    assert.equal(payload.Name, 'Scott Plumbing LLC');
    assert.equal(payload.AccountWebAddress, 'https://scottplumbing.com');
    assert.equal(payload.MainCity, 'North Dakota ');   // untouched
    assert.equal(payload.CreatedByAsName, 'Seth');     // untouched
  });

  it('reads the Context DTO key through its #AccountContext input alias', () => {
    const payload = buildAccountPayload({}, formReader({ ...LIVE, AccountContext: 'VIP account' }));
    assert.equal(payload.Context, 'VIP account');
  });

  it('coerces null/undefined edits to empty string (native convention)', () => {
    const payload = buildAccountPayload({ LinkedInURL: null }, formReader(LIVE));
    assert.equal(payload.LinkedInURL, '');
  });
});

describe('accountUpdateUrl — JSON arg in the query string', () => {
  it('URI-encodes the JSON payload onto the endpoint', () => {
    const url = accountUpdateUrl('https://api.golfballs.com', { AccountID: '159590', Name: 'A B' });
    assert.ok(url.startsWith('https://api.golfballs.com/golfballs/crm/Admin/Account/UpdateFromContactPage.ajax?'));
    const arg = decodeURIComponent(url.split('?')[1]);
    assert.deepEqual(JSON.parse(arg), { AccountID: '159590', Name: 'A B' });
  });
});

describe('checkAccountResponse — HasError contract', () => {
  it('throws the CRM message with the offending fields on rejection', () => {
    const body = '{"ErrorMessage":"Web Address is required.","ErrorFields":["AccountWebAddress"],"HasError":true,"LandingURL":""}';
    assert.throws(() => checkAccountResponse(body), /Web Address is required\. \(AccountWebAddress\)/);
  });

  it('returns the parsed object when the save succeeds', () => {
    const ok = checkAccountResponse('{"HasError":false,"LandingURL":"/Default.aspx?Page=271"}');
    assert.equal(ok.HasError, false);
  });

  it('treats an empty/non-JSON body as success (null)', () => {
    assert.equal(checkAccountResponse(''), null);
  });
});
