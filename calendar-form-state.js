/* Shared ASP.NET WebForms hidden-state parser for the calendar POST chain. */
(function installCalendarFormState(root) {
  'use strict';

  const MAX_FIELDS = 64;
  const MAX_FIELD_BYTES = 5_000_000;
  const MAX_TOTAL_BYTES = 10_000_000;
  const ALLOWED_NAME = /^__(?:VIEWSTATE(?:\d+|FIELDCOUNT|GENERATOR|ENCRYPTED)?|EVENTVALIDATION|PREVIOUSPAGE)$/;

  function decodeAttribute(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
  }

  function attr(tag, name) {
    const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
    return match ? decodeAttribute(match[2]) : '';
  }

  function extractHiddenFields(html) {
    const fields = {};
    const tags = String(html || '').match(/<input\b[^>]*>/gi) || [];
    for (const tag of tags) {
      const name = attr(tag, 'name') || attr(tag, 'id');
      if (!ALLOWED_NAME.test(name)) continue;
      fields[name] = attr(tag, 'value');
    }
    return fields;
  }

  function normalizeFields(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const entries = Object.entries(raw);
    if (!entries.length || entries.length > MAX_FIELDS) return null;
    const fields = {};
    let total = 0;
    for (const [name, value] of entries) {
      if (!ALLOWED_NAME.test(name) || typeof value !== 'string' || value.length > MAX_FIELD_BYTES) return null;
      total += name.length + value.length;
      if (total > MAX_TOTAL_BYTES) return null;
      fields[name] = value;
    }
    return typeof fields.__VIEWSTATE === 'string' ? fields : null;
  }

  function fromLegacy(state) {
    if (!state || typeof state !== 'object') return null;
    return normalizeFields({
      __VIEWSTATE: String(state.viewState || ''),
      __VIEWSTATEGENERATOR: String(state.viewStateGen || ''),
      __EVENTVALIDATION: String(state.eventValidation || ''),
    });
  }

  function buildParams(rawFields, { eventTarget = '', eventArgument = '', submit = false } = {}) {
    const fields = normalizeFields(rawFields);
    if (!fields) return null;
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) params.set(name, value);
    params.set('__EVENTTARGET', eventTarget);
    params.set('__EVENTARGUMENT', eventArgument);
    if (submit) params.set('ctl00$btnUpdateDeliveryDate', 'Update Delivery Date');
    return params;
  }

  root.GBCalendarForm = Object.freeze({
    ALLOWED_NAME,
    buildParams,
    decodeAttribute,
    extractHiddenFields,
    fromLegacy,
    normalizeFields,
  });
})(globalThis);
