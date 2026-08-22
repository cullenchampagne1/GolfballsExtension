/** Owner-side synchronization for persistent email-template shares.
 *
 * Share metadata stays local and the server receives only an RFC-7396-style
 * merge diff against the last acknowledged snapshot. This keeps autosave-only
 * timestamps, folders, import provenance, and sync bookkeeping out of shares.
 */

export const OWNED_EMAIL_SHARE_SYNC_KIND = 'revstack-owned-email-template-shares';

const SHARE_ID = /^[A-Za-z0-9_-]{32}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const LOCAL_FIELDS = new Set([
  'id', 'folderId', 'shareImport', 'shareSync',
  'managedTemplate', 'managedTemplateEnrollment',
  'createdAt', 'updatedAt',
]);

const plainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function templateShareSnapshot(template) {
  const snapshot = {};
  for (const [key, value] of Object.entries(template || {})) {
    if (!LOCAL_FIELDS.has(key) && value !== undefined) snapshot[key] = clone(value);
  }
  return snapshot;
}

/** Undefined means no change. Null inside an object means delete that key. */
export function templateShareDiff(before, after) {
  if (equal(before, after)) return undefined;
  if (!plainObject(before) || !plainObject(after)) return clone(after);
  const patch = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!(key in after)) {
      patch[key] = null;
      continue;
    }
    const change = templateShareDiff(before[key], after[key]);
    if (change !== undefined) patch[key] = change;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function ownedRows(template) {
  const sync = template?.shareSync;
  if (sync?.kind !== OWNED_EMAIL_SHARE_SYNC_KIND || !Array.isArray(sync.owned)) return [];
  return sync.owned.filter((row) => SHARE_ID.test(String(row?.shareId || '')));
}

/** Public, defensive view used by owner-facing UI and revoke flows. */
export function ownedTemplateShares(template) {
  return ownedRows(template).map((row) => ({ ...row }));
}

/** Reconnect shares created before local sync metadata existed. Exact source
 * snapshots win; otherwise a share is attached only when its name/type pair
 * identifies one local template unambiguously. */
export function reconcileOwnedTemplateShares(templates, shares) {
  const next = Array.isArray(templates) ? [...templates] : [];
  let changed = false;
  for (const share of (Array.isArray(shares) ? shares : [])) {
    const remote = share?.relationship === 'owned' ? share.template : null;
    if (!remote || !SHARE_ID.test(String(share?.id || ''))) continue;
    if (next.some((template) => ownedRows(template).some((row) => row.shareId === share.id))) continue;
    const candidates = next.map((template, index) => ({ template, index }))
      .filter(({ template }) => !template?.shareImport
        && String(template?.name || '') === String(remote.name || '')
        && String(template?.type || '') === String(remote.type || ''));
    const exact = candidates.filter(({ template }) => equal(templateShareSnapshot(template), remote));
    const matches = exact.length ? exact : candidates;
    if (matches.length !== 1) continue;
    const { index } = matches[0];
    next[index] = registerOwnedTemplateShare(next[index], share, remote);
    changed = true;
  }
  return { templates: next, changed };
}

export function registerOwnedTemplateShare(template, share, sharedTemplate = template) {
  const shareId = String(share?.id || '');
  if (!SHARE_ID.test(shareId)) throw new Error('Email template share is invalid');
  const row = {
    shareId,
    version: Math.max(1, Number(share?.version) || 1),
    snapshot: templateShareSnapshot(sharedTemplate),
    syncedAt: String(share?.updated_at || share?.created_at || new Date().toISOString()),
  };
  return {
    ...template,
    shareSync: {
      kind: OWNED_EMAIL_SHARE_SYNC_KIND,
      owned: [...ownedRows(template).filter((item) => item.shareId !== shareId), row],
    },
  };
}

export function pendingOwnedTemplateShareUpdates(template, sessionId) {
  if (!SESSION_ID.test(String(sessionId || ''))) return [];
  const snapshot = templateShareSnapshot(template);
  return ownedRows(template).flatMap((row) => {
    const patch = templateShareDiff(row.snapshot || {}, snapshot);
    return patch === undefined ? [] : [{
      shareId: row.shareId,
      version: Math.max(1, Number(row.version) || 1),
      sessionId: String(sessionId),
      patch,
      snapshot,
    }];
  });
}

export function acknowledgeOwnedTemplateShare(template, shareId, snapshot, share) {
  const id = String(shareId || '');
  if (!SHARE_ID.test(id)) return template;
  return {
    ...template,
    shareSync: {
      kind: OWNED_EMAIL_SHARE_SYNC_KIND,
      owned: ownedRows(template).map((row) => (row.shareId === id ? {
        ...row,
        version: Math.max(Number(row.version) || 1, Number(share?.version) || 1),
        snapshot: clone(snapshot),
        syncedAt: String(share?.updated_at || new Date().toISOString()),
      } : row)),
    },
  };
}

export function removeOwnedTemplateShare(template, shareId) {
  const current = ownedRows(template);
  const owned = current.filter((row) => row.shareId !== String(shareId || ''));
  if (owned.length === current.length) return template;
  const next = { ...template };
  if (owned.length) next.shareSync = { kind: OWNED_EMAIL_SHARE_SYNC_KIND, owned };
  else delete next.shareSync;
  return next;
}
