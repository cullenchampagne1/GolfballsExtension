/**
 * Pure approval policy and local-resource filtering for Help Companion.
 *
 * Data is split deliberately:
 *   - feature/developer-setting state is low-risk automatic context assembled
 *     by helpActions.js;
 *   - personal saved content is registered here and crosses the client
 *     boundary only after a visible one-time approval.
 *
 * The model chooses a registered source and bounded filters. It never receives
 * raw Chrome storage objects; each source owns a small safe projection.
 */
(function installHelpDataAccess(root) {
  'use strict';

  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
  const COMMON_OPTIONS = [
    'state:enabled', 'state:any', 'fields:metadata', 'fields:content',
    'limit:5', 'limit:10', 'limit:20',
  ];
  const SOURCES = Object.freeze({
    email_templates: Object.freeze({
      target: 'email_templates', storageKey: 'templates', kind: 'email_template',
      label: 'saved email templates', itemLabel: 'email template', dimension: 'type',
      values: Object.freeze(['any', 'order', 'case', 'account', 'contact']),
      options: Object.freeze([
        'type:any', 'type:order', 'type:case', 'type:account', 'type:contact',
        ...COMMON_OPTIONS,
      ]),
    }),
    note_templates: Object.freeze({
      target: 'note_templates', storageKey: 'noteTemplates', kind: 'note_template',
      label: 'saved notes and task templates', itemLabel: 'note template', dimension: 'subtype',
      values: Object.freeze(['any', 'note', 'task', 'call_log']),
      options: Object.freeze([
        'subtype:any', 'subtype:note', 'subtype:task', 'subtype:call_log',
        ...COMMON_OPTIONS,
      ]),
    }),
  });
  const ALLOWED_OPTIONS = new Set(Object.values(SOURCES).flatMap((source) => source.options));

  const bounded = (value, max) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function oneOption(options, prefix, fallback) {
    const values = options.filter((value) => value.startsWith(prefix));
    if (values.length > 1) throw new Error(`Choose only one ${prefix.slice(0, -1)} filter`);
    return values[0] || fallback;
  }

  function planRequest(action) {
    if (!action || typeof action !== 'object' || action.type !== 'request_data_access') {
      throw new Error('This data request is not registered');
    }
    const target = bounded(action.target, 100);
    const source = SOURCES[target];
    if (!source) throw new Error('This data source is not registered');
    const query = bounded(action.value, 120) || '*';
    const rawOptions = Array.isArray(action.options) ? action.options : [];
    if (rawOptions.length > 16) throw new Error('The data request has too many filters');
    const options = [...new Set(rawOptions.map((value) => bounded(value, 120)).filter(Boolean))];
    if (options.some((value) => !source.options.includes(value))) {
      throw new Error('The data request contains an unsupported filter');
    }
    const dimension = oneOption(
      options, `${source.dimension}:`, `${source.dimension}:any`,
    ).slice(source.dimension.length + 1);
    if (!source.values.includes(dimension)) throw new Error('The data request filter is invalid');
    const state = oneOption(options, 'state:', 'state:enabled').slice(6);
    const fields = oneOption(options, 'fields:', 'fields:metadata').slice(7);
    const limit = Number(oneOption(options, 'limit:', 'limit:10').slice(6));
    return {
      type: 'request_data_access', target, query, source,
      dimension, includeDisabled: state === 'any', fields, limit,
      options: [
        `${source.dimension}:${dimension}`, `state:${state}`,
        `fields:${fields}`, `limit:${limit}`,
      ],
      label: bounded(action.label, 100) || `Allow one-time access to ${source.label}`,
    };
  }

  function storageKeys(request) {
    const plan = request?.source ? request : planRequest(request);
    return [plan.source.storageKey];
  }

  function plainBody(value, limit = 900) {
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
      limit,
    );
  }

  function queryTerms(plan) {
    return plan.query === '*' || plan.query.toLowerCase() === 'all'
      ? []
      : plan.query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  }

  function finish(plan, matches) {
    matches.sort((left, right) => left.sort.localeCompare(right.sort));
    const resources = matches.slice(0, plan.limit).map(({ sort, ...resource }) => resource);
    return {
      plan, resources, resultCount: matches.length,
      truncated: matches.length > resources.length,
    };
  }

  function filterEmailTemplates(templates, request) {
    const plan = request?.source ? request : planRequest(request);
    if (plan.target !== 'email_templates') throw new Error('Expected an email-template request');
    const terms = queryTerms(plan);
    const matches = [];
    for (const raw of Array.isArray(templates) ? templates.slice(0, 5_000) : []) {
      if (!raw || typeof raw !== 'object') continue;
      const id = bounded(raw.id, 100);
      if (!SAFE_ID.test(id)) continue;
      const rawType = String(raw.type || '').toLowerCase();
      const templateType = plan.source.values.includes(rawType) && rawType !== 'any'
        ? rawType : 'order';
      if (plan.dimension !== 'any' && templateType !== plan.dimension) continue;
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
        kind: plan.source.kind, id,
        label: bounded(`${name} · ${templateType}${subject ? ` · ${subject}` : ''}`, 120),
        summary: bounded(parts.join('. '), 1_200),
        sort: `${name}\u0000${id}`.toLowerCase(),
      });
    }
    return finish(plan, matches);
  }

  function filterNoteTemplates(notes, request) {
    const plan = request?.source ? request : planRequest(request);
    if (plan.target !== 'note_templates') throw new Error('Expected a note-template request');
    const terms = queryTerms(plan);
    const matches = [];
    for (const raw of Array.isArray(notes) ? notes.slice(0, 5_000) : []) {
      if (!raw || typeof raw !== 'object') continue;
      const id = bounded(raw.id, 100);
      if (!SAFE_ID.test(id)) continue;
      const rawSubtype = String(raw.subType || raw.subtype || 'note').toLowerCase();
      const subtype = plan.source.values.includes(rawSubtype) && rawSubtype !== 'any'
        ? rawSubtype : 'note';
      if (plan.dimension !== 'any' && subtype !== plan.dimension) continue;
      if (!plan.includeDisabled && raw.enabled === false) continue;
      const name = bounded(raw.name || raw.title || id, 120) || id;
      const subject = bounded(raw.subject, 180);
      const category = bounded(raw.category || raw.categoryLabel, 100);
      const haystack = `${name} ${subject} ${subtype} ${category}`.toLowerCase();
      if (terms.some((term) => !haystack.includes(term))) continue;
      const parts = [`Subtype: ${subtype}`, `Enabled: ${raw.enabled === false ? 'no' : 'yes'}`];
      if (subject) parts.push(`Subject: ${subject}`);
      if (category) parts.push(`Category: ${category}`);
      if (plan.fields === 'content') {
        const body = plainBody(raw.body || raw.note || raw.content, 700);
        if (body) parts.push(`Content: ${body}`);
        const steps = Array.isArray(raw.steps)
          ? raw.steps.map((step) => plainBody(step?.text || step?.label || step, 160)).filter(Boolean).slice(0, 8)
          : [];
        if (steps.length) parts.push(`Steps: ${steps.join(' | ')}`);
      }
      matches.push({
        kind: plan.source.kind, id,
        label: bounded(`${name} · ${subtype}${subject ? ` · ${subject}` : ''}`, 120),
        summary: bounded(parts.join('. '), 1_200),
        sort: `${name}\u0000${id}`.toLowerCase(),
      });
    }
    return finish(plan, matches);
  }

  function filterResources(storage, request) {
    const plan = planRequest(request);
    const values = storage && typeof storage === 'object'
      ? storage[plan.source.storageKey] : [];
    return plan.target === 'email_templates'
      ? filterEmailTemplates(values, plan)
      : filterNoteTemplates(values, plan);
  }

  function continuationMessage(result) {
    const count = result.resources.length;
    const projection = result.plan.fields === 'content' ? 'metadata and content' : 'metadata only';
    const filter = result.plan.query === '*' ? 'all matching items' : `“${result.plan.query}”`;
    return bounded(
      `Approved one-time access to ${count} matching ${result.plan.source.label} for ${filter} (${projection}). Continue my original request using only these approved results. If the results are ambiguous, ask one focused question instead of guessing.`,
      500,
    );
  }

  root.GBHelpDataAccess = Object.freeze({
    ALLOWED_OPTIONS, SOURCES, planRequest, storageKeys,
    filterResources, filterEmailTemplates, filterNoteTemplates,
    continuationMessage,
  });
})(globalThis);
