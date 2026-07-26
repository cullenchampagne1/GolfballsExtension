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

const REF_RE = /\buser\.(email|task|call)\(\s*(["'])([^"']+)\2/g;

/**
 * @param {string} source
 * @param {{ ready?: boolean, emails?: string[], tasks?: string[], calls?: string[] }} bindings
 * @returns {Array<{ from, to, kind, name, message }>}
 */
export function lintTemplateRefs(source, bindings) {
  if (!bindings || !bindings.ready) return [];
  const src = String(source || '');
  const known = {
    email: new Set(bindings.emails || []),
    task: new Set(bindings.tasks || []),
    call: new Set(bindings.calls || []),
  };
  const out = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(src)) !== null) {
    const kind = m[1];
    const name = m[3];
    if (known[kind].has(name)) continue;
    const from = m.index + m[0].indexOf(name, m[0].indexOf('(')); // start of the name literal
    out.push({
      from,
      to: from + name.length,
      kind,
      name,
      message: `No saved ${kind} named “${name}”. Create a ${kind} with that name, or fix the reference — this campaign depends on it.`,
    });
  }
  return out;
}
