/* ───────────────────────────────────────────────────────────────
   customActionEntryPoints — modal/surface context for custom actions.

   A custom action may declare one or more entry-point tokens. A token can be:
     • a provider id/alias, such as `task-list` or `modal:task-list`;
     • a CSS selector, such as `.gb-task-list-modal`.

   Surfaces register a provider while mounted and expose a lazy `getData()`
   snapshot. The Action Shelf uses the same registry to decide visibility; the
   run host resolves the snapshot only after the user clicks the action. The
   singleton lives on window so independently-built content bundles share it.
─────────────────────────────────────────────────────────────── */

export function normalizeEntryPoints(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\n,]+/) : []);
  const unique = [];
  const seen = new Set();
  for (const item of raw) {
    const token = String(item || '').trim().slice(0, 240);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= 16) break;
  }
  return unique;
}

export function isSelectorEntryPoint(token) {
  const value = String(token || '').trim();
  return value.startsWith('.')
    || value.startsWith('#')
    || value.startsWith('[');
}

function selectorExists(doc, selector) {
  if (!doc || !isSelectorEntryPoint(selector)) return false;
  try {
    return !!doc.querySelector(selector);
  } catch {
    return false;
  }
}

export function createCustomActionEntryPointRegistry() {
  const providers = new Map();
  const subscribers = new Set();

  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };

  return {
    register(provider = {}) {
      const id = String(provider.id || '').trim();
      if (!id) throw new Error('custom action entry point requires an id');
      const normalized = {
        id,
        label: String(provider.label || id),
        aliases: normalizeEntryPoints(provider.aliases),
        modalId: provider.modalId ? String(provider.modalId) : null,
        getData: typeof provider.getData === 'function' ? provider.getData : null,
        onRunComplete: typeof provider.onRunComplete === 'function'
          ? provider.onRunComplete
          : null,
        data: provider.data,
      };
      providers.set(id, normalized);
      notify();
      return () => {
        if (providers.get(id) === normalized) {
          providers.delete(id);
          notify();
        }
      };
    },

    resolve(tokens, doc, { includeData = true } = {}) {
      const requested = normalizeEntryPoints(tokens);
      const matches = [];
      const matchedProviders = new Set();

      for (const token of requested) {
        const provider = [...providers.values()].find((candidate) => (
          candidate.id === token || candidate.aliases.includes(token)
        ));
        if (provider) {
          if (matchedProviders.has(provider.id)) continue;
          matchedProviders.add(provider.id);
          let data = null;
          if (includeData) {
            try {
              data = provider.getData ? provider.getData() : provider.data;
            } catch {
              data = null;
            }
          }
          matches.push({
            id: provider.id,
            label: provider.label,
            token,
            modalId: provider.modalId,
            data: includeData ? (data ?? null) : null,
          });
          continue;
        }

        if (selectorExists(doc, token)) {
          matches.push({
            id: `selector:${token}`,
            label: token,
            token,
            modalId: null,
            data: null,
          });
        }
      }
      return matches;
    },

    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    async notifyRunComplete(entryPoints, detail = {}) {
      const ids = new Set((entryPoints || []).map((entryPoint) => (
        typeof entryPoint === 'string' ? entryPoint : entryPoint?.id
      )).filter(Boolean));
      const callbacks = [...providers.values()]
        .filter((provider) => ids.has(provider.id) && provider.onRunComplete)
        .map((provider) => Promise.resolve().then(() => provider.onRunComplete(detail)));
      await Promise.allSettled(callbacks);
    },

    getProviders() {
      return [...providers.values()].map(({
        getData: _getData,
        onRunComplete: _onRunComplete,
        ...provider
      }) => provider);
    },
  };
}

function resolveSharedRegistry() {
  if (typeof window === 'undefined') return createCustomActionEntryPointRegistry();
  if (!window.__gbCustomActionEntryPoints) {
    window.__gbCustomActionEntryPoints = createCustomActionEntryPointRegistry();
  }
  return window.__gbCustomActionEntryPoints;
}

export const customActionEntryPoints = resolveSharedRegistry();

/** CSS selectors currently referenced by saved actions, used by the shelf's
 * MutationObserver to notice a raw-selector entry point mounting/unmounting. */
export function customActionSelectors(actions) {
  const selectors = [];
  const seen = new Set();
  for (const action of actions || []) {
    for (const token of normalizeEntryPoints(action?.entryPoints)) {
      if (!isSelectorEntryPoint(token) || seen.has(token)) continue;
      seen.add(token);
      selectors.push(token);
    }
  }
  return selectors;
}
