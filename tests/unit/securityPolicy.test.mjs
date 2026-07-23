/** Security-policy allowlists, HTML sanitizer, and manifest/source guardrails.
 *
 * SECURITY-AUDITED-HTTP-NEGATIVE-TEST: verifies that plaintext endpoints fail.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const projectFile = (relative) => new URL(`../../${relative}`, import.meta.url);
const readProjectFile = (relative) => readFile(projectFile(relative), 'utf8');

let policy;
before(async () => {
  await import('../../lib/security-policy.js');
  policy = globalThis.GBSecurity;
});

describe('security policy · request allowlists', () => {
  it('installs the policy on globalThis', () => {
    assert.ok(policy, 'security policy must install');
  });

  it('accepts only the exact https charge endpoint', () => {
    assert.equal(policy.isChargeRequest('https://master.api.icustomize.com/user/chargeCard', 'PUT'), true);
    assert.equal(policy.isChargeRequest('https://master.api.icustomize.com/user/chargeCard?redirect=https://evil.test', 'PUT'), false);
    assert.equal(policy.isChargeRequest('https://evil.test/user/chargeCard', 'PUT'), false);
    assert.equal(policy.isChargeRequest('http://master.api.icustomize.com/user/chargeCard', 'PUT'), false);
    assert.equal(policy.isChargeRequest('https://master.api.icustomize.com:444/user/chargeCard', 'PUT'), false);
  });

  it('matches the calendar page only with a numeric order id', () => {
    assert.equal(policy.isCalendarUrl('https://api.golfballs.com/golfballs/AdminNew/default.aspx?page=DeliveryDateCalendar&orderID=123'), true);
    assert.equal(policy.isCalendarUrl('https://api.golfballs.com/golfballs/AdminNew/default.aspx?page=DeliveryDateCalendar&orderID=abc'), false);
  });

  it('matches the CRM call-log page only on its own page id', () => {
    assert.equal(policy.isCrmCallLogUrl('https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272&employeeId=12&userId=34'), true);
    assert.equal(policy.isCrmCallLogUrl('https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&employeeId=12&userId=34'), false);
  });

  it('accepts Power Automate only on the real logic.azure.com host', () => {
    assert.equal(policy.isPowerAutomateUrl('https://tenant.logic.azure.com/workflows/example'), true);
    assert.equal(policy.isPowerAutomateUrl('https://logic.azure.com.evil.test/workflows/example'), false);
  });

  it('rejects mailto values carrying header injection', () => {
    assert.equal(policy.isMailtoUrl('mailto:person@example.com?subject=Hello'), true);
    assert.equal(policy.isMailtoUrl('mailto:person@example.com\r\nBcc:attacker@example.com'), false);
  });

  it('allows only exact-origin fetches with no port or fragment', () => {
    assert.equal(policy.isAllowedFetchUrl('https://api.golfballs.com/golfballs/crm/Admin/Contact/Get.ajax?1'), true);
    assert.equal(policy.isAllowedFetchUrl('https://api.golfballs.com:444/golfballs/crm/Admin/Contact/Get.ajax?1'), false);
    assert.equal(policy.isAllowedFetchUrl('https://api.golfballs.com/path#unexpected-fragment'), false);
    assert.equal(policy.isAllowedFetchUrl(''), false);
  });
});

describe('security policy · html sanitizer', () => {
  it('strips scripts, inline handlers, and javascript: urls, and hardens links', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.document = dom.window.document;
    const { sanitizeHtml } = await import('../../src/lib/sanitizeHtml.js');
    const dirty = '<p onclick="steal()">Hello<script>alert(1)</script>'
      + '<a href="javascript:alert(1)" target="_blank">bad</a>'
      + '<img src="https://cdn.example/image.png" onerror="steal()"></p>';
    const clean = sanitizeHtml(dirty);
    assert.equal(clean.includes('script'), false);
    assert.equal(clean.includes('onclick'), false);
    assert.equal(clean.includes('javascript:'), false);
    assert.equal(clean.includes('onerror'), false);
    assert.match(clean, /rel="noopener noreferrer"/);
    assert.match(clean, /referrerpolicy="no-referrer"/);
  });
});

describe('security policy · sender identity', () => {
  it('refuses to send without a configured account host', async () => {
    const { senderEmail } = await import('../../src/lib/sender.js');
    const { sendEmail } = await import('../../src/lib/emailSender.js');
    assert.equal(senderEmail('golfballs', ''), '', 'missing sender identity must not use a personal fallback');
    assert.equal(senderEmail('golfballs', 'alex'), 'alex@golfballs.com');
    const missingSender = await sendEmail({
      from: '', to: 'person@example.com', subject: 'Test', htmlBody: '<p>Hello</p>', config: { paReady: true },
    }, { dispatch: () => { throw new Error('must not dispatch'); } });
    assert.equal(missingSender.state, 'failed');
    assert.match(missingSender.error, /Configure Email account host/);
  });
});

describe('security policy · manifest and source guardrails', () => {
  it('keeps host permissions https-only and exactly scoped', async () => {
    const manifest = JSON.parse(await readProjectFile('manifest.json'));
    assert.equal(manifest.host_permissions.some((value) => value.startsWith('http://') || value.startsWith('*://')), false);
    assert.equal(manifest.host_permissions.includes('https://*.golfballs.com/*'), false);
    assert.equal(manifest.host_permissions.includes('https://*.icustomize.com/*'), false);
    assert.equal(manifest.host_permissions.includes('https://*.gbcadmin.com/*'), false);
    assert.equal(manifest.host_permissions.includes('https://*.customizationapplications.com/*'), false);
    assert.equal(manifest.host_permissions.includes('https://admin.icustomize.com/*'), true);
    assert.equal(manifest.host_permissions.includes('https://master.api.icustomize.com/*'), true);
  });

  it('does not reintroduce retired permissions, the companion updater, or a loose sandbox CSP', async () => {
    const manifest = JSON.parse(await readProjectFile('manifest.json'));
    assert.equal(manifest.permissions.includes('theme'), false, 'unused theme permission must not return');
    assert.equal(manifest.permissions.includes('nativeMessaging'), false, 'retired desktop companion permission must not return');
    const backgroundEntrySource = await readProjectFile('background.js');
    assert.equal(backgroundEntrySource.includes('companion-update.js'), false, 'retired companion updater must not load');
    assert.match(manifest.content_security_policy.sandbox, /default-src 'none'/);
  });

  it('keeps the retired address-autocomplete credential out of settings and background', async () => {
    const settingsSource = await readProjectFile('src/pages/SettingsPanel.jsx');
    const credentialsSource = await readProjectFile('src/lib/credentials.js');
    const backgroundSource = await readProjectFile('background.js');
    assert.equal(settingsSource.includes('Address autocomplete key'), false);
    assert.equal(settingsSource.includes('Credential handling'), false);
    assert.equal(credentialsSource.includes('addressAutocompleteKey'), true, 'legacy key cleanup must remain');
    assert.equal(backgroundSource.includes('credentials.addressAutocompleteKey'), false);
  });
});
