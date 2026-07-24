/** Extension-owned notification payload interpreter.
 *
 * The backend stores only a bounded option label and opaque payload text. This
 * module is the sole authority that parses a payload, validates a command, and
 * maps it to code already compiled into the extension. Adding a future action
 * requires only an extension-side command registration; the backend contract
 * remains unchanged.
 */
(function installNotificationActions(root) {
  'use strict';

  const commands = new Map();
  const handlers = new Map();
  const COMMAND = /^[a-z][a-z0-9_]{1,63}$/;
  const EMAIL = /^[^@\s]{1,128}@[^@\s]{1,190}$/;
  const safeText = (value, maximum) => (
    String(value == null ? '' : value).trim().slice(0, maximum)
  );

  function registerCommand(command, normalizePayload) {
    const id = String(command || '').trim().toLowerCase();
    if (!COMMAND.test(id) || typeof normalizePayload !== 'function' || commands.has(id)) {
      throw new Error(`Invalid or duplicate notification command: ${id}`);
    }
    commands.set(id, normalizePayload);
    return id;
  }

  function parsePayload(value) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || text.length > 4_000) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : null;
  }

  function legacyPayload(value) {
    const type = String(value?.type || '').trim().toLowerCase();
    const args = value?.arguments && typeof value.arguments === 'object'
      ? value.arguments
      : {};
    if (type === 'open_mockup_batch') {
      return {
        command: type,
        batch_id: args.batch_id || value.batch_id,
      };
    }
    if (type === 'open_contact') {
      return {
        command: type,
        contact_email: args.contact_email || value.contact_email,
        message_id: args.message_id || value.message_id,
      };
    }
    if (type === 'open_support_ticket') {
      return {
        command: type,
        ticket_id: args.ticket_id || value.ticket_id,
      };
    }
    return null;
  }

  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const isLegacy = typeof value.type === 'string';
    if (!isLegacy && Object.keys(value).some(
      // `command` is derived by this interpreter for short-lived local cache
      // rows produced by the previous build. It is never required from the
      // backend and is checked against the parsed payload below.
      (key) => !['label', 'payload', 'command'].includes(key),
    )) return null;
    const rawPayload = isLegacy ? legacyPayload(value) : parsePayload(value.payload);
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return null;
    }
    const command = safeText(rawPayload.command, 64).toLowerCase();
    const cachedCommand = safeText(value.command, 64).toLowerCase();
    if (cachedCommand && cachedCommand !== command) return null;
    const commandNormalizer = commands.get(command);
    if (!commandNormalizer) return null;
    let payload;
    try {
      payload = commandNormalizer(rawPayload);
    } catch {
      return null;
    }
    if (!payload || typeof payload !== 'object' || payload.command !== command) {
      return null;
    }
    return Object.freeze({
      label: safeText(value.label || 'Open', 48) || 'Open',
      payload: JSON.stringify(payload),
      command,
    });
  }

  function registerHandler(command, environment, handler) {
    const id = String(command || '').trim().toLowerCase();
    const scope = String(environment || '').trim().toLowerCase();
    if (!commands.has(id) || !scope || typeof handler !== 'function') {
      throw new Error('Invalid notification payload handler');
    }
    handlers.set(`${scope}:${id}`, handler);
  }

  function canExecute(action, environment) {
    const normalized = normalize(action);
    if (!normalized) return false;
    return handlers.has(
      `${String(environment || '').trim().toLowerCase()}:${normalized.command}`,
    );
  }

  function execute(action, environment, context = {}) {
    const normalized = normalize(action);
    if (!normalized) return false;
    const handler = handlers.get(
      `${String(environment || '').trim().toLowerCase()}:${normalized.command}`,
    );
    if (!handler) return false;
    return handler(JSON.parse(normalized.payload), context);
  }

  function catalog() {
    return [...commands.keys()].sort();
  }

  registerCommand('open_mockup_batch', (payload) => {
    const extras = Object.keys(payload).filter(
      (key) => !['command', 'batch_id'].includes(key),
    );
    const batchId = safeText(payload.batch_id, 40);
    if (extras.length || !/^batch_[a-f0-9]{32}$/.test(batchId)) return null;
    return { command: 'open_mockup_batch', batch_id: batchId };
  });

  registerCommand('open_contact', (payload) => {
    const extras = Object.keys(payload).filter(
      (key) => !['command', 'contact_email', 'message_id'].includes(key),
    );
    const contactEmail = safeText(payload.contact_email, 320).toLowerCase();
    const messageId = safeText(payload.message_id, 180);
    if (extras.length || !EMAIL.test(contactEmail)) return null;
    return {
      command: 'open_contact',
      contact_email: contactEmail,
      ...(messageId ? { message_id: messageId } : {}),
    };
  });

  registerCommand('open_support_ticket', (payload) => {
    const extras = Object.keys(payload).filter(
      (key) => !['command', 'ticket_id'].includes(key),
    );
    const ticketId = safeText(payload.ticket_id, 20);
    if (extras.length || !/^GBT-[A-Z0-9]{6,16}$/.test(ticketId)) return null;
    return { command: 'open_support_ticket', ticket_id: ticketId };
  });

  root.GBNotificationActions = Object.freeze({
    registerCommand,
    normalize,
    registerHandler,
    canExecute,
    execute,
    catalog,
  });
})(globalThis);
