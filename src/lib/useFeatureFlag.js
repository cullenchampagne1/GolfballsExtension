import { useEffect, useState } from 'react';

/* ───────────────────────────────────────────────────────────────
   useFeatureFlag(name, defaultValue?)

   React hook for reading a single flag out of
   chrome.storage.local.featureFlags. Updates live when the popup
   (or any other surface) flips the flag — listens to the
   chrome.storage.onChanged event for the duration of the
   component's lifetime.

   Outside an extension context (e.g. the playground), `chrome` is
   not defined; we just return `defaultValue` so the consumer
   behaves the way it would on a fresh install with the flag
   unset. Default of `true` is "feature is on unless explicitly
   disabled" — matches the convention everywhere else in this
   codebase (see content/margin-calc.jsx for the same pattern).

   Returns `true` when the stored value is anything other than
   the literal `false`; missing keys count as enabled.
─────────────────────────────────────────────────────────────── */
export function useFeatureFlag(name, defaultValue = true) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const hasChrome = typeof chrome !== 'undefined' && chrome?.storage?.local?.get;
    if (!hasChrome) {
      setValue(defaultValue);
      return undefined;
    }

    let alive = true;

    chrome.storage.local.get('featureFlags', (data) => {
      if (!alive) return;
      const flags = data?.featureFlags || {};
      setValue(flags[name] !== false);
    });

    const onChanged = (changes, area) => {
      if (area !== 'local' || !changes.featureFlags) return;
      const next = changes.featureFlags.newValue || {};
      setValue(next[name] !== false);
    };
    chrome.storage?.onChanged?.addListener?.(onChanged);

    return () => {
      alive = false;
      chrome.storage?.onChanged?.removeListener?.(onChanged);
    };
  }, [name, defaultValue]);

  return value;
}
