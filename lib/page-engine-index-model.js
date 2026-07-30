/**
 * Pure normalization/query model for the Page Engine index.
 *
 * The service-worker store encrypts snapshots and HMAC-blinds every path/text
 * token. This module deliberately contains no IndexedDB, Chrome, or crypto I/O
 * so its identity, flattening, and predicate contracts can be tested directly.
 */
(function installPageEngineIndexModel(root) {
  'use strict';

  const MAX_TERRITORY_CHARS = 200;
  const MAX_ID_CHARS = 500;
  const MAX_PATH_CHARS = 500;
  const MAX_STRING_CHARS = 20_000;
  const SUPPORTED_SCHEMAS = new Set(['account', 'contact']);

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeText(value, max = MAX_STRING_CHARS) {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLocaleLowerCase('en-US');
  }

  function normalizeTerritory(value) {
    const territory = normalizeText(value, MAX_TERRITORY_CHARS);
    if (!territory) throw new Error('Engine Territory is required');
    return territory.toLocaleLowerCase('en-US');
  }

  function territoryCandidates(data) {
    const page = object(data);
    const account = object(page.account);
    return [...new Set([
      account.territoryId,
      account.territoryName,
    ].map((value) => normalizeSearchText(value))
      .filter((value) => value && !/^(?:0|not set|select)$/i.test(value)))];
  }

  function snapshotIdentity(snapshot) {
    const source = object(snapshot);
    const schemaId = normalizeText(source.schemaId, 50).toLowerCase();
    if (!SUPPORTED_SCHEMAS.has(schemaId)) throw new Error('Page Engine schema is not indexable');
    const data = object(source.data);
    const ids = object(data.ids);
    const bySchema = {
      account: { entityType: 'account', id: ids.account },
      contact: { entityType: 'contact', id: ids.contact },
    };
    const identity = bySchema[schemaId];
    const id = normalizeText(identity.id, MAX_ID_CHARS);
    if (!id) throw new Error(`Page Engine ${schemaId} snapshot has no stable ID`);
    return {
      schemaId,
      entityType: identity.entityType,
      id,
      accountId: normalizeText(ids.account, MAX_ID_CHARS),
      contactId: normalizeText(ids.contact, MAX_ID_CHARS),
    };
  }

  function normalizeSnapshot(snapshot, configuredTerritory) {
    const identity = snapshotIdentity(snapshot);
    const territory = normalizeTerritory(configuredTerritory);
    const data = object(snapshot.data);
    if (!territoryCandidates(data).includes(territory)) {
      throw new Error('Page territory does not match Engine Territory');
    }
    return {
      ...identity,
      territory,
      sourceUrl: normalizeText(snapshot.sourceUrl, 4_000),
      indexedAt: Number.isFinite(snapshot.indexedAt) ? snapshot.indexedAt : Date.now(),
      data,
    };
  }

  function scalarRow(path, value, ordinal) {
    const safePath = normalizeText(path, MAX_PATH_CHARS);
    if (!safePath || value == null) return null;
    if (typeof value === 'string') {
      const stringValue = normalizeText(value);
      if (!stringValue) return null;
      const dateValue = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(stringValue)
        ? Date.parse(stringValue)
        : NaN;
      return {
        path: safePath,
        ordinal,
        type: Number.isFinite(dateValue) ? 'date' : 'string',
        stringValue,
        normalizedString: normalizeSearchText(stringValue),
        ...(Number.isFinite(dateValue) ? { dateValue } : {}),
      };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { path: safePath, ordinal, type: 'number', numberValue: value };
    }
    if (typeof value === 'boolean') {
      return { path: safePath, ordinal, type: 'bool', boolValue: value };
    }
    return null;
  }

  /** Flatten objects and arrays into relational-style scalar field rows.
   * Array indexes collapse to [] so one predicate can search every member:
   * `orders[].total`, `activities[].subject`, etc. */
  function flattenData(data, maxRows = Number.POSITIVE_INFINITY) {
    const rows = [];
    const counts = new Map();
    const seen = new WeakSet();
    const visit = (value, path, depth = 0) => {
      if (rows.length >= maxRows || depth > 64) return;
      if (Array.isArray(value)) {
        if (seen.has(value)) return;
        seen.add(value);
        for (const item of value) visit(item, `${path}[]`, depth + 1);
        return;
      }
      if (value && typeof value === 'object') {
        if (seen.has(value)) return;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
          visit(child, path ? `${path}.${key}` : key, depth + 1);
        }
        return;
      }
      const ordinal = counts.get(path) || 0;
      const row = scalarRow(path, value, ordinal);
      if (row) {
        rows.push(row);
        counts.set(path, ordinal + 1);
      }
    };
    visit(object(data), '');
    return rows;
  }

  function termPieces(value) {
    const normalized = normalizeSearchText(value);
    if (!normalized) return [];
    const pieces = new Set();
    for (let length = 1; length <= Math.min(16, normalized.length); length += 1) {
      pieces.add(`p:${normalized.slice(0, length)}`);
    }
    const words = normalized.split(/[^\p{L}\p{N}@._+-]+/u).filter(Boolean);
    for (const word of words) {
      pieces.add(`w:${word}`);
      for (let length = 1; length <= Math.min(16, word.length); length += 1) {
        pieces.add(`p:${word.slice(0, length)}`);
      }
    }
    if (normalized.length >= 3) {
      for (let index = 0; index <= normalized.length - 3; index += 1) {
        pieces.add(`g:${normalized.slice(index, index + 3)}`);
      }
    }
    return [...pieces];
  }

  function queryTermPieces(value, op = 'contains') {
    const normalized = normalizeSearchText(value);
    if (!normalized) return [];
    if (op === 'startsWith') return [`p:${normalized.slice(0, 16)}`];
    if (normalized.length < 3) return [`p:${normalized}`];
    const pieces = [];
    for (let index = 0; index <= normalized.length - 3; index += 1) {
      pieces.push(`g:${normalized.slice(index, index + 3)}`);
    }
    return [...new Set(pieces)];
  }

  function valuesForPath(data, wantedPath) {
    const path = normalizeText(wantedPath, MAX_PATH_CHARS);
    if (!path) return [];
    return flattenData(data)
      .filter((row) => row.path === path)
      .map((row) => {
        if (row.type === 'number') return row.numberValue;
        if (row.type === 'bool') return row.boolValue;
        return row.stringValue;
      });
  }

  function comparable(value) {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return normalizeSearchText(value);
  }

  function compare(value, op, expected) {
    const actual = comparable(value);
    const target = comparable(expected);
    switch (op) {
      case 'eq': return actual === target;
      case 'neq': return actual !== target;
      case 'lt': return actual < target;
      case 'lte': return actual <= target;
      case 'gt': return actual > target;
      case 'gte': return actual >= target;
      case 'contains': return String(actual).includes(String(target));
      case 'startsWith': return String(actual).startsWith(String(target));
      default: return false;
    }
  }

  function matchesCondition(data, condition) {
    const cond = object(condition);
    const op = normalizeText(cond.op || 'eq', 20);
    const values = valuesForPath(data, cond.path);
    if (op === 'exists') return values.length > 0;
    if (op === 'notExists') return values.length === 0;
    if (op === 'in') {
      const expected = Array.isArray(cond.value) ? cond.value : [];
      return values.some((value) => expected.some((candidate) => compare(value, 'eq', candidate)));
    }
    if (op === 'neq') return values.length === 0 || values.every((value) => compare(value, op, cond.value));
    return values.some((value) => compare(value, op, cond.value));
  }

  function matchesWhere(data, where) {
    const conditions = Array.isArray(where) ? where : [];
    return conditions.every((condition) => matchesCondition(data, condition));
  }

  root.GBPageEngineIndexModel = Object.freeze({
    normalizeText,
    normalizeSearchText,
    normalizeTerritory,
    territoryCandidates,
    snapshotIdentity,
    normalizeSnapshot,
    flattenData,
    termPieces,
    queryTermPieces,
    valuesForPath,
    matchesCondition,
    matchesWhere,
  });
})(globalThis);
