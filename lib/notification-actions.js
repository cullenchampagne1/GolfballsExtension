/** Registered, typed notification actions.
 *
 * The backend ships only {type, version, label, arguments}. This registry
 * validates that envelope and dispatches it to a handler compiled into the
 * extension. Server payloads can select registered behavior, but can never
 * ship JavaScript, arbitrary URLs, or a new executable action.
 */
(function installNotificationActions(root) {
  'use strict';

  const definitions = new Map();
  const handlers = new Map();
  const TYPE = /^[a-z][a-z0-9_]{1,63}$/;
  const EMAIL = /^[^@\s]{1,128}@[^@\s]{1,190}$/;
  const safeText = (value, maximum) => String(value || '').trim().slice(0, maximum);

  function register(definition) {
    const type = String(definition?.type || '').trim().toLowerCase();
    if (!TYPE.test(type) || definitions.has(type)) {
      throw new Error(`Invalid or duplicate notification action: ${type}`);
    }
    const rawArguments = definition?.arguments;
    const argumentsSchema = {};
    for (const [name, specValue] of Object.entries(
      rawArguments && typeof rawArguments === 'object' ? rawArguments : {},
    )) {
      const spec = specValue && typeof specValue === 'object' ? specValue : {};
      argumentsSchema[name] = {
        required: spec.required === true,
        maxLength: Math.max(1, Math.min(4_000, Number(spec.maxLength) || 500)),
        pattern: spec.pattern instanceof RegExp ? spec.pattern : null,
        format: spec.format === 'email' ? 'email' : 'text',
      };
    }
    const normalized = Object.freeze({
      type,
      version: 1,
      title: safeText(definition.title || type, 120),
      defaultLabel: safeText(definition.defaultLabel || 'Open', 48),
      arguments: Object.freeze(argumentsSchema),
      legacyFields: Object.freeze({ ...(definition.legacyFields || {}) }),
    });
    definitions.set(type, normalized);
    return normalized;
  }

  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const type = String(value.type || '').trim().toLowerCase();
    const definition = definitions.get(type);
    if (!definition || Number(value.version || 1) !== definition.version) return null;
    const allowedTopLevel = new Set([
      'type',
      'version',
      'label',
      'arguments',
      ...Object.keys(definition.legacyFields),
    ]);
    if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) return null;
    const raw = value.arguments && typeof value.arguments === 'object'
      && !Array.isArray(value.arguments)
      ? value.arguments
      : {};
    const legacy = definition.legacyFields;
    const args = { ...raw };
    for (const [wireKey, localKey] of Object.entries(legacy)) {
      if (!(localKey in args) && wireKey in value) args[localKey] = value[wireKey];
    }
    if (Object.keys(args).some((key) => !(key in definition.arguments))) return null;
    const normalizedArguments = {};
    for (const [name, spec] of Object.entries(definition.arguments)) {
      const text = safeText(args[name], spec.maxLength);
      if (!text) {
        if (spec.required) return null;
        continue;
      }
      if (spec.format === 'email' && !EMAIL.test(text)) return null;
      if (spec.pattern && !spec.pattern.test(text)) return null;
      normalizedArguments[name] = spec.format === 'email' ? text.toLowerCase() : text;
    }
    return Object.freeze({
      type,
      version: definition.version,
      label: safeText(value.label || definition.defaultLabel, 48),
      arguments: Object.freeze(normalizedArguments),
    });
  }

  function registerHandler(type, environment, handler) {
    const actionType = String(type || '').trim().toLowerCase();
    const scope = String(environment || '').trim().toLowerCase();
    if (!definitions.has(actionType) || !scope || typeof handler !== 'function') {
      throw new Error('Invalid notification action handler');
    }
    handlers.set(`${scope}:${actionType}`, handler);
  }

  function execute(action, environment, context = {}) {
    const normalized = normalize(action);
    if (!normalized) return false;
    const handler = handlers.get(
      `${String(environment || '').trim().toLowerCase()}:${normalized.type}`,
    );
    if (!handler) return false;
    return handler(normalized, context);
  }

  function catalog() {
    return [...definitions.values()].map((definition) => ({
      type: definition.type,
      version: definition.version,
      title: definition.title,
      defaultLabel: definition.defaultLabel,
      arguments: Object.keys(definition.arguments),
    }));
  }

  register({
    type: 'open_mockup_batch',
    title: 'Open mockup batch',
    defaultLabel: 'Open gallery',
    arguments: {
      batch_id: {
        required: true,
        maxLength: 40,
        pattern: /^batch_[a-f0-9]{32}$/,
      },
    },
    legacyFields: { batch_id: 'batch_id' },
  });
  register({
    type: 'open_contact',
    title: 'Open CRM contact',
    defaultLabel: 'Open contact',
    arguments: {
      contact_email: {
        required: true,
        maxLength: 320,
        format: 'email',
      },
      message_id: { required: false, maxLength: 180 },
    },
    legacyFields: {
      contact_email: 'contact_email',
      message_id: 'message_id',
    },
  });
  register({
    type: 'open_support_ticket',
    title: 'Open support ticket',
    defaultLabel: 'View ticket',
    arguments: {
      ticket_id: {
        required: true,
        maxLength: 20,
        pattern: /^GBT-[A-Z0-9]{6,16}$/,
      },
    },
    legacyFields: { ticket_id: 'ticket_id' },
  });

  root.GBNotificationActions = Object.freeze({
    register,
    normalize,
    registerHandler,
    execute,
    catalog,
  });
})(globalThis);
