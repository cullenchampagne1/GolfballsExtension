/** Golfballs Toolkit Action Language v1.
 *
 * One bounded JSON envelope crosses every extension action surface: Help
 * Companion cards, notification actions, and future registered UI commands.
 * This module understands syntax only. The environment-specific runtime and
 * the live feature/settings registries decide whether an action may execute.
 *
 * Classic-script IIFE so the MV3 worker can use importScripts(), content
 * scripts can load it before bundled UI, and ESM modules can import it for its
 * side effect through src/lib/actionLanguage.js.
 */
(function installActionLanguage(root) {
  'use strict';
  if (root.GBActionLanguage) return;

  const VERSION = 1;
  const COMMAND_RE = /^[a-z][a-z0-9_]{1,63}$/;
  const COMMANDS = Object.freeze([
    'open_guide',
    'open_settings',
    'open_modal',
    'show_shortcut',
    'copy_text',
    'set_feature',
    'set_setting',
    'set_theme_preset',
    'set_theme_palette',
    'share_settings',
    'share_email_template',
    'request_data_access',
    'submit_ticket',
    'open_mockup_batch',
    'open_contact',
    'open_support_ticket',
  ]);
  const COMMAND_SET = new Set(COMMANDS);
  const CANONICAL_FIELDS = new Set([
    'version', 'command', 'type', 'target', 'value', 'options', 'label',
    'references',
  ]);
  const WRAPPER_FIELDS = new Set([
    'payload', 'type', 'command', 'target', 'value', 'options', 'label',
    'references', 'receipt_id', 'receiptId', 'citation_id', 'citationId',
  ]);
  const LEGACY_NOTIFICATION_FIELDS = new Set([
    'type', 'command', 'version', 'label', 'arguments',
    'batch_id', 'contact_email', 'message_id', 'ticket_id',
  ]);

  const bounded = (value, maximum) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maximum);

  function fail(message) {
    throw new Error(message);
  }

  function parse(value) {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text || text.length > 4_000) fail('The action payload is empty or too large');
    try {
      return JSON.parse(text);
    } catch {
      fail('The action payload must be valid JSON');
    }
  }

  function normalizeReference(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const path = bounded(value.path, 300);
    const lineStart = Math.max(
      1,
      Math.floor(Number(value.line_start ?? value.lineStart) || 0),
    );
    const lineEnd = Math.max(
      lineStart,
      Math.floor(Number(value.line_end ?? value.lineEnd) || 0),
    );
    if (
      !/^[A-Za-z0-9_./-]{1,300}$/.test(path)
      || path.startsWith('/')
      || path.split('/').includes('..')
      || lineEnd > 10_000_000
    ) return null;
    return Object.freeze({
      path,
      line_start: lineStart,
      line_end: lineEnd,
    });
  }

  function normalizeValue(value) {
    if (value == null) return '';
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('The action value must be finite');
      return value;
    }
    if (typeof value === 'string') return bounded(value, 500);
    fail('The action value must be a string, number, boolean, or null');
  }

  function legacyNotification(value) {
    const command = bounded(value.command || value.type, 64).toLowerCase();
    if (!['open_mockup_batch', 'open_contact', 'open_support_ticket'].includes(command)) {
      return null;
    }
    const extras = Object.keys(value).filter(
      (key) => !LEGACY_NOTIFICATION_FIELDS.has(key),
    );
    if (extras.length) fail(`Unsupported action payload field: ${extras[0]}`);
    const args = value.arguments && typeof value.arguments === 'object'
      && !Array.isArray(value.arguments)
      ? value.arguments
      : {};
    if (command === 'open_mockup_batch') {
      return {
        version: VERSION,
        command,
        target: args.batch_id || value.batch_id,
        value: '',
        options: [],
        label: value.label,
      };
    }
    if (command === 'open_contact') {
      return {
        version: VERSION,
        command,
        target: args.contact_email || value.contact_email,
        value: args.message_id || value.message_id || '',
        options: [],
        label: value.label,
      };
    }
    return {
      version: VERSION,
      command,
      target: args.ticket_id || value.ticket_id,
      value: '',
      options: [],
      label: value.label,
    };
  }

  function normalizeEnvelope(input) {
    const value = parse(input);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('The action payload must be an object');
    }
    const legacy = (
      Object.hasOwn(value, 'arguments')
      || Object.hasOwn(value, 'batch_id')
      || Object.hasOwn(value, 'contact_email')
      || Object.hasOwn(value, 'message_id')
      || Object.hasOwn(value, 'ticket_id')
    ) ? legacyNotification(value) : null;
    const raw = legacy || value;
    const extras = Object.keys(raw).filter((key) => !CANONICAL_FIELDS.has(key));
    if (extras.length) fail(`Unsupported action payload field: ${extras[0]}`);

    const version = Number(raw.version ?? VERSION);
    if (version !== VERSION) fail(`Unsupported action payload version: ${version}`);
    const command = bounded(raw.command || raw.type, 64).toLowerCase();
    if (!COMMAND_RE.test(command) || !COMMAND_SET.has(command)) {
      fail('The action command is not registered in this build');
    }
    const targetMaximum = command === 'copy_text' ? 4_000 : 500;
    const target = bounded(raw.target, targetMaximum);
    if (!target) fail('The action target is required');
    const options = Array.isArray(raw.options)
      ? [...new Set(
        raw.options.slice(0, 16).map((item) => bounded(item, 120)).filter(Boolean),
      )]
      : [];
    if (raw.options != null && !Array.isArray(raw.options)) {
      fail('The action options must be an array');
    }
    const references = Array.isArray(raw.references)
      ? raw.references.slice(0, 6).map(normalizeReference).filter(Boolean)
      : [];
    if (raw.references != null && !Array.isArray(raw.references)) {
      fail('The action references must be an array');
    }
    return Object.freeze({
      version: VERSION,
      command,
      target,
      value: normalizeValue(raw.value),
      options: Object.freeze(options),
      label: bounded(raw.label, 100),
      references: Object.freeze(references),
    });
  }

  function comparable(value) {
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    return bounded(value, 500);
  }

  function normalize(value) {
    const raw = parse(value);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail('The action payload must be an object');
    }
    if (!Object.hasOwn(raw, 'payload')) {
      const wrapperExtras = Object.keys(raw).filter(
        (key) => !CANONICAL_FIELDS.has(key)
          && !LEGACY_NOTIFICATION_FIELDS.has(key),
      );
      if (!wrapperExtras.length) return normalizeEnvelope(raw);
      if (wrapperExtras.some((key) => !WRAPPER_FIELDS.has(key))) {
        fail(`Unsupported action payload field: ${wrapperExtras[0]}`);
      }
      return normalizeEnvelope({
        version: raw.version,
        command: raw.command || raw.type,
        target: raw.target,
        value: raw.value,
        options: raw.options,
        label: raw.label,
        references: raw.references,
      });
    }
    const extras = Object.keys(raw).filter((key) => !WRAPPER_FIELDS.has(key));
    if (extras.length) fail(`Unsupported action wrapper field: ${extras[0]}`);
    const action = normalizeEnvelope(raw.payload);
    const wrapperCommand = bounded(raw.command || raw.type, 64).toLowerCase();
    if (wrapperCommand && wrapperCommand !== action.command) {
      fail('The visible action does not match its payload command');
    }
    const wrapperTarget = bounded(raw.target, action.command === 'copy_text' ? 4_000 : 500);
    if (wrapperTarget && wrapperTarget !== action.target) {
      fail('The visible action does not match its payload target');
    }
    if (
      Object.hasOwn(raw, 'value')
      && raw.value !== ''
      && comparable(raw.value) !== comparable(action.value)
    ) {
      fail('The visible action does not match its payload value');
    }
    if (
      Array.isArray(raw.options)
      && raw.options.length
      && JSON.stringify(raw.options.map(String)) !== JSON.stringify(action.options)
    ) {
      fail('The visible action does not match its payload options');
    }
    if (!action.label && raw.label) {
      return Object.freeze({ ...action, label: bounded(raw.label, 100) });
    }
    return action;
  }

  function serialize(value) {
    const action = normalize(value);
    return JSON.stringify({
      version: action.version,
      command: action.command,
      target: action.target,
      value: action.value,
      options: [...action.options],
      ...(action.label ? { label: action.label } : {}),
      ...(action.references.length ? {
        references: action.references.map((item) => ({ ...item })),
      } : {}),
    });
  }

  function toAssistantAction(value, extra = {}) {
    const action = normalize(value);
    return {
      ...extra,
      type: action.command,
      target: action.target,
      value: String(action.value == null ? '' : action.value),
      options: [...action.options],
      label: action.label || bounded(extra.label, 100) || 'Open',
      references: action.references.map((item) => ({ ...item })),
      payload: serialize(action),
    };
  }

  const api = Object.freeze({
    version: VERSION,
    commands: () => [...COMMANDS],
    hasCommand: (command) => COMMAND_SET.has(
      bounded(command, 64).toLowerCase(),
    ),
    normalize,
    serialize,
    toAssistantAction,
  });
  root.GBActionLanguage = api;
})(globalThis);
