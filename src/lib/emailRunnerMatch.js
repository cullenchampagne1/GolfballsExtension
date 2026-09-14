import { isGroupedTree } from './matchEngine.js';
import { matchesCachedEntity } from './crmCacheQuery.js';

/** Number of real match predicates authored on a template. Empty grouped
 * shells are common after opening the editor and must behave like no gate. */
export function templateMatchConditionCount(template) {
  const tree = template?.type === 'account' ? template?.accountConditions : template?.rules;
  if (isGroupedTree(tree)) {
    return (Array.isArray(tree.groups) ? tree.groups : []).reduce(
      (total, group) => total + (Array.isArray(group?.conditions) ? group.conditions.length : 0),
      0,
    );
  }
  return Array.isArray(tree) ? tree.length : 0;
}

/* ───────────────────────────────────────────────────────────────
   emailRunnerMatch.js — the "Matched Only" gate for EmailRunner's
   bulk-send loop.

   Task lists and CRM search results are NOT re-filtered by a
   template's own match rules (rules / accountConditions) — a rep can
   queue any row for any template. "Matched Only" re-checks those
   rules against each row right before it would send, so a send only
   goes out when the row genuinely satisfies the template's own
   matching logic, the same way the popup / email creation preview
   would report it as matched.

   A row can carry one of three data shapes, mirroring EmailRunner's
   own resolution order (see EmailRunner.jsx's per-contact loop):
     - cachedSnapshot  an extracted Page Engine snapshot (JSON, no
                       DOM). Only the grouped rule format can be
                       evaluated against it (matchesCachedEntity) —
                       legacy flat rules read DOM elements a snapshot
                       doesn't carry.
     - fetchedText     raw HTML fetched for the row. Evaluated via
                       resolveMatchForHtml (window.__gbResolveMatchForHtml,
                       injectable here for tests), which parses it the
                       same way the live popup's matcher does, so both
                       grouped AND legacy rule formats work.
     - imported        a CSV-imported contact with no page at all —
                       there is nothing to evaluate rules against.

   When the rules genuinely can't be evaluated (an imported row, or
   legacy rules with only a cached snapshot), the row is treated as
   NOT matched. "Matched Only" is an opt-in safety check — an
   unverifiable row fails closed instead of silently sending.
─────────────────────────────────────────────────────────────── */

/**
 * @param {object} input
 * @param {object} input.template        The selected email template (rules /
 *   accountConditions live on it, selected per template's `type`).
 * @param {object|null} [input.cachedSnapshot]  Page Engine snapshot for this row, if any.
 * @param {string} [input.fetchedText]    Raw fetched HTML for this row, if any.
 * @param {string} [input.baseUrl]        The row's contact URL (for relative links).
 * @param {boolean} [input.imported]      True for CSV-imported rows (no page).
 * @param {object} [deps]
 * @param {Function} [deps.resolveMatchForHtml]  Defaults to window.__gbResolveMatchForHtml.
 * @returns {Promise<{ matched: boolean, reason: string, evaluated: boolean }>}
 */
export async function resolveMatchedOnlyOutcome(
  { template, cachedSnapshot = null, fetchedText = '', baseUrl = '', imported = false } = {},
  { resolveMatchForHtml = (typeof window !== 'undefined' ? window.__gbResolveMatchForHtml : null) } = {},
) {
  const tree = template?.type === 'account' ? template?.accountConditions : template?.rules;
  // Logical AND over zero predicates is true. More importantly for the UI,
  // selecting Require a rule match on a template with no authored rules must
  // not turn every recipient into an unverifiable failure.
  if (templateMatchConditionCount(template) === 0) {
    return { matched: true, reason: '', evaluated: false };
  }

  if (cachedSnapshot) {
    if (!isGroupedTree(tree)) {
      return { matched: false, reason: 'Cached page data can’t verify legacy match rules', evaluated: false };
    }
    const matched = await matchesCachedEntity(cachedSnapshot, tree);
    return { matched: !!matched, reason: matched ? '' : 'Did not match template rules', evaluated: true };
  }

  if (imported) {
    return { matched: false, reason: 'Imported rows have no page to verify match rules against', evaluated: false };
  }

  if (!fetchedText) {
    return { matched: false, reason: 'No page data to verify match rules against', evaluated: false };
  }

  if (typeof resolveMatchForHtml !== 'function') {
    return { matched: false, reason: 'Match engine unavailable on this page', evaluated: false };
  }

  const result = await resolveMatchForHtml(fetchedText, template, baseUrl);
  if (result?.error) {
    return { matched: false, reason: `Match check failed: ${result.error}`, evaluated: false };
  }
  return {
    matched: !!result?.matched,
    reason: result?.matched ? '' : 'Did not match template rules',
    evaluated: true,
  };
}
