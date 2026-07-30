/* ───────────────────────────────────────────────────────────────
   workflow/runPolicy — shared audience policy for both workflow runners.

   The legacy step runner and the code-first runner must agree on ordering,
   suppression, action caps, and pacing.  Keeping the pure calculations here
   prevents the Workflow Manager UI from displaying controls that only one
   execution path honors.
─────────────────────────────────────────────────────────────── */

/** Return a fresh audience array in the workflow's requested order. */
export function orderWorkflowAudience(audience, order = 'list', random = Math.random) {
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
export function workflowSuppressionReason(workflow, context) {
  if (workflow?.suppressDoNotContact && context?.doNotContact) return 'do-not-contact';
  if (workflow?.suppressBounced && context?.bounceCode) return 'bounced';
  if (workflow?.suppressMailerRemoved && context?.mailerRemoved) return 'mailer-removed';
  return null;
}

/** Milliseconds between live actions, including the configured jitter. */
export function workflowPaceMs(workflow, random = Math.random) {
  const base = Math.max(0, Number(workflow?.paceDelay) || 0) * 1_000;
  const jitter = Math.max(0, Number(workflow?.paceJitter) || 0) * 1_000;
  return Math.max(0, base + (jitter ? (random() * 2 - 1) * jitter : 0));
}

/** Zero means unlimited. */
export function workflowActionCap(workflow) {
  return Math.max(0, Math.floor(Number(workflow?.sendCap) || 0));
}
