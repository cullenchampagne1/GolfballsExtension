/* Persistent favorites for the Corporate Gifting Catalog.
   Product ids are stored separately from the catalog cache so rebuilding the
   index never discards a rep's curated list. */

export const CATALOG_FAVORITES_STORAGE_KEY = 'gbGiftCatalogFavorites';
export const CATALOG_FAVORITES_MAX = 5000;

export function normalizeCatalogFavoriteIds(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const ids = [];
  for (const value of source) {
    const id = value == null ? '' : String(value).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= CATALOG_FAVORITES_MAX) break;
  }
  return ids;
}

export function loadCatalogFavorites() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) { resolve([]); return; }
      chrome.storage.local.get(CATALOG_FAVORITES_STORAGE_KEY, (data) => {
        resolve(normalizeCatalogFavoriteIds(data?.[CATALOG_FAVORITES_STORAGE_KEY]));
      });
    } catch { resolve([]); }
  });
}

export function saveCatalogFavorites(value) {
  const ids = normalizeCatalogFavoriteIds(value);
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) { resolve(ids); return; }
      chrome.storage.local.set({ [CATALOG_FAVORITES_STORAGE_KEY]: ids }, () => resolve(ids));
    } catch { resolve(ids); }
  });
}

export async function setCatalogFavorite(current, id, favorite) {
  const ids = normalizeCatalogFavoriteIds(current);
  const key = id == null ? '' : String(id).trim();
  if (!key) return ids;
  const next = new Set(ids);
  if (favorite) next.add(key); else next.delete(key);
  return saveCatalogFavorites([...next]);
}
