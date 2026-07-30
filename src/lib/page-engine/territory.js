import { runEngine } from './runner.js';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function usableTerritory(value) {
  const normalized = clean(value);
  return /^(?:0|not set|select)$/i.test(normalized) ? '' : normalized;
}

/** Convert an Account/Contact Page Engine result into the exact Territory
 * diagnostic used by the developer action and local-index admission gate.
 * The select value is canonical; its visible label remains separately
 * available for people and for older pages that expose only display text. */
export function territoryInfoFromResult(result) {
  if (!['account', 'contact'].includes(result?.schemaId) || !result?.data) return null;
  const data = result.data;
  const account = data.account && typeof data.account === 'object' ? data.account : {};
  const ids = data.ids && typeof data.ids === 'object' ? data.ids : {};
  const schemaId = clean(result.schemaId);
  const recordId = clean(schemaId === 'contact' ? ids.contact : ids.account);
  return {
    schemaId,
    recordId,
    accountId: clean(ids.account),
    territoryId: usableTerritory(account.territoryId),
    territoryName: usableTerritory(account.territoryName),
  };
}

export function inspectPageTerritory(doc) {
  return territoryInfoFromResult(runEngine(doc));
}
