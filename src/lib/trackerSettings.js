/**
 * The Trackers settings table — what each row SAYS, apart from how it looks.
 *
 * The worker answers with counts (lib/tracker-store.js `snapshot`); this turns
 * one of those into the row a rep reads: is it on, how much has it collected,
 * when did it last learn anything. Pure, so the wording and the "when is this
 * number worth showing" rules are testable without rendering a settings page.
 *
 * Nothing here names a tracker. A fourth tracker is a fourth object in
 * lib/tracker-definitions.js and it gets a row with no change to this file.
 */

/** How records reach each kind of tracker, in the rep's terms. */
export const TRACKER_ARRIVAL = Object.freeze({
  intercept: 'Captured from the CRM as you work',
  poll: 'Swept on a schedule while a CRM tab is open',
});

const ARRIVAL_FALLBACK = 'Collected in the background';

const count = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * "When did this last do something", in the shortest true form.
 *
 * Deliberately coarse: the rep is answering "is this working?", and a tracker
 * that last collected at 14:02:11 answers that no better than "2h ago".
 */
export function trackerAgo(at, now = Date.now()) {
  const stamp = Number(at) || 0;
  // Nothing collected yet is a real state, and it is not "56 years ago".
  if (stamp <= 0) return 'never';
  const seconds = Math.round((now - stamp) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Worker summaries → table rows.
 *
 * `enabled` is on unless explicitly off, matching the store: a tracker the rep
 * has never had an opinion about is collecting, so its switch must read that
 * way rather than defaulting to off and lying about what is running.
 */
export function trackerTableRows(summaries, { now = Date.now() } = {}) {
  return (Array.isArray(summaries) ? summaries : [])
    .filter((row) => row && row.trackerId)
    .map((row) => {
      const total = count(row.total);
      const open = Math.min(count(row.open), total);
      // Last ACTIVITY, not last record: a scheduled sweep that ran and found
      // nothing is working, and a row reading "3d ago" next to it would say the
      // opposite. What it found is the count's job, one column over.
      const lastActivityAt = Math.max(count(row.updatedAt), count(row.lastPolledAt));
      return {
        trackerId: String(row.trackerId),
        label: String(row.label || row.trackerId),
        kind: String(row.kind || ''),
        arrival: TRACKER_ARRIVAL[row.kind] || ARRIVAL_FALLBACK,
        enabled: row.enabled !== false,
        total,
        open,
        // Only worth a line when something has settled: under a 12, the line
        // "12 open" is noise on every tracker where nothing ever closes.
        showOpen: open < total,
        lastActivityAt,
        lastLabel: trackerAgo(lastActivityAt, now),
      };
    });
}
