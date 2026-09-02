# Page Engine local index

The Page Engine index is an opt-in, installation-local cache of supported CRM
pages. It is designed as a foundation for future fast search and account-aware
features without repeatedly fetching pages that the extension has already
seen.

## Enablement and territory

Both developer settings are disabled/empty by default:

- `pageEngine.indexingEnabled` — enables new writes.
- `pageEngine.territory` — the exact Territory allowed into this
  installation's index. The numeric `#TerritoryID` value is canonical; its
  exact visible name remains an accepted fallback.
- `pageEngine.inspectTerritory` — an **Extract territory** developer button
  that runs the engine against the Account or Contact page that opened the
  manager and shows its Territory value/name in a notification. This action
  stores no setting.

The content-side Page Engine checks the settings before sending a snapshot.
The service worker rereads the current settings and independently validates
the extracted Territory before writing, so a stale or forged message cannot
bypass the gate. These settings are excluded from remote policy management
and shared settings templates.

## One extraction path

All supported sources use the same extraction/index boundary:

- a supported Contact or Account page after the live tab finishes loading;
- `runEngine()` calls made by any extension feature;
- documents fetched and parsed by workflow hydration;
- HTML parsed through the Page Engine code helper.

Each extraction becomes an idempotent upsert. Contact and Account records use
their stable Page Engine IDs, so revisiting a page refreshes the existing
entity instead of appending a duplicate. Standalone Opportunity and Order
pages are never stored.

## Storage model

The worker owns IndexedDB database `gb-page-engine-index-secure`:

- `entities` contains complete AES-GCM encrypted snapshots.
- `fields` contains relational-style scalar rows for nested paths and arrays.
- `keys` contains locally generated, non-extractable AES-GCM and HMAC keys.

Territory values, record IDs, paths, exact string values, text terms, URLs, and
full payloads do not rest in plaintext. Paths and lookup terms are HMAC-blinded.
Numeric and date values remain sortable, but sit beside opaque path, owner, and
record tokens.

Arrays collapse their positions into reusable paths such as
`orders[].total` and `activities[].subject`. This supports exact/inclusion,
contains/prefix, existence, numeric/date range, AND-combined, and ordered
queries without knowing a row's array position.

## Internal query boundary

The isolated Page Engine bridge exposes:

```js
await window.__gbPageEngine.engineIndex.query({
  where: [
    { path: 'activities[].subject', op: 'contains', value: 'follow up' },
    { path: 'stats.totalRevenue', op: 'gte', value: 1000 },
  ],
  orderBy: { path: 'stats.totalRevenue', direction: 'desc' },
  limit: 100,
});
```

Supported operators are `eq`, `neq`, `in`, `exists`, `notExists`,
`contains`, `startsWith`, `lt`, `lte`, `gt`, and `gte`. The same bridge
provides `stats()` for the configured Territory partition. `clear()` removes
all locally cached entity and field rows in one transaction while preserving
the device encryption keys, so switching Territory cannot leave hidden cache
rows behind and large caches do not require one delete operation per record.

The first run after upgrading from the retired owner-gated index clears that
old cache once. Owner IDs and Territory values are unrelated namespaces, so
retaining or guessing across the boundary would admit the wrong records.

Safety bounds currently cap a snapshot at 2,000,000 serialized characters,
20,000 scalar rows, 20 query predicates, 2,000 candidate decryptions, and 500
returned rows.
