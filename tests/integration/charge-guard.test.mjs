/**
 * Integration flow — the payment/URL security policy as the charge modal and
 * background proxies exercise it.
 *
 * Real security-policy.js runs in a vm sandbox (it needs no chrome/fetch).
 * isChargeRequest must allow exactly the fixed method+endpoint pairs the
 * charge modal uses and reject every origin/method/path/port/query/redirect
 * variant; isCalendarUrl / isCrmCallLogUrl gate the credentialed CRM fetches.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext, loadScript } from './helpers/harness.mjs';

let GBSecurity;

before(() => {
  const context = createContext({});
  loadScript(context, 'security-policy.js');
  GBSecurity = context.GBSecurity;
});

describe('charge request guard', () => {
  it('allows exactly the charge endpoints with their registered methods', () => {
    assert.equal(GBSecurity.isChargeRequest('https://master.api.icustomize.com/user/chargeCard', 'PUT'), true);
    assert.equal(GBSecurity.isChargeRequest('https://master.api.icustomize.com/user/chargecard/', 'PUT'), true, 'trailing slash is normalized');
    assert.equal(GBSecurity.isChargeRequest('https://master.api.icustomize.com/user/billingVerify', 'PUT'), true);
    assert.equal(GBSecurity.isChargeRequest('https://master.api.icustomize.com/admin/editOrder', 'PUT'), true);
    assert.equal(GBSecurity.isChargeRequest(
      'https://production-private-api.icustomize.com/api/user/paymentordercharge/saveAdjustment', 'POST',
    ), true);
    assert.equal(GBSecurity.isChargeRequest(
      'https://production-private-api.icustomize.com/api/user/paymentcreditcard/getUserPaymentMethods', 'POST',
    ), true);
  });

  it('rejects method downgrades and the implicit POST default on PUT endpoints', () => {
    const chargeCard = 'https://master.api.icustomize.com/user/chargeCard';
    assert.equal(GBSecurity.isChargeRequest(chargeCard, 'POST'), false);
    assert.equal(GBSecurity.isChargeRequest(chargeCard, 'GET'), false);
    assert.equal(GBSecurity.isChargeRequest(chargeCard, 'DELETE'), false);
    assert.equal(GBSecurity.isChargeRequest(chargeCard), false, 'no method defaults to POST, which chargeCard does not allow');
    assert.equal(GBSecurity.isChargeRequest(
      'https://production-private-api.icustomize.com/api/user/paymentordercharge/saveadjustment', 'PUT',
    ), false);
  });

  it('rejects origin, port, query, hash, and path-redirect variants', () => {
    const cases = [
      ['http://master.api.icustomize.com/user/chargecard', 'PUT'],           // not https
      ['https://evil.example/user/chargecard', 'PUT'],                        // wrong host
      ['https://master.api.icustomize.com.evil.example/user/chargecard', 'PUT'], // host suffix trick
      ['https://master.api.icustomize.com:8443/user/chargecard', 'PUT'],     // explicit port
      ['https://user:pw@master.api.icustomize.com/user/chargecard', 'PUT'],  // userinfo
      ['https://master.api.icustomize.com/user/chargecard?next=1', 'PUT'],   // query redirect
      ['https://master.api.icustomize.com/user/chargecard#frag', 'PUT'],     // hash
      ['https://master.api.icustomize.com/user/chargecard/extra', 'PUT'],    // deeper path
      ['https://master.api.icustomize.com/admin/chargecard', 'PUT'],         // sibling path
      ['https://master.api.icustomize.com/user/chargecard/../refund', 'PUT'], // dot-segment (normalizes away)
      ['', 'PUT'],
      [null, 'PUT'],
    ];
    for (const [url, method] of cases) {
      assert.equal(GBSecurity.isChargeRequest(url, method), false, `must reject ${url}`);
    }
  });
});

describe('calendar URL guard', () => {
  it('allows only the delivery-date calendar page with a numeric order id', () => {
    assert.equal(GBSecurity.isCalendarUrl(
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar&OrderID=123456',
    ), true);
    assert.equal(GBSecurity.isCalendarUrl(
      'https://api.golfballs.com/golfballs/adminnew/default.aspx?page=deliverydatecalendar&orderid=1',
    ), true, 'parameter names and values match case-insensitively');
  });

  it('rejects wrong hosts, pages, and non-numeric order ids', () => {
    const cases = [
      'https://www.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar&OrderID=1',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&OrderID=1',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar&OrderID=12a',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar&OrderID=1234567890123',
      'https://api.golfballs.com/other/Default.aspx?Page=DeliveryDateCalendar&OrderID=1',
      'http://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=DeliveryDateCalendar&OrderID=1',
    ];
    for (const url of cases) assert.equal(GBSecurity.isCalendarUrl(url), false, `must reject ${url}`);
  });
});

describe('CRM call-log URL guard', () => {
  it('allows only Page=272 with numeric employee and user ids', () => {
    assert.equal(GBSecurity.isCrmCallLogUrl(
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&EmployeeID=42&UserID=7',
    ), true);
  });

  it('rejects other pages, missing ids, and fragments', () => {
    const cases = [
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=273&EmployeeID=42&UserID=7',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&EmployeeID=42',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&EmployeeID=abc&UserID=7',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&EmployeeID=42&UserID=7#x',
      'https://office.gbcadmin.com/golfballs/adminnew/Default.aspx?Page=272&EmployeeID=42&UserID=7',
    ];
    for (const url of cases) assert.equal(GBSecurity.isCrmCallLogUrl(url), false, `must reject ${url}`);
  });
});
