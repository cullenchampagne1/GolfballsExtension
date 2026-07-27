/* ───────────────────────────────────────────────────────────────
   codeEngine/userBinding — the `user.*` code binding.

   Saved templates are exposed as objects keyed by a PascalCase code id
   (templateId.js), each an evaluatable REFERENCE — not the rendered
   content:

     user.emails.WinBack            → the saved email's base version
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

const TEMPLATE_RUNTIME_FIELDS = Object.freeze([
  'vars',
  'toField',
  'replyMode',
  'senderAccount',
  'senderRandomize',
  'priority',
  'daysOut',
  'categoryId',
  'callDirection',
  'callCategory',
  'callVoicemail',
]);

function copyRuntimeFields(target, ...sources) {
  for (const key of TEMPLATE_RUNTIME_FIELDS) {
    for (const source of sources) {
      if (source && source[key] !== undefined) {
        target[key] = source[key];
        break;
      }
    }
  }
  return target;
}

/** Build the id-keyed reference map for one kind of saved template. */
function refsOf(list, kind) {
  const byId = {};
  for (const t of idsFor(list)) {
    const ref = copyRuntimeFields({
      id: t.id, codeId: t.codeId, name: t.name || t.codeId, kind,
      subject: t.subject || '', body: t.body || '',
    }, t);
    // Email templates persist `variations`; early code-engine records used
    // `versions`. Normalize both to one base-first array so every saved field
    // needed by task/call/email helpers survives the sandbox boundary.
    const versionSources = arr(t.versions).length
      ? arr(t.versions)
      : [{ subject: ref.subject, body: ref.body }, ...arr(t.variations)];
    const versions = versionSources.map((v, i) => copyRuntimeFields({
      codeId: ref.codeId,
      id: ref.id,
      name: ref.name,
      kind,
      versionIndex: i,
      variationId: i === 0 ? '__original' : (v.id || String(i)),
      subject: v.subject ?? ref.subject,
      body: v.body ?? ref.body,
    }, v, ref));
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
