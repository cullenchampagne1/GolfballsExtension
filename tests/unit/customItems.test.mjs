import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_STORE_FILE_KIND,
  PRODUCT_STORE_FILE_VERSION,
  buildProductStoreFile,
  importProductStoreFile,
  parseProductStoreFile,
} from '../../src/lib/customItems.js';
import {
  CATALOG_FAVORITES_STORAGE_KEY,
  loadCatalogFavorites,
  normalizeCatalogFavoriteIds,
  setCatalogFavorite,
} from '../../src/lib/catalogFavorites.js';

let storage;

beforeEach(() => {
  storage = {};
  globalThis.chrome = {
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] });
        },
        set(values, callback) {
          Object.assign(storage, values);
          callback?.();
        },
      },
    },
  };
});

describe('custom item sharing', () => {
  it('round-trips selected items through a versioned, normalized JSON store', () => {
    const file = buildProductStoreFile('  Fall & Winter Picks  ', [{
      id: 'ci-umbrella',
      name: 'Umbrella &amp; Towel',
      sku: 'KIT-42',
      thumbnail: 'data:image/png;base64,oversized-local-image',
      price: '18.5',
      qty: '12',
      dropship: 1,
      ignoredPrivateField: 'never exported',
    }]);

    assert.equal(file.kind, PRODUCT_STORE_FILE_KIND);
    assert.equal(file.schemaVersion, PRODUCT_STORE_FILE_VERSION);
    assert.equal(file.name, 'Fall & Winter Picks');
    assert.equal(file.items[0].name, 'Umbrella & Towel');
    assert.equal(file.items[0].thumbnail, '');
    assert.deepEqual(file.items[0].breaks, [{ q: 12, p: 18.5 }]);
    assert.equal('ignoredPrivateField' in file.items[0], false);

    const parsed = parseProductStoreFile(JSON.stringify(file));
    assert.equal(parsed.transport, 'json');
    assert.equal(parsed.items[0].sku, 'KIT-42');
  });

  it('rejects raw arrays and unsupported product-store versions', () => {
    assert.throws(() => parseProductStoreFile('[]'), /not a versioned Golfballs product store/);
    assert.throws(
      () => parseProductStoreFile(JSON.stringify({
        kind: PRODUCT_STORE_FILE_KIND,
        schemaVersion: PRODUCT_STORE_FILE_VERSION + 1,
        name: 'Future',
        items: [{ name: 'Future item' }],
      })),
      /version is not supported/,
    );
  });

  it('imports a JSON store into local custom items and deduplicates its SKU', async () => {
    const file = buildProductStoreFile('Roadshow', [{ name: 'First name', sku: 'DUP-1', price: 4 }]);
    const first = await importProductStoreFile(JSON.stringify(file));
    const changed = buildProductStoreFile('Roadshow v2', [{ name: 'Updated name', sku: 'DUP-1', price: 6 }]);
    const second = await importProductStoreFile(JSON.stringify(changed));

    assert.deepEqual(first, { added: 1, updated: 0, name: 'Roadshow', transport: 'json' });
    assert.deepEqual(second, { added: 0, updated: 1, name: 'Roadshow v2', transport: 'json' });
    assert.equal(storage.gbCustomItems.length, 1);
    assert.equal(storage.gbCustomItems[0].name, 'Updated name');
  });
});

describe('catalog favorites', () => {
  it('normalizes duplicate ids and persists add/remove changes separately from the catalog cache', async () => {
    assert.deepEqual(normalizeCatalogFavoriteIds(['sku-1', ' sku-1 ', null, 'sku-2']), ['sku-1', 'sku-2']);

    const added = await setCatalogFavorite([], 'sku-1', true);
    assert.deepEqual(added, ['sku-1']);
    assert.deepEqual(storage[CATALOG_FAVORITES_STORAGE_KEY], ['sku-1']);
    assert.deepEqual(await loadCatalogFavorites(), ['sku-1']);

    const removed = await setCatalogFavorite(added, 'sku-1', false);
    assert.deepEqual(removed, []);
    assert.deepEqual(storage[CATALOG_FAVORITES_STORAGE_KEY], []);
  });
});
