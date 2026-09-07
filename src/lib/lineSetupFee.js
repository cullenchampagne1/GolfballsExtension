/* ───────────────────────────────────────────────────────────────
   lineSetupFee.js — the one-time decoration SETUP FEE, modelled as a
   property of the LINE ITEM.

   WHERE THE FEE COMES FROM (verified against the live product page):
   the product's chosen ProductModification carries a
   `setupFee_priceBreakHeader` ladder. For the Venture Golf Microfiber
   Magnetic Towel (ShortCode P00W61) the "Custom Logo" modification
   (modificationID 84) reads

     pm.setupFee_priceBreakHeader.PriceBreak = [{ Quantity: 1, Price: 50 }]

   which is exactly the "Set Up Fee … $50" row golfballs.com prints under
   each towel line in its OWN proposal email (12 × $23.99 = $287.88 + $50,
   twice → $675.76 estimated total). `cartSerializer.computeDecoratedPricing`
   already evaluates that ladder into `setupBreaks`; the modal used to throw
   the result away. These helpers carry it through the proposal UI, the
   margin overview, the generated email and the saved cart.

   THE RULES (all three mirror golfballs.com's own proposal email):
     • ONE fee per LINE ITEM — never once per price break / split. Charging
       it per split is what double-billed a "12 @ x / 24 @ y" towel line.
     • It FLOATS TO THE BOTTOM: rendered after the line's splits, and in the
       saved cart it rides on the LAST split so the site prints it there.
     • A rep-edited fee replaces the derived one for the WHOLE line item —
       editing it while a line has three price breaks is still one edit.

   No React, no network: pure functions over proposal lines, so every
   surface derives the same number.
─────────────────────────────────────────────────────────────── */

/** The label golfballs.com prints on the row, verbatim — so a modal-generated
 *  email and the site's own read identically. */
export const SETUP_FEE_LABEL = 'Set Up Fee';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** A non-negative money value, or null when there's nothing usable. */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return round2(Math.max(0, n));
}

/** Largest break ≤ qty from a `[{ q, p }]` setup ladder (the shape
 *  `computeDecoratedPricing().setupBreaks` returns). 0 when there is no
 *  ladder — a product with no decoration setup charges nothing. */
export function setupFeeAt(setupBreaks, qty) {
  const units = Number(qty) || 0;
  let fee = 0;
  for (const b of (setupBreaks || [])) {
    if (b && Number(b.q) <= units) fee = Number(b.p) || 0;
  }
  return round2(fee);
}

/** Units across every split — the quantity the setup ladder is read at,
 *  because one fee covers the whole line item, not each break. */
export function lineUnits(line) {
  return ((line && line.splits) || []).reduce((sum, s) => sum + (Number(s && s.qty) || 0), 0);
}

/** True when the rep typed this line's fee (so nothing may overwrite it). */
export const hasEditedSetupFee = (line) => !!(line && line.setupFeeEdited);

/** The fee the product's own ladder implies for this line, ignoring edits. */
export function derivedSetupFee(line) {
  return money(line && line.setupFeeAuto) || 0;
}

/** THE fee for a line item: the rep's edit when there is one, else the
 *  product-derived fee. Free promo giveaway lines never carry setup. */
export function lineSetupFee(line) {
  if (!line || line.free) return 0;
  if (hasEditedSetupFee(line)) return money(line.setupFee) || 0;
  return derivedSetupFee(line);
}

/** Setup across a whole proposal — the piece missing from every total. */
export function setupFeeTotal(lines) {
  return round2((lines || []).reduce((sum, l) => sum + lineSetupFee(l), 0));
}

/** Record the derived fee from a freshly-priced line. Returns the SAME line
 *  when nothing changed, so it can sit inside a React reprice pass without
 *  forcing a re-render, and never clobbers a rep's edit. */
export function withDerivedSetupFee(line, setupBreaks) {
  if (!line) return line;
  const derived = setupFeeAt(setupBreaks, lineUnits(line));
  if (round2(line.setupFeeAuto) === derived && line.setupFeeAuto != null) return line;
  return { ...line, setupFeeAuto: derived };
}

/** Apply a typed fee to the line item (all of its price breaks at once). */
export function editLineSetupFee(line, value) {
  return { ...(line || {}), setupFee: money(value) || 0, setupFeeEdited: true };
}

/** Drop the edit and fall back to the product's own ladder. */
export function resetLineSetupFee(line) {
  const next = { ...(line || {}) };
  delete next.setupFee;
  delete next.setupFeeEdited;
  return next;
}

/** Should the proposal line show a setup-fee row?
 *
 *  Only when the product ACTUALLY HAS a setup fee, or the rep has taken it
 *  over. Golf balls and poker chips carry no setup ladder (their decoration
 *  cost rides in the modification's PriceTier), so they must not show a
 *  "$0.00" row that reads like a real charge.
 *
 *  Deliberately independent of the CURRENT amount: once the row is showing it
 *  has to stay put while the rep edits — including through an empty field or a
 *  waive-to-zero — or the control unmounts mid-keystroke and the number can't
 *  be retyped. `hasEditedSetupFee` is what holds it open, which is also why
 *  waiving uses an explicit edit to 0 rather than clearing the field. */
export function offersSetupFee(line) {
  if (!line || line.free) return false;
  return derivedSetupFee(line) > 0 || hasEditedSetupFee(line);
}

/** Fee fields to persist with a saved proposal line (empty when there's
 *  nothing to keep, so saved drafts don't grow keys for every line). */
export function setupFeeSnapshot(line) {
  const out = {};
  if (line && line.setupFeeAuto != null) out.setupFeeAuto = round2(line.setupFeeAuto);
  if (hasEditedSetupFee(line)) { out.setupFee = money(line.setupFee) || 0; out.setupFeeEdited = true; }
  return out;
}
