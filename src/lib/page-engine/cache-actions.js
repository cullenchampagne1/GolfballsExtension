/* Page Engine snapshot lookup for CRM Search bulk actions.
 *
 * CRM Search rows are deliberately small pointers. When the rep opts into
 * cached execution, this module resolves those pointers against the encrypted
 * Page Engine index and attaches the already-extracted snapshot in memory.
 * Missing rows stay untouched so the normal live-page fetch remains the
 * per-contact fallback.
 */
import { queryEngineIndex } from './index-client.js';

const SUPPORTED_SCHEMAS = new Set(['contact', 'account']);
const LOOKUP_CHUNK_SIZE = 200;

function text(value) {
  return value == null ? '' : String(value).trim();
}

export function pageEngineIdentity(schemaId, id) {
  const schema = text(schemaId).toLowerCase();
  const recordId = text(id);
  if (!SUPPORTED_SCHEMAS.has(schema) || !recordId) return null;
  return Object.freeze({ schemaId: schema, id: recordId });
}

export function pageEngineIdentityForContact(contact = {}) {
  const explicit = pageEngineIdentity(
    contact?.pageEngineIdentity?.schemaId,
    contact?.pageEngineIdentity?.id,
  );
  if (explicit) return explicit;

  const url = text(contact.contactUrl);
  const contactId = text(contact.crmContactId)
    || (/\bPage=240\b/i.test(url) ? text(contact.contactId) : '');
  if (contactId) return pageEngineIdentity('contact', contactId);
  const accountId = text(contact.accountId);
  if (accountId) return pageEngineIdentity('account', accountId);
  return null;
}

function snapshotIdentity(snapshot = {}) {
  return pageEngineIdentity(snapshot.schemaId || snapshot.entityType, snapshot.id);
}

function identityKey(identity) {
  return identity ? `${identity.schemaId}:${identity.id}` : '';
}

/** Return a cache snapshot only when it belongs to this exact audience row. */
export function cachedSnapshotForContact(contact = {}) {
  const expected = pageEngineIdentityForContact(contact);
  const snapshot = contact.pageEngineSnapshot;
  const actual = snapshotIdentity(snapshot);
  if (!expected || !actual || identityKey(expected) !== identityKey(actual)) return null;
  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) return null;
  return snapshot;
}

function chunks(values, size = LOOKUP_CHUNK_SIZE) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

/**
 * Attach encrypted-index hits to contacts without changing their order.
 * Queries are grouped by schema and chunked below the worker's 500-row bound.
 */
export async function attachCachedPageEngineSnapshots(
  contacts,
  { query = queryEngineIndex } = {},
) {
  const source = Array.isArray(contacts) ? contacts : [];
  const identities = source.map(pageEngineIdentityForContact);
  const bySchema = new Map();
  for (const identity of identities) {
    if (!identity) continue;
    if (!bySchema.has(identity.schemaId)) bySchema.set(identity.schemaId, new Set());
    bySchema.get(identity.schemaId).add(identity.id);
  }

  const snapshots = new Map();
  for (const [schemaId, idSet] of bySchema) {
    for (const recordIds of chunks([...idSet])) {
      const result = await query({
        where: [
          { path: '__index.entityType', op: 'eq', value: schemaId },
          { path: '__index.recordId', op: 'in', value: recordIds },
        ],
        limit: recordIds.length,
      });
      for (const snapshot of (Array.isArray(result?.rows) ? result.rows : [])) {
        const actual = snapshotIdentity(snapshot);
        if (!actual || actual.schemaId !== schemaId || !idSet.has(actual.id)) continue;
        if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) continue;
        snapshots.set(identityKey(actual), snapshot);
      }
    }
  }

  let available = 0;
  const attached = source.map((contact, index) => {
    const snapshot = snapshots.get(identityKey(identities[index]));
    if (!snapshot) return contact;
    available += 1;
    return { ...contact, pageEngineSnapshot: snapshot };
  });
  return {
    contacts: attached,
    available,
    requested: identities.filter(Boolean).length,
  };
}
