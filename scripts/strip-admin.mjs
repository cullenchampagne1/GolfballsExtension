/** Admin-strip helpers, shared by build.js and package-store.mjs.
 *
 * Build modes:
 *   GB_ADMIN unset / not "0"  → ADMIN build: keep everything (dev, repo, your
 *                               unpacked install).
 *   GB_ADMIN="0"              → CONSUMER/served build: admin code is physically
 *                               excluded, not merely hidden.
 *
 * Three exclusion mechanisms (see admin-only.json):
 *   1. whole entries/files/content-scripts — skipped/dropped by the pipeline;
 *   2. `if (__ADMIN__) { … }` inside vite-built files — dead-code-eliminated;
 *   3. `/* @admin:start *\/ … /* @admin:end *\/` inside RAW worker files —
 *      text-stripped here (they aren't bundled, so DCE can't touch them).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const ADMIN_ONLY = JSON.parse(
  readFileSync(resolve(here, '..', 'admin-only.json'), 'utf8'),
);

/** True for the ADMIN (full) build, false for the CONSUMER (served) build. */
export const IS_ADMIN_BUILD = process.env.GB_ADMIN !== '0';

const ADMIN_ENTRIES = new Set((ADMIN_ONLY.entries || []).map((p) => p.replace(/^\.\//, '')));
const ADMIN_ROOT_FILES = new Set(ADMIN_ONLY.rootFiles || []);
const ADMIN_CONTENT_SCRIPTS = new Set(ADMIN_ONLY.contentScripts || []);

/** Is this source entry (e.g. "src/content/notifications.jsx") admin-only? */
export function isAdminEntry(relativePath) {
  return ADMIN_ENTRIES.has(String(relativePath).replace(/^\.\//, ''));
}

/** Is this root file (e.g. "notifications-store.js") admin-only? */
export function isAdminRootFile(name) {
  return ADMIN_ROOT_FILES.has(name);
}

/** Is this manifest content-script path (e.g. "react-dist/content/notifications.js") admin-only? */
export function isAdminContentScript(path) {
  return ADMIN_CONTENT_SCRIPTS.has(String(path).replace(/^\/+/, ''));
}

const MARKER_RE = /\/\*\s*@admin:start\s*\*\/[\s\S]*?\/\*\s*@admin:end\s*\*\//g;

/** Remove every /* @admin:start *\/ … /* @admin:end *\/ region from raw text. */
export function stripAdminRegions(text) {
  return String(text).replace(MARKER_RE, '');
}

// Match a token only when it stands alone (not as a fragment of a larger
// identifier), so e.g. "gbNotifications" doesn't false-positive inside the
// unrelated "__gbNotificationsMounted".
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const LEAK_MATCHERS = (ADMIN_ONLY.leakTokens || []).map((token) => ({
  token,
  re: new RegExp(`(?<![\\w$])${escapeRe(token)}(?![\\w$])`),
}));

/** Scan packaged bytes for any admin token; returns the first offender or null. */
export function findLeak(path, bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  for (const { token, re } of LEAK_MATCHERS) {
    if (re.test(text)) return { path, token };
  }
  return null;
}
