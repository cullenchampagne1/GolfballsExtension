/** Shared visibility policy for Settings sections backed by remote rows. */
export function shouldShowManagedSection(rows, loading) {
  return loading !== true && Array.isArray(rows) && rows.length > 0;
}
