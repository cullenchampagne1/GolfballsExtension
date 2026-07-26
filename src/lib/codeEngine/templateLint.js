/* ───────────────────────────────────────────────────────────────
   codeEngine/templateLint — flag missing saved-template dependencies.

   A campaign is portable code: if it's shared and the recipient doesn't
   have the saved email/task/call it references by name, that should show
   up as a problem AT AUTHOR TIME, not only when it runs. This scans for
   literal `user.email("X")` / `user.task("X")` / `user.call("X")` and
   reports any name that isn't in the rep's saved templates.

   Pure: source + known names in, diagnostic spans out. Only lints once
   the templates are known (`ready`), so it doesn't false-flag while the
   saved lists are still loading. Non-literal args (a variable) are left
   alone — they can only be checked at run time.
─────────────────────────────────────────────────────────────── */

import { APPROVED_CONTACT_FIELDS } from './contracts.js';

const REF_RE = /\buser\.(email|task|call)\(\s*(["'])([^"']+)\2/g;
const KEYED_RE = /\buser\.(emails|tasks|calls)\.([A-Za-z_$][\w$]*)/g;
const EDIT_RE = /\bpage\.contact\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

/**
 * @param {string} source
 * @param {{ ready?: boolean, emails?: string[], tasks?: string[], calls?: string[] }} bindings
 * @returns {Array<{ from, to, kind, name, message }>}
 */
export function lintTemplateRefs(source, bindings) {
  const src = String(source || '');
  // Editing an unapproved contact field is always a hard error (no write path)
  // — independent of whether the saved-template lists have loaded.
  const editErrors = [];
  EDIT_RE.lastIndex = 0;
  let e;
  while ((e = EDIT_RE.exec(src)) !== null) {
    const field = e[1];
    if (Object.hasOwn(APPROVED_CONTACT_FIELDS, field)) continue;
    const from = e.index + e[0].indexOf(field);
    editErrors.push({ from, to: from + field.length, kind: 'edit', name: field, message: `page.contact.${field} is not an editable field. Editable: ${Object.keys(APPROVED_CONTACT_FIELDS).join(', ')}.` });
  }
  if (!bindings || !bindings.ready) return editErrors;
  const known = {
    email: new Set(bindings.emails || []),
    task: new Set(bindings.tasks || []),
    call: new Set(bindings.calls || []),
  };
  const ids = {
    email: new Set(bindings.emailIds || []),
    task: new Set(bindings.taskIds || []),
    call: new Set(bindings.callIds || []),
  };
  const out = [...editErrors];
  let m;

  // user.email("Name") — by name.
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(src)) !== null) {
    const kind = m[1];
    const name = m[3];
    if (known[kind].has(name)) continue;
    const from = m.index + m[0].indexOf(name, m[0].indexOf('('));
    out.push({ from, to: from + name.length, kind, name, message: dependencyMsg(kind, name) });
  }

  // user.emails.<Id> — by code id (only when we know the ids for that kind).
  const kindOf = { emails: 'email', tasks: 'task', calls: 'call' };
  KEYED_RE.lastIndex = 0;
  while ((m = KEYED_RE.exec(src)) !== null) {
    const kind = kindOf[m[1]];
    const id = m[2];
    if (!ids[kind].size || ids[kind].has(id)) continue;
    const from = m.index + m[0].lastIndexOf(id);
    out.push({ from, to: from + id.length, kind, name: id, message: dependencyMsg(kind, id) });
  }
  return out;
}

function dependencyMsg(kind, ref) {
  return `No saved ${kind} “${ref}”. Create a ${kind} with that name, or fix the reference — this campaign depends on it.`;
}
