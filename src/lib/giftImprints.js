/* ───────────────────────────────────────────────────────────────────────────
   giftImprints — the per-personalization "imprint" model for the Gift-Catalog
   proposal view. Pure logic (no React) so it's unit-testable in isolation.

   A proposal line's `decoration` carries up to TWO imprints: the FRONT (engine-
   specific) and the opposite-pole SECOND (`pole2`). The proposal renders ONE
   draggable tag per imprint. Dragging a tag carries a single portable `imprint`
   that knows its source `engine` + `kind`, so a drop can be (a) validated against
   what the TARGET product supports and (b) merged onto the right pole.

   Engines: ballLogo / logoOverlay (logo) · ballText (ball Personalized) ·
   monogram (ball) · accessoryText (tee text) · towelText / towelMonogram
   (Golf-Towel / Hat embroidery). The stored decoration shape is never changed
   here — these are read-time derivations + a merge that returns a new decoration.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Product capabilities — what a given product can be decorated with ──────── */
export const ballish = (p) => !!(p && p.cat === 'Logo Golf Balls' && !((p.modNames || []).includes('Custom Accessory Bundle')));
export const supportsMod = (p, name) => Array.isArray(p && p.modNames) && p.modNames.includes(name);
export const supportsLogo = (p) => !!(p && (p.customLogo || supportsMod(p, 'Custom Logo')));
// Balls carry a second-pole imprint BY DEFAULT (the Personalized / Custom-Logo
// modifications include a "Second Pole" option); the `dualPole` flag is the
// accessory opt-in (poker chips, etc.). ExcludeDualPole removes it either way.
export const supportsDualPole = (p) => !!(p && !p.excludeDualPole && (ballish(p) || p.dualPole));
// Embroidery (Golf Towel / Golf Hat) carries Personalized text AND Monogram on
// accessories — distinct from a ball monogram and from a printed Custom Logo.
export const supportsEmbroidery = (p) => supportsMod(p, 'Golf Towel') || supportsMod(p, 'Golf Hat');

// Can `target` receive an imprint produced by `engine`? Each personalization
// engine maps to the product capability it needs — this is how a tag "knows
// what it can go on" (a logo is universal; ball text only lands on balls; tee
// text only on tees; embroidery only on towels/hats; monograms by family).
export function targetTakesEngine(target, engine) {
  switch (engine) {
    case 'ballLogo': case 'logoOverlay': return supportsLogo(target);
    case 'ballText':       return ballish(target) && supportsMod(target, 'Personalized');
    case 'monogram':       return ballish(target) && supportsMod(target, 'Monogram');
    case 'accessoryText':  return !ballish(target) && supportsMod(target, 'Tee');
    case 'towelText': case 'towelMonogram': return !ballish(target) && supportsEmbroidery(target);
    default: return false;
  }
}

/* ── Portable imprint descriptors ───────────────────────────────────────────── */
const _textImprint = (slot, engine, p) => {
  const lines = ((p && p.lines) || []).filter((l) => l != null && String(l).trim() !== '');
  return { slot, engine, kind: 'text', lines: (p && p.lines) || [null, null, null], font: (p && p.font) || 'Kabel Dm BT', color: (p && p.color) || '#000000',
    label: lines.length ? `Personalized — “${lines.join(' / ')}”` : 'Personalized', image: null };
};
const _monoImprint = (slot, engine, m) => ({ slot, engine, kind: 'monogram', text: (m && m.text) || '', view: m && m.view,
  color: (m && m.color) || '#000000', color2: (m && m.color2) || '#FFFFFF', overlay: (m && m.overlay) || String((m && m.view) || 'circle').replace(/\d+$/, ''),
  label: `Monogram — ${String((m && m.text) || '').toUpperCase()}`, image: null });
const _logoImprint = (slot, engine, src) => ({ slot, engine, kind: 'logo', logo: (src && src.logo) || null, _localImageDataUrl: (src && src._localImageDataUrl) || null,
  label: 'Custom logo', image: (src && src._localImageDataUrl) || (src && src.logo && (src.logo.dataUrl || src.logo.preview)) || null });

// The FRONT imprint of a decoration as a portable descriptor (or null).
export function frontImprint(deco) {
  if (!deco || !deco.engine || deco.engine === 'none') return null;
  const e = deco.engine;
  if (e === 'ballText' || e === 'accessoryText' || e === 'towelText') return _textImprint('front', e, deco.pole1);
  if (e === 'monogram' || e === 'towelMonogram') return _monoImprint('front', e, deco.monogram);
  if (e === 'ballLogo' || e === 'logoOverlay') return _logoImprint('front', e, deco);
  return null;
}
// The opposite-pole (pole2) imprint as a portable descriptor (or null). pole2 is
// a ball concept, so it maps back to the ball engines for capability checks.
export function secondImprint(deco) {
  const p2 = deco && deco.pole2; if (!p2 || !p2.kind) return null;
  if (p2.kind === 'text') return _textImprint('second', 'ballText', p2);
  if (p2.kind === 'monogram') return _monoImprint('second', 'monogram', p2);
  return _logoImprint('second', 'ballLogo', p2);
}
/* A proposal line's imprints as render-ready chips (0–2): front + (dual) 2nd pole.
   Each chip is independently draggable & deletable. Pure render-time derivation —
   the stored `decoration` shape is untouched, so save/load/cart are unaffected. */
