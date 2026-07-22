/**
 * Pure approval policy and local-resource filtering for Help Companion.
 *
 * The model may request one registered data source with a bounded filter, but
 * this module does not grant access. The background controller calls it only
 * after the user chooses Allow once, then sends only the approved projection
 * back in the next assistant request. Raw storage objects never cross that
 * boundary.
 */
(function installHelpDataAccess(root) {
  'use strict';

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
  const ALLOWED_OPTIONS = new Set([
    'type:any', 'type:order', 'type:case', 'type:account', 'type:contact',
    'state:enabled', 'state:any', 'fields:metadata', 'fields:content',
    'limit:5', 'limit:10', 'limit:20',
  ]);
  const TYPES = new Set(['order', 'case', 'account', 'contact']);

  const bounded = (value, max) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function oneOption(options, prefix, fallback) {
    const values = options.filter((value) => value.startsWith(prefix));
    if (values.length > 1) throw new Error(`Choose only one ${prefix.slice(0, -1)} filter`);
    return values[0] || fallback;
  }

  function planRequest(action) {
    if (!action || typeof action !== 'object'
        || action.type !== 'request_data_access'
        || action.target !== 'email_templates') {
      throw new Error('This data request is not registered');
    }
    const query = bounded(action.value, 120) || '*';
    const rawOptions = Array.isArray(action.options) ? action.options : [];
    if (rawOptions.length > 16) throw new Error('The data request has too many filters');
    const options = [...new Set(rawOptions.map((value) => bounded(value, 120)).filter(Boolean))];
    if (options.some((value) => !ALLOWED_OPTIONS.has(value))) {
      throw new Error('The data request contains an unsupported filter');
    }
    const type = oneOption(options, 'type:', 'type:any').slice(5);
    const state = oneOption(options, 'state:', 'state:enabled').slice(6);
    const fields = oneOption(options, 'fields:', 'fields:metadata').slice(7);
    const limit = Number(oneOption(options, 'limit:', 'limit:10').slice(6));
    return {
      type: 'request_data_access',
      target: 'email_templates',
      query,
      templateType: type,
      includeDisabled: state === 'any',
      fields,
      limit,
      options: [`type:${type}`, `state:${state}`, `fields:${fields}`, `limit:${limit}`],
      label: bounded(action.label, 100) || 'Allow one-time email template access',
    };
  }

  function plainBody(value) {
    return bounded(
      String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]{1,500}>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'"),
      900,
    );
  }

  function filterEmailTemplates(templates, request) {
    const plan = planRequest(request);
    const terms = plan.query === '*' || plan.query.toLowerCase() === 'all'
      ? []
      : plan.query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
    const matches = [];
    for (const raw of Array.isArray(templates) ? templates.slice(0, 5_000) : []) {
      if (!raw || typeof raw !== 'object') continue;
      const id = bounded(raw.id, 100);
      if (!SAFE_ID.test(id)) continue;
      const templateType = TYPES.has(String(raw.type || '').toLowerCase())
        ? String(raw.type).toLowerCase() : 'order';
      if (plan.templateType !== 'any' && templateType !== plan.templateType) continue;
      if (!plan.includeDisabled && raw.enabled === false) continue;
      const name = bounded(raw.name || raw.title || id, 120) || id;
      const subject = bounded(raw.subject, 180);
      const tags = Array.isArray(raw.tags) ? raw.tags.map((value) => bounded(value, 60)).join(' ') : '';
      const haystack = `${name} ${subject} ${templateType} ${tags}`.toLowerCase();
      if (terms.some((term) => !haystack.includes(term))) continue;
      const parts = [`Type: ${templateType}`, `Enabled: ${raw.enabled === false ? 'no' : 'yes'}`];
      if (subject) parts.push(`Subject: ${subject}`);
      if (plan.fields === 'content') {
        const content = plainBody(raw.body || raw.html || raw.content);
        if (content) parts.push(`Body: ${content}`);
      }
      matches.push({
        kind: 'email_template',
        id,
        label: bounded(`${name} · ${templateType}${subject ? ` · ${subject}` : ''}`, 120),
        summary: bounded(parts.join('. '), 1_200),
        sort: `${name}\u0000${id}`.toLowerCase(),
      });
    }
    matches.sort((left, right) => left.sort.localeCompare(right.sort));
    const resources = matches.slice(0, plan.limit).map(({ sort, ...resource }) => resource);
    return {
      plan,
      resources,
      resultCount: matches.length,
      truncated: matches.length > resources.length,
    };
  }

  function continuationMessage(result) {
    const count = result.resources.length;
    const projection = result.plan.fields === 'content'
      ? 'names, types, subjects, and body text'
      : 'names, types, and subjects';
    const filter = result.plan.query === '*' ? 'all templates' : `“${result.plan.query}”`;
    return bounded(
      `Approved one-time access to ${count} matching saved email template${count === 1 ? '' : 's'} for ${filter} (${projection}). Continue my original share-link request. Create the link when one result clearly matches; otherwise ask me which template I mean.`,
      500,
    );
  }

  root.GBHelpDataAccess = Object.freeze({
    ALLOWED_OPTIONS,
    planRequest,
    filterEmailTemplates,
    continuationMessage,
  });
})(globalThis);
