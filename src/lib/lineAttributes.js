/* ───────────────────────────────────────────────────────────────
   lineAttributes.js — where a proposal line's base-product attribute
   RENDERS: folded into the product identity (next to the title) or listed
   as a customization option.

   THE BUG THIS EXISTS TO KILL. A product page's base properties are named
   per department, not uniformly — verified on the live pages:

     Venture Microfiber Magnetic Towel (P00W61) → PropertyProduct "Accessories Color"
     TP5 Custom Logo Golf Balls (P012Y9)        → PropertyProduct "Ball Color"
     apparel                                    → PropertyProduct "Apparel Color"

   `giftCustomize.PropertyInput` keys its `__base` pick by that RAW label
   (it has to — `VariantBridge` matches the product config's own variant
   keys on it), while it DISPLAYS a prefix-stripped label. The proposal line
   then hid a value only when the key was exactly `Color`, so the same
   attribute landed in two different places depending on the department:
   a t-shirt's "Apparel Color" showed up as a customization-option chip
   while a towel's plain "Color" did not — the inconsistency reported from
   the floor.

   THE RULE. Colour and size are part of what the product IS: golfballs.com
   itself resolves them into the line name (its child products read
   "Microfiber Magnetic Towel - White", and its proposal email prints
   "Venture Golf Microfiber Magnetic Towel - White"). So they render next to
   the title on every surface. Everything else the buyer picks — tee count,
   set makeup, shaft, imprint side — is a customization option and renders
   in the options row. Classification is label-agnostic, so a new department
   prefix can't move an attribute again.
─────────────────────────────────────────────────────────────── */

/* Department prefixes the site puts in front of a shared property name.
   Stripped for display AND for classification, which is the whole point. */
const DEPT_PREFIX = /^(?:accessories|apparel|product|ball|golf ball|towel|headwear|footwear|bag|drinkware|glove|umbrella|outerwear)\s+/i;

/** The label as a human reads it — "Apparel Color" → "Color". */
export function cleanAttributeLabel(label) {
  const text = String(label == null ? '' : label).trim();
  if (!text) return '';
  const stripped = text.replace(DEPT_PREFIX, '').trim();
  return stripped || text;
}

/** Colour / size — the attributes that belong to the product's identity and
 *  therefore render next to the title, never as a customization option. */
export function isIdentityAttribute(label) {
  const clean = cleanAttributeLabel(label).toLowerCase();
  if (!clean) return false;
  return /^colou?rs?$/.test(clean) || /^sizes?$/.test(clean);
}

const entriesOf = (variant) => Object.entries((variant && variant.values) || {})
  .filter(([label, value]) => label && value != null && String(value).trim() !== '');

/** Identity values in a stable order (colour before size), for the line's
 *  title area. Values only — "White", not "Color: White" — because that is
 *  how the site prints them into the product name. */
export function identityAttributeValues(variant) {
  const hits = entriesOf(variant).filter(([label]) => isIdentityAttribute(label));
  const rank = (label) => (/^colou?rs?$/.test(cleanAttributeLabel(label).toLowerCase()) ? 0 : 1);
  return hits
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([, value]) => String(value).trim())
    .filter((value, i, all) => all.indexOf(value) === i);
}

/** Customization options as "<clean label>: <value>" chips — everything the
 *  buyer picked that isn't part of the product's identity. */
export function optionAttributePills(variant) {
  return entriesOf(variant)
    .filter(([label]) => !isIdentityAttribute(label))
    .map(([label, value]) => `${cleanAttributeLabel(label)}: ${String(value).trim()}`);
}

/** The identity suffix the site appends to a product name — " - White - L".
 *  Empty when the line carries no identity attribute, and skips a value the
 *  title already spells out (a catalog title can already be per-colour).
 *
 *  The "already spelled out" test is WORD-based, not substring: a size of "L"
 *  is a substring of almost any title ("Performance Polo"), which would have
 *  silently dropped it from the name. */
export function identitySuffix(variant, title = '') {
  const words = new Set(tokens(title));
  const spelledOut = (value) => {
    const parts = tokens(value);
    return parts.length > 0 && parts.every((part) => words.has(part));
  };
  const values = identityAttributeValues(variant).filter((value) => !spelledOut(value));
  return values.length ? ` - ${values.join(' - ')}` : '';
}

const tokens = (text) => String(text == null ? '' : text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Customization option VALUES, unlabelled — for prose surfaces (the email
 *  subtitle) where "White · 100" reads better than "Color: White · Count: 100". */
export function optionAttributeValues(variant) {
  return entriesOf(variant)
    .filter(([label]) => !isIdentityAttribute(label))
    .map(([, value]) => String(value).trim());
}

/** A line's display subtitle: identity values first (they read as part of the
 *  name), then the customization options, then any free-text detail. Values
 *  only — the ORDER is what this helper standardizes, so an attribute always
 *  appears in the same position on every surface. */
export function lineAttributeSubtitle(variant) {
  const parts = [...identityAttributeValues(variant), ...optionAttributeValues(variant)];
  const details = variant && variant.details;
  if (details) parts.push(String(details).trim());
  return parts.filter((part, i, all) => part && all.indexOf(part) === i).join(' · ');
}
