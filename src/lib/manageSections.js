/** Shared visibility policy for Settings sections backed by remote rows. */
export function shouldShowManagedSection(rows, loading) {
  return loading !== true && Array.isArray(rows) && rows.length > 0;
}

/**
 * A temporary backend outage must not erase rows that were already rendered.
 * Initial loads still settle to an empty list, while refresh failures retain
 * the last usable snapshot without introducing a separate outage state.
 */
export function retainManagedRowsOnFailure(rows) {
  return Array.isArray(rows) ? rows : [];
}

/** Describe the successful local fallback without exposing infrastructure. */
export function settingsJsonFallbackMessage(name) {
  const label = String(name || '').trim().replace(/\s+/g, ' ');
  return label
    ? `Downloaded "${label}" as a JSON settings template`
    : 'Downloaded a JSON settings template';
}
