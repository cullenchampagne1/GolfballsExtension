/**
 * Shared URL and privileged-action policy for the extension.
 *
 * This file deliberately contains no imports or exports: the Manifest V3
 * service worker loads it with importScripts(), while bundled ESM code imports
 * it for its side effect through src/lib/security.js. Keep security decisions
 * here so individual message handlers cannot drift into broader allowlists.
 */
(function installSecurityPolicy(root) {
  'use strict';

  const FIRST_PARTY_HOSTS = Object.freeze([
    /^(?:www|api|static)\.golfballs\.com$/i,
    /^(?:www|admin|master\.api|production-private-api)\.icustomize\.com$/i,
    /^(?:office|operations)\.gbcadmin\.com$/i,
    /^www\.customizationapplications\.com$/i,
    /^s\.customizationapps\.com$/i,
    /^d1tp32r8b76g0z\.cloudfront\.net$/i,
    /(^|\.)hpgbrands\.com$/i,
    /^brmth7\.a\.searchspring\.io$/i,
    /(^|\.)snugzusa\.com$/i,
  ]);

  const CHARGE_ENDPOINTS = Object.freeze(new Map([
    ['production-private-api.icustomize.com/api/user/paymentcreditcard/getuserpaymentmethods', 'POST'],
    ['production-private-api.icustomize.com/api/user/paymentordercharge/saveadjustment', 'POST'],
    ['production-private-api.icustomize.com/api/user/creditcardinfo/getbillinginfobybillingrequest', 'POST'],
    ['master.api.icustomize.com/user/billingverify', 'PUT'],
    ['master.api.icustomize.com/user/chargecard', 'PUT'],
    ['master.api.icustomize.com/admin/editorder', 'PUT'],
  ]));

  function parseHttpsUrl(value, base) {
    try {
      const raw = String(value || '').trim();
      if (!raw || raw.length > 50_000) return null;
      const url = new URL(raw, base);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      return url;
    } catch {
      return null;
    }
  }

  function matchesHost(hostname, patterns) {
    const host = String(hostname || '').toLowerCase();
    return patterns.some((pattern) => pattern.test(host));
  }

  function isAllowedFetchUrl(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) return false;
    const url = parseHttpsUrl(value, 'https://www.golfballs.com');
    return !!url
      && !url.hash
      && matchesHost(url.hostname, FIRST_PARTY_HOSTS);
  }

  function isProductUrl(value) {
    const url = parseHttpsUrl(value, 'https://www.golfballs.com');
    return !!url
      && /^(?:www|api)\.golfballs\.com$/i.test(url.hostname)
      && /\.(?:html?|aspx)$/i.test(url.pathname);
  }

  function isCalendarUrl(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'api.golfballs.com') return false;
    if (!/\/golfballs\/adminnew\/default\.aspx$/i.test(url.pathname)) return false;
    const page = [...url.searchParams].find(([key]) => key.toLowerCase() === 'page')?.[1];
    const orderId = [...url.searchParams].find(([key]) => key.toLowerCase() === 'orderid')?.[1];
    return /^deliverydatecalendar$/i.test(page || '') && /^\d{1,12}$/.test(orderId || '');
  }

  function isChargeRequest(value, method) {
    const url = parseHttpsUrl(value);
    if (!url || url.search || url.hash) return false;
    const key = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
    return CHARGE_ENDPOINTS.get(key) === String(method || 'POST').toUpperCase();
  }

  function isPowerAutomateUrl(value) {
    const url = parseHttpsUrl(value);
    if (!url) return false;
    return /(^|\.)logic\.azure\.com$/i.test(url.hostname)
      || /(^|\.)environment\.api\.powerplatform\.com$/i.test(url.hostname);
  }

  function isMailtoUrl(value) {
    try {
      const raw = String(value || '');
      if (!raw.startsWith('mailto:') || raw.length > 120_000) return false;
      const url = new URL(raw);
      return url.protocol === 'mailto:' && !/[\r\n]/.test(raw);
    } catch {
      return false;
    }
  }

  function isCrmCallLogUrl(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'api.golfballs.com' || url.hash) return false;
    if (!/\/golfballs\/adminnew\/default\.aspx$/i.test(url.pathname)) return false;
    const page = [...url.searchParams].find(([key]) => key.toLowerCase() === 'page')?.[1];
    const employeeId = [...url.searchParams].find(([key]) => key.toLowerCase() === 'employeeid')?.[1];
    const userId = [...url.searchParams].find(([key]) => key.toLowerCase() === 'userid')?.[1];
    return page === '272' && /^\d{1,12}$/.test(employeeId || '') && /^\d{1,12}$/.test(userId || '');
  }

  root.GBSecurity = Object.freeze({
    FIRST_PARTY_HOSTS,
    isAllowedFetchUrl,
    isCalendarUrl,
    isChargeRequest,
    isCrmCallLogUrl,
    isMailtoUrl,
    isPowerAutomateUrl,
    isProductUrl,
    matchesHost,
    parseHttpsUrl,
  });
})(globalThis);
