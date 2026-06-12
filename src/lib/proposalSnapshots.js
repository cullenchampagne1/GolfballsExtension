/* ───────────────────────────────────────────────────────────────────────────
   proposalSnapshots.js — turn a proposal line (product + decoration) into the
   list of 3D "shots" to render off-screen for the proposal email previews.

   One shot per imprint: a single-pole ball/chip/tool gets one photo; a DUAL-POLE
   line gets two (front + reverse, each shown face-on); a gift-set line gets one
   photo of the assembled box carrying the front logo. Each shot resolves its
   decal art up front (logo image / rendered text / monogram) so the off-screen
   viewer only has to project a ready image.
   ─────────────────────────────────────────────────────────────────────────── */

import { decoImprints } from './giftImprints.js';
import { giftSetLayout } from './giftSetLayout.js';
import { shapeForProduct, tintForProduct, imprintToDecalUrl } from '../modals/giftCustomize.jsx';

const slotLabel = (slot, total) => slot === 'second' ? 'Reverse' : (total > 1 ? 'Front' : '');

/* Resolve a single proposal line → array of shot specs (async). Empty when the
   line has no personalization to show. */
export async function lineToShots(line) {
  const p = (line && line.product) || {};
  const deco = line && line.decoration;
  if (!deco) return [];
  const chips = decoImprints(deco);   // front (+ second pole) imprints
  const baseTitle = p.title || p.brand || 'Item';

  // Gift set: a single shot of the assembled box wearing the front logo.
  if (deco.giftSet) {
    const layout = giftSetLayout(deco.giftSet);
    const front = chips.find((c) => c.slot === 'front') || chips[0];
    const decalDataUrl = front ? await imprintToDecalUrl(front) : null;
    if (layout) {
      return [{ lineId: line.id, key: line.id + ':set', shape: 'giftset', giftSet: layout, tint: tintForProduct(p, 'ball'), decalDataUrl, label: baseTitle, poleLabel: '' }];
    }
    // No 3D layout for this set — fall through to a plain ball/per-pole render.
  }

  if (!deco.engine || deco.engine === 'none' || !chips.length) return [];
  const shape = shapeForProduct(p);
  const tint = tintForProduct(p, shape);
  const out = [];
  for (const chip of chips) {
    const decalDataUrl = await imprintToDecalUrl(chip);
    if (!decalDataUrl) continue;
    out.push({ lineId: line.id, key: line.id + ':' + chip.slot, shape, tint, decalDataUrl, label: baseTitle, poleLabel: slotLabel(chip.slot, chips.length) });
  }
  return out;
}

/* Resolve every line → a flat list of shots (in line order). Lines with nothing
   to preview contribute nothing. */
export async function linesToShots(lines) {
  const all = [];
  for (const line of (lines || [])) {
    try { all.push(...(await lineToShots(line))); } catch (e) { /* skip a bad line */ }
  }
  return all;
}
