import { arrayQuantifier, evalTree, isValuelessOp } from './matchEngine.js';
import { queryEngineIndex } from './page-engine/index-client.js';
import { resolve } from './page-engine/resolve.js';

const NO_CACHE_MATCH_ID = '__gb_no_cached_account_match__';

function conditionsIn(tree) {
  return (tree?.groups || []).flatMap((group) => (
    Array.isArray(group?.conditions) ? group.conditions.filter(Boolean) : []
  ));
}

/**
 * Distinguish a disabled/empty cache layer from a partially authored rule.
 * Query Builder uses this before touching the encrypted index so an empty
 * subject/value never turns into a surprising broad query.
 */
export function cacheRuleTreeStatus(tree) {
  const conditions = conditionsIn(tree);
  if (!conditions.length) return { active: false, valid: true, count: 0, reason: '' };
  if (conditions.some((condition) => !String(condition.ref || '').trim())) {
    return {
      active: true,
      valid: false,
      count: conditions.length,
      reason: 'Choose a cached field for every cache condition.',
    };
  }
  if (conditions.some((condition) => (
    !isValuelessOp(condition.op) && String(condition.value ?? '').trim() === ''
  ))) {
    return {
      active: true,
      valid: false,
      count: conditions.length,
      reason: 'Enter a value for every cache condition that needs one.',
    };
  }
  return { active: true, valid: true, count: conditions.length, reason: '' };
}

function quantifiedValues(data, ref) {
  const quantifier = arrayQuantifier(ref);
  if (!quantifier) return resolve(data, ref, '');
  const match = /^(.*?)\[(?:any|none)\](?:\.(.*))?$/.exec(ref);
  if (!match) return [];
  const items = resolve(data, match[1], []);
  if (!Array.isArray(items)) return [];
  const suffix = match[2] || '';
  return suffix ? items.map((item) => resolve(item, suffix, '')) : items;
}

/** Evaluate the shared grouped match-rule shape against one cached snapshot. */
export async function matchesCachedAccount(snapshot, tree) {
  const entityType = String(snapshot?.schemaId || snapshot?.entityType || '').toLowerCase();
  if (entityType !== 'account') return false;
  const data = snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : {};
  return evalTree(tree, (condition) => quantifiedValues(data, condition?.ref || ''));
}

function quoteSolrTerm(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Compile raw Page Engine account IDs into the CRM Solr row-id namespace. */
export function cachedAccountIdFilter(accountIds) {
  const ids = [...new Set((accountIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return `id:${quoteSolrTerm(NO_CACHE_MATCH_ID)}`;
  const terms = ids.map((id) => quoteSolrTerm(`account_${id}`));
  return terms.length === 1 ? `id:${terms[0]}` : `id:(${terms.join(' OR ')})`;
}

export function combineCrmFilterFq(nativeSolrFq, cacheSolrFq) {
  const native = String(nativeSolrFq || '').trim();
  const cached = String(cacheSolrFq || '').trim();
  if (!native) return cached;
  if (!cached) return native;
  return `(${native}) AND (${cached})`;
}

/**
 * Walk every encrypted Page Engine snapshot, evaluate the richer grouped rules
 * locally, and turn matches into a server-side CRM filter. The CRM query still
 * owns pagination/facets/sorting; this module only supplies the eligible IDs.
 */
export async function resolveCachedAccountFilter(
  tree,
  { query = queryEngineIndex, pageSize = 500 } = {},
) {
  const status = cacheRuleTreeStatus(tree);
  if (!status.active || !status.valid) {
    throw new Error(status.reason || 'Add at least one complete cached-account condition.');
  }

  const limit = Math.max(1, Math.min(500, Math.trunc(Number(pageSize) || 500)));
  const accountIds = [];
  const seenSnapshots = new Set();
  const seenAccountIds = new Set();
  let scannedSnapshots = 0;
  let offset = 0;
  let expectedMatches = null;

  // The index has a 500-row response ceiling. Offset + scanAll guarantees the
  // rules see the whole local cache, not just its newest window.
  for (;;) {
    const answer = await query({ limit, offset, scanAll: true });
    if (answer?.ok === false) throw new Error(answer.error || 'Unable to query the Page Engine cache.');
    const rows = Array.isArray(answer?.rows) ? answer.rows : [];
    if (expectedMatches == null && Number.isFinite(Number(answer?.matched))) {
      expectedMatches = Math.max(0, Number(answer.matched));
    }
    scannedSnapshots += rows.length;

    let fresh = 0;
    for (const snapshot of rows) {
      const snapshotKey = `${snapshot?.schemaId || snapshot?.entityType || ''}:${snapshot?.id || ''}`;
      if (seenSnapshots.has(snapshotKey)) continue;
      seenSnapshots.add(snapshotKey);
      fresh += 1;
      if (!(await matchesCachedAccount(snapshot, tree))) continue;
      const id = String(snapshot?.id || '').trim();
      if (!id || seenAccountIds.has(id)) continue;
      seenAccountIds.add(id);
      accountIds.push(id);
    }

    offset += rows.length;
    if (!rows.length || !fresh || rows.length < limit) break;
    if (expectedMatches != null && offset >= expectedMatches) break;
  }

  return {
    accountIds,
    matchedAccounts: accountIds.length,
    scannedSnapshots,
    solrFq: cachedAccountIdFilter(accountIds),
  };
}
