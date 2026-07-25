/** Environment-scoped executor for Golfballs Toolkit Action Language payloads.
 *
 * The action language validates the bounded wire envelope. This runtime maps a
 * registered command to code already compiled into the current extension.
 * Backends can request commands; they can never ship executable code.
 */
(function installActionRuntime(root) {
  'use strict';
  if (root.GBActionRuntime) return;
  const language = root.GBActionLanguage;
  if (!language) throw new Error('Golfballs action language must load first');

  const handlers = new Map();

  function registerHandler(command, environment, handler) {
    const id = String(command || '').trim().toLowerCase();
    const scope = String(environment || '').trim().toLowerCase();
    if (!language.hasCommand(id) || !scope || typeof handler !== 'function') {
      throw new Error('Invalid action payload handler');
    }
    handlers.set(`${scope}:${id}`, handler);
  }

  function canExecute(value, environment) {
    let action;
    try { action = language.normalize(value); } catch { return false; }
    return handlers.has(
      `${String(environment || '').trim().toLowerCase()}:${action.command}`,
    );
  }

  function execute(value, environment, context = {}) {
    let action;
    try { action = language.normalize(value); } catch { return false; }
    const handler = handlers.get(
      `${String(environment || '').trim().toLowerCase()}:${action.command}`,
    );
    if (!handler) return false;
    return handler(action, context);
  }

  const api = Object.freeze({
    normalize: language.normalize,
    serialize: language.serialize,
    registerHandler,
    canExecute,
    execute,
    catalog: language.commands,
  });
  root.GBActionRuntime = api;
  // One-release compatibility alias for code/cache rows produced immediately
  // before the runtime became extension-wide instead of notification-specific.
  root.GBNotificationActions = api;
})(globalThis);
