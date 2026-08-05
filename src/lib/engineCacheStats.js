/**
 * What the Developer Settings cache readout SAYS about the Page Engine index.
 *
 * The worker owns the index and answers with raw counts (lib/page-engine-index-store.js
 * `stats`); this turns one of those answers into the line a rep reads: how many
 * Contacts are cached, and — when that number is zero — which of the several
 * reasons it is zero. Pure, so the wording and the "is this number meaningful"
 * rules are testable without rendering a settings page.
 */

import { sendBackgroundMessage } from './backgroundMessage.js';
import { trackerAgo } from './trackerSettings.js';

const count = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/**
 * Worker stats + the current dev settings → the readout.
 *
 * The count and the reason are computed together on purpose: "0" means something
 * different when indexing is off, when no territory is set, and when the rep has
 * simply not opened a Contact yet, and a bare 0 with no line under it reads as a
 * broken feature in all three cases.
 */
export function engineCacheStatView(stats, settings, { now = Date.now() } = {}) {
  const enabled = settings?.['pageEngine.indexingEnabled'] === true;
  const territory = String(settings?.['pageEngine.territory'] || '').trim();
  const contacts = count(stats?.byType?.contact);
  const accounts = count(stats?.byType?.account);
  const lastIndexedAt = count(stats?.lastIndexedAt);
  const view = {
    contacts,
    accounts,
    lastIndexedAt,
    value: contacts.toLocaleString('en-US'),
  };

  // Territory is the index's partition key, so without one there is nothing to
  // count — not even records cached under a territory set earlier.
  if (!territory) {
    return { ...view, tone: 'warning', detail: 'Set an Engine Territory to cache anything.' };
  }
  if (!enabled) {
    return {
      ...view,
      tone: 'muted',
      detail: contacts
        ? 'Engine Indexing is off — these were cached earlier and are kept.'
        : 'Engine Indexing is off — nothing is being cached.',
    };
  }
  if (!contacts) {
    return {
      ...view,
      tone: 'muted',
      detail: accounts
        ? `${plural(accounts, 'account')} cached, no Contacts yet — open a Contact in this territory.`
        : 'Nothing cached yet — open a Contact in this territory.',
    };
  }
  return {
    ...view,
    tone: 'brand',
    detail: [
      accounts ? `+ ${plural(accounts, 'account')}` : null,
      `updated ${trackerAgo(lastIndexedAt, now)}`,
    ].filter(Boolean).join(' · '),
  };
}

/** The view for a failed read — an unknown count is not a zero count. */
export function engineCacheStatError(error) {
  return {
    contacts: 0,
    accounts: 0,
    lastIndexedAt: 0,
    value: '—',
    tone: 'warning',
    detail: error?.message || 'Could not read the Page Engine index.',
  };
}

/**
 * Ask the worker for the index stats and render them.
 *
 * Never rejects: this feeds a readout in a settings table, where a thrown error
 * would blank the row instead of saying what went wrong.
 */
export async function readEngineCacheStat(settings) {
  try {
    const stats = await sendBackgroundMessage('pageEngineIndexStats');
    return engineCacheStatView(stats, settings);
  } catch (error) {
    return engineCacheStatError(error);
  }
}
