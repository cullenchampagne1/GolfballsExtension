// One source of truth shared with MV3 importScripts/content-script consumers.
// The classic modules install frozen APIs on globalThis; importing them here
// lets Vite/Node use the exact same registry and record shapes rather than a
// second implementation — the rule src/lib/actionLanguage.js already follows.
//
// The sales dashboard reads through `trackerSnapshots()`; it never writes.
// Only the service worker writes (see lib/tracker-store.js).
import '../../lib/tracker-registry.js';
import '../../lib/tracker-definitions.js';

import { sendBackgroundMessage } from './backgroundMessage.js';

const registry = globalThis.GBTrackerRegistry;

export const TRACKER_LIMITS = registry.LIMITS;
export const trackers = () => registry.list();
export const trackerById = (id) => registry.get(id);
export const interceptTrackers = () => registry.listByKind('intercept');
export const pollTrackers = () => registry.listByKind('poll');
export const trackerCaptureRules = () => registry.captureRules();
export const matchTrackedRequest = (request) => registry.matchRequest(request);
export const normalizeTrackedRecord = (tracker, raw, options) => (
  registry.normalizeRecord(tracker, raw, options)
);
export const dueTrackerRefreshes = (tracker, records, now) => (
  registry.dueRefreshes(tracker, records, now)
);

/** Read every tracker's stored table from the worker (the single writer). */
export async function trackerSnapshots() {
  const response = await sendBackgroundMessage('gbTrackerSnapshots');
  return Array.isArray(response.snapshots) ? response.snapshots : [];
}

/**
 * Rows for one tracker, newest-first.
 *
 * `settled` records are kept deliberately: an opportunity that closed is the
 * most interesting row on a sales dashboard, it just costs no more requests.
 */
export async function trackerRecords(trackerId) {
  const snapshots = await trackerSnapshots();
  const snapshot = snapshots.find((entry) => entry.trackerId === trackerId);
  return snapshot ? snapshot.records : [];
}

/**
 * One row per tracker for the settings table: what it is, how much it has
 * collected, when it last learned something, and whether it is switched on.
 *
 * Deliberately NOT `trackerSnapshots()`: this carries counts instead of every
 * stored record, so rendering a four-row table does not push eight hundred
 * records through the message channel.
 */
export async function trackerSummaries() {
  const response = await sendBackgroundMessage('gbTrackerSummaries');
  return Array.isArray(response.trackers) ? response.trackers : [];
}

/**
 * Switch one tracker on or off.
 *
 * The worker is the single writer here too — the settings page asks, it does
 * not reach into the store. Rows already collected are kept: off means "stop
 * collecting", not "forget what you saw".
 */
export async function setTrackerEnabled(trackerId, enabled) {
  // sendBackgroundMessage already rejects anything but `{ ok: true }`.
  return sendBackgroundMessage('gbTrackerSetEnabled', { trackerId, enabled: !!enabled });
}
