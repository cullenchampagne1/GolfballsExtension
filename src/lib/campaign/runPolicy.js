/* ───────────────────────────────────────────────────────────────
   campaign/runPolicy — shared audience policy for both campaign runners.

   The legacy step runner and the code-first runner must agree on ordering,
   suppression, action caps, and pacing.  Keeping the pure calculations here
   prevents the Campaign Manager UI from displaying controls that only one
   execution path honors.
─────────────────────────────────────────────────────────────── */

/** Return a fresh audience array in the campaign's requested order. */
export function orderCampaignAudience(audience, order = 'list', random = Math.random) {
  const rows = Array.isArray(audience) ? audience.slice() : [];
  if (order === 'shuffle') {
    for (let i = rows.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    return rows;
  }
  if (order === 'valueDesc') {
    const valueOf = (row) => Number(row?.value ?? row?.ytd ?? 0) || 0;
    return rows.sort((a, b) => valueOf(b) - valueOf(a));
  }
  return rows;
}

/** Which delivery guard suppresses this hydrated record, if any. */
export function campaignSuppressionReason(campaign, context) {
  if (campaign?.suppressDoNotContact && context?.doNotContact) return 'do-not-contact';
  if (campaign?.suppressBounced && context?.bounceCode) return 'bounced';
  if (campaign?.suppressMailerRemoved && context?.mailerRemoved) return 'mailer-removed';
  return null;
}

/** Milliseconds between live actions, including the configured jitter. */
export function campaignPaceMs(campaign, random = Math.random) {
  const base = Math.max(0, Number(campaign?.paceDelay) || 0) * 1_000;
  const jitter = Math.max(0, Number(campaign?.paceJitter) || 0) * 1_000;
  return Math.max(0, base + (jitter ? (random() * 2 - 1) * jitter : 0));
}

/** Zero means unlimited. */
export function campaignActionCap(campaign) {
  return Math.max(0, Math.floor(Number(campaign?.sendCap) || 0));
}
