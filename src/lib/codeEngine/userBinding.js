/* ───────────────────────────────────────────────────────────────
   codeEngine/userBinding — the `user.*` code binding.

   Saved templates are exposed as objects keyed by a PascalCase code id
   (templateId.js), each an evaluatable REFERENCE — not the rendered
   content:

     user.emails.WinBack            → the saved email (auto-random version)
     user.emails.WinBack.versions[0]→ a specific version
     user.email("Win-back")         → same, by name or id (throws if missing)

   You then EVALUATE a reference into a sendable object (page.evaluate),
   which is where variables render — see runtime.js. Same shape for
   user.tasks / user.calls.

   Pure: raw template arrays in, a plain binding out. The Node runner uses
   this directly; the sandbox rebuilds the finders from the serializable
   `data` half on the other side of the realm.
─────────────────────────────────────────────────────────────── */

import { idsFor } from './templateId.js';

const arr = (v) => (Array.isArray(v) ? v : []);

/** Build the id-keyed reference map for one kind of saved template. */
function refsOf(list, kind) {
  const byId = {};
  for (const t of idsFor(list)) {
    const ref = {
      id: t.id, codeId: t.codeId, name: t.name || t.codeId, kind,
      subject: t.subject || '', body: t.body || '',
      priority: t.priority, daysOut: t.daysOut,
    };
    const versions = arr(t.versions).length
      ? t.versions.map((v, i) => ({ codeId: ref.codeId, id: ref.id, name: ref.name, kind, versionIndex: i, subject: v.subject || ref.subject, body: v.body || ref.body, priority: ref.priority, daysOut: ref.daysOut }))
      : [{ codeId: ref.codeId, id: ref.id, name: ref.name, kind, versionIndex: 0, subject: ref.subject, body: ref.body, priority: ref.priority, daysOut: ref.daysOut }];
    ref.versions = versions;
    byId[t.codeId] = ref;
  }
  return byId;
}

/** The serializable data half of a binding (what crosses into the sandbox). */
export function userBindingData(raw = {}) {
  return {
    emails: refsOf(arr(raw.emails), 'email'),
    tasks: refsOf(arr(raw.tasks), 'task'),
    calls: refsOf(arr(raw.calls), 'call'),
  };
}

/** Build the `user` binding (keyed maps + throwing name/id finders). */
export function buildUserBinding(raw = {}) {
  const data = userBindingData(raw);
  const finder = (byId, kind) => (q) => {
    const found = byId[q] || Object.values(byId).find((r) => r.id === q || r.name === q);
    if (!found) throw new Error(`Missing dependency: no saved ${kind} named “${q}”. Create a ${kind} with that name (or fix the reference).`);
    return found;
  };
  return {
    emails: data.emails, tasks: data.tasks, calls: data.calls,
    email: finder(data.emails, 'email'), task: finder(data.tasks, 'task'), call: finder(data.calls, 'call'),
  };
}

/** Code ids for a kind of saved template — for autocomplete + lint. */
export function codeIdsFor(list) {
  return idsFor(list).map((t) => t.codeId);
}
