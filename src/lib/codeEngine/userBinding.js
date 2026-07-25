/* ───────────────────────────────────────────────────────────────
   codeEngine/userBinding — the `user.*` code binding.

   Exposes the rep's SAVED templates to campaign code, so a send drops a
   real saved email/task/call in instead of raw content:

     user.emails / user.tasks / user.calls   — arrays of { id, name, … }
     user.email(name|id) / user.task(…) / user.call(…)  — lookup, or null

   Pure: raw template arrays in, a plain binding out. The Node runner uses
   this object directly; the sandbox rebuilds the same shape from the raw
   arrays on the other side of the realm (functions can't cross), so code
   sees an identical `user` in both.
─────────────────────────────────────────────────────────────── */

const arr = (v) => (Array.isArray(v) ? v : []);

/** Build the `user` binding from raw saved-template arrays.
 *  `user.email(name)` etc. declare a HARD dependency: if no saved template of
 *  that name/id exists, they throw a clear dependency error (use
 *  `user.emails.find(...)` for an optional, non-throwing lookup). */
export function buildUserBinding(raw = {}) {
  const emails = arr(raw.emails);
  const tasks = arr(raw.tasks);
  const calls = arr(raw.calls);
  const finder = (list, kind) => (q) => {
    const found = list.find((t) => t && (t.id === q || t.name === q));
    if (!found) throw new Error(`Missing dependency: no saved ${kind} named “${q}”. Create a ${kind} with that name (or fix the reference).`);
    return found;
  };
  return {
    emails, tasks, calls,
    email: finder(emails, 'email'), task: finder(tasks, 'task'), call: finder(calls, 'call'),
  };
}

/** The serializable data half of a binding (what crosses into the sandbox). */
export function userBindingData(raw = {}) {
  return { emails: arr(raw.emails), tasks: arr(raw.tasks), calls: arr(raw.calls) };
}