export function decoImprints(deco) {
  const out = [];
  const f = frontImprint(deco); if (f) out.push(f);
  const s = (deco && deco.dualPole && deco.pole2) ? secondImprint(deco) : null; if (s) out.push(s);
  return out;
}

/* ── Merge logic — placing a dragged imprint onto a target line ─────────────── */
// Build a FRONT decoration from a portable imprint dropped on `target`. Logo is
// the only engine that re-targets (ball ↔ accessory); the rest keep their source
// engine (validation has already confirmed the target supports it).
export function frontFromImprint(target, imp) {
  const baseColor = '#FFFFFF', finish = { MFS: '279', SecondMFS: '279' };
  if (imp.kind === 'logo') {
    return { engine: ballish(target) ? 'ballLogo' : 'logoOverlay', baseColor, finish, dualPole: false, pole2: null,
      logo: imp.logo || null, _localImageDataUrl: imp._localImageDataUrl || null };
  }
  if (imp.kind === 'monogram') {
    return { engine: imp.engine === 'towelMonogram' ? 'towelMonogram' : 'monogram', baseColor, finish, dualPole: false, pole2: null,
      monogram: { baseColor, text: imp.text || '', view: imp.view, color: imp.color || '#000000', color2: imp.color2 || '#FFFFFF', overlay: imp.overlay || 'circle' } };
  }
  // text
  return { engine: imp.engine, baseColor, finish, dualPole: false, pole2: null,
    pole1: { lines: imp.lines || [null, null, null], font: imp.font || 'Kabel Dm BT', color: imp.color || '#000000' } };
}
// A pole2 (2nd-pole) descriptor from a portable imprint.
export function pole2FromImprint(imp) {
  if (imp.kind === 'text') return { kind: 'text', lines: imp.lines || [null, null, null], font: imp.font || 'Kabel Dm BT', color: imp.color || '#000000' };
  if (imp.kind === 'monogram') return { kind: 'monogram', text: imp.text || '', view: imp.view, color: imp.color || '#000000', color2: imp.color2 || '#FFFFFF', overlay: imp.overlay };
  return { kind: 'logo', logo: imp.logo || null, fileName: (imp.logo && imp.logo.fileName) || '', _localImageDataUrl: imp._localImageDataUrl || null };
}

/* Can `imp` (a single imprint) be dropped on `target`? → { ok, reason, slot }.
   Gate 1 = type/family scoping (what the tag can go on, via targetTakesEngine);
   Gate 2 = slot availability (front, else a free compatible 2nd pole, else locked). */
export function canApplyImprint(target, imp, deco) {
  if (!target) return { ok: false, reason: 'No target' };
  if (!imp || !imp.kind) return { ok: false, reason: 'Nothing to copy' };
  const name = target.title || 'This item';
  if (!targetTakesEngine(target, imp.engine)) {
    const why = imp.kind === 'logo' ? 'take a custom logo' : imp.kind === 'monogram' ? 'support monograms' : 'support that personalization';
    return { ok: false, reason: `${name} doesn’t ${why}` };
  }
  const ex = decoImprints(deco);
  const hasFront = ex.some((c) => c.slot === 'front'), hasSecond = ex.some((c) => c.slot === 'second');
  if (!hasFront) return { ok: true, slot: 'front' };
  if (hasSecond) return { ok: false, reason: `${name} already has two imprints` };
  if (deco && (deco.engine === 'monogram' || deco.engine === 'towelMonogram')) return { ok: false, reason: 'A monogram can’t carry a second imprint' };
  if (imp.kind === 'monogram') return { ok: false, reason: 'A monogram can’t be a second imprint' };
  if (!supportsDualPole(target)) return { ok: false, reason: `${name} has no second-pole imprint` };
  return { ok: true, slot: 'second' };
}

/* Merge a single imprint into `target`'s decoration. Empty target → the imprint
   becomes the FRONT (text-only ⇒ single, NOT dual). With a front already present,
   the imprint takes the 2nd pole — except a logo always wins the front slot, so a
   logo dropped on a text ball makes the logo the front and demotes the text to
   the 2nd pole ("custom logo with text"). Max two imprints (enforced upstream). */
export function mergeImprint(deco, product, imp) {
  if (!frontImprint(deco)) return frontFromImprint(product, imp);
  const frontIsText = deco.engine === 'ballText' || deco.engine === 'accessoryText' || deco.engine === 'towelText';
  if (imp.kind === 'logo' && frontIsText) {
    const front = frontFromImprint(product, imp); // promote the logo to the front pole
    return { ...front, dualPole: true, pole2: { kind: 'text', lines: deco.pole1.lines, font: deco.pole1.font, color: deco.pole1.color } };
  }
  return { ...deco, dualPole: true, pole2: pole2FromImprint(imp) };
}
