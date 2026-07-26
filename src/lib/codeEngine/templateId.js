/* ───────────────────────────────────────────────────────────────
   codeEngine/templateId — stable code ids for saved templates.

   Saved templates are addressed in code by a PascalCase id derived from
   their name, so they autocomplete cleanly: numbers become words and
   punctuation is dropped.
     "3 Taylor Made Promo Campaign"  → "ThreeTaylorMadePromoCampaign"
     "Win-back (v2)"                 → "WinBackVTwo"
   user.emails.<id> is the template (auto-random version on evaluate);
   user.emails.<id>.versions[n] is a specific version.

   Pure: string in, id out.
─────────────────────────────────────────────────────────────── */

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** A small number → words (handles 0–999; larger falls back to digits→words each). */
function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + 'Hundred' + (n % 100 ? numberToWords(n % 100) : '');
  return String(n).split('').map((d) => ONES[Number(d)]).join('');
}

/** PascalCase code id for a template name. */
export function camelId(name) {
  const withWords = String(name ?? '').replace(/\d+/g, (d) => numberToWords(parseInt(d, 10)));
  const parts = withWords.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const id = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return id || 'Template';
}

/** Assign unique ids to a list of templates (suffixes collisions: Foo, Foo2…). */
export function idsFor(list) {
  const seen = new Map();
  return (Array.isArray(list) ? list : []).map((t) => {
    let id = camelId(t.name || t.id);
    if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); id = `${id}${n}`; }
    else seen.set(id, 1);
    return { ...t, codeId: id };
  });
}
