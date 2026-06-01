import React, { useState, useEffect } from 'react';
import { Btn, Tag, Dot } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';

/* ───────────────────────────────────────────────────────────────
   giftCustomize.jsx — the real per-product personalization UI for
   the Corporate Gifting Catalog, replacing the old "N options" count.

   Schema-driven from the live customizer inspection (gb-design/
   golfballs/option-schema.json — the authoritative source; the
   design prototype's control data was flagged wrong). Each product's
   modificationName_ss array drives which option blocks render.

   Two UX families: golf balls get a "Print Type" tile grid; every
   other corporate item gets the Custom Logo decoration block (+ any
   extras like Tee / Poker Chip Second Pole / bundle base colors).
─────────────────────────────────────────────────────────────── */

/* ── Live data (option-schema.json + colors-live.json) ───────── */
/* Imprint palette — 81 named colors scraped from the live ColorSelectorBar.
   First 8 are the "common" quick row; the rest expand on demand. Used by every
   golf-ball imprint color control (Personalized, Monogram ×2, AlignXL ×2, IDAlign ×2). */
const COMMON_COUNT = 8;
const IMPRINT_COLORS = [
  { name: 'Black', hex: '#000000' }, { name: 'Red', hex: '#d2232a' }, { name: 'Green', hex: '#1c4120' },
  { name: 'Blue', hex: '#0b48a0' }, { name: 'Pink', hex: '#ff60b2' }, { name: 'Orange', hex: '#ff6a13' },
  { name: 'Purple', hex: '#582c83' }, { name: 'Gold', hex: '#b59f65' }, { name: 'Chili Pepper Red', hex: '#b61c19' },
  { name: 'Persian Red', hex: '#d32f2e' }, { name: 'Red Orange', hex: '#f24334' }, { name: 'Dark Peach', hex: '#e57373' },
  { name: 'Mulberry', hex: '#880d52' }, { name: 'Burnt Pink', hex: '#c2175b' }, { name: 'Red Pink', hex: '#eb1d63' },
  { name: 'Rosy Pink', hex: '#f06292' }, { name: 'Purple Iris', hex: '#49148d' }, { name: 'Purple Jam', hex: '#7a1fa2' },
  { name: 'Dark Orchid', hex: '#9c28b1' }, { name: 'Rich Lilac', hex: '#b968c7' }, { name: 'Persian Indigo', hex: '#301b90' },
  { name: 'Blueberry', hex: '#512da7' }, { name: 'Dark Lavender', hex: '#653bb7' }, { name: 'Lavender', hex: '#9675ce' },
  { name: 'Denim Blue', hex: '#1c227f' }, { name: 'Cerulean Blue', hex: '#4050b5' }, { name: 'Moody Blue', hex: '#7986cc' },
  { name: 'Royal Azure', hex: '#013088' }, { name: 'Water Blue', hex: '#1976d3' }, { name: 'Azure', hex: '#2196f3' },
  { name: 'Crystal Blue', hex: '#64b5f6' }, { name: 'Venice Blue', hex: '#035697' }, { name: 'Bondi Blue', hex: '#0288d1' },
  { name: 'Bright Cerulean', hex: '#02a9f5' }, { name: 'Picton Blue', hex: '#4fc2f8' }, { name: 'Deep Aqua', hex: '#035f60' },
  { name: 'Teal Blue', hex: '#0098a7' }, { name: 'Topaz', hex: '#01bcd3' }, { name: 'Aquamarine Blue', hex: '#4dd0e2' },
  { name: 'Aqua Deep', hex: '#014b3f' }, { name: 'Pine Green', hex: '#00796a' }, { name: 'Teal', hex: '#009788' },
  { name: 'Light Sea Green', hex: '#4ab5a7' }, { name: 'Everglade', hex: '#184d33' }, { name: 'Fern Green', hex: '#3b8c40' },
  { name: 'Green Apple', hex: '#4cb050' }, { name: 'Pistachio', hex: '#80c77f' }, { name: 'Green Leaf', hex: '#33681e' },
  { name: 'Muted Green', hex: '#699d3a' }, { name: 'Mantis', hex: '#8bc24a' }, { name: 'Pale Olive', hex: '#acd683' },
  { name: 'Hazel', hex: '#817716' }, { name: 'Mustard Green', hex: '#b0b42a' }, { name: 'Pear', hex: '#cddc39' },
  { name: 'Golden Sand', hex: '#dde774' }, { name: 'Pumpkin', hex: '#f47f16' }, { name: 'Sunglow', hex: '#f9c031' },
  { name: 'Banana Yellow', hex: '#ffeb3c' }, { name: 'Sandy Yellow', hex: '#fcf274' }, { name: 'Blaze Orange', hex: '#ff6f00' },
  { name: 'Orange Peel', hex: '#ffa101' }, { name: 'Golden Yellow', hex: '#fec107' }, { name: 'Naples Yellow', hex: '#fdd450' },
  { name: 'Deep Orange', hex: '#e65101' }, { name: 'Gold Drop', hex: '#f67b00' }, { name: 'Medium Orange', hex: '#ff9700' },
  { name: 'Butterscotch', hex: '#ffb64d' }, { name: 'Rusty Red', hex: '#bf360c' }, { name: 'Reddish Orange', hex: '#e64a15' },
  { name: 'Portland Orange', hex: '#fe5722' }, { name: 'Coral', hex: '#ff8964' }, { name: 'English Walnut', hex: '#3c2623' },
  { name: 'Irish Coffee', hex: '#5d4038' }, { name: 'Ferra', hex: '#765647' }, { name: 'Pale Oyster', hex: '#a0887e' },
  { name: 'Gunmetal', hex: '#273238' }, { name: 'River Bed', hex: '#465967' }, { name: 'Slate Blue', hex: '#5f7d8a' },
  { name: 'Cadet Grey', hex: '#90a4ad' }, { name: 'Davy Grey', hex: '#525252' }, { name: 'Regent Grey', hex: '#969696' },
];
const THREAD_COLORS = [
  { name: 'Black', hex: '#1c1c1c' }, { name: 'White', hex: '#f3f3f0' }, { name: 'Red', hex: '#c0392b' },
  { name: 'Orange', hex: '#e07b2e' }, { name: 'Grey', hex: '#8b8f96' }, { name: 'Navy', hex: '#2c3e6b' },
  { name: 'Green', hex: '#2e7d44' }, { name: 'Yellow', hex: '#e1c12e' }, { name: 'Blue', hex: '#2b6fb0' },
  { name: 'Purple', hex: '#7b4ea3' }, { name: 'Pink', hex: '#d36b9a' },
];
const BASE_COLORS = [
  { name: 'Black', hex: '#1c1c1c' }, { name: 'Blue', hex: '#2b6fb0' }, { name: 'Green', hex: '#2e7d44' },
  { name: 'Orange', hex: '#e07b2e' }, { name: 'Pink', hex: '#d36b9a' }, { name: 'Purple', hex: '#7b4ea3' },
  { name: 'Red', hex: '#c0392b' }, { name: 'White', hex: '#f3f3f0' }, { name: 'Yellow', hex: '#e1c12e' },
  { name: 'Gray', hex: '#8b8f96' },
];
const FONTS = ['Kabel Dm BT', 'Calibri', 'Lucida Handwriting', 'Bradley Hand']; // live-verified
const SIZES = ['Standard', 'Large', 'Max'];
/* ── SVG art helpers — monochrome motifs (currentColor) built into the
   style thumbnails so the selector shows what each option actually looks like.
   viewBox 0 0 84 48; exact site art = the referenced cloudfront PNGs. ───── */
const _C = 'currentColor';
function _starPts(cx, cy, r) { let p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return p.join(' '); }
const _star = (cx, cy, r) => `<polygon points="${_starPts(cx, cy, r)}" fill="${_C}"/>`;
const _dot = (cx, cy, r = 3.5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${_C}"/>`;
const _skull = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><line x1="${cx - 5}" y1="${cy - 5}" x2="${cx + 5}" y2="${cy + 5}"/><line x1="${cx + 5}" y1="${cy - 5}" x2="${cx - 5}" y2="${cy + 5}"/></g><circle cx="${cx}" cy="${cy}" r="4" fill="${_C}"/>`;
const _martini = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><path d="M${cx - 5},${cy - 7} L${cx + 5},${cy - 7} L${cx},${cy} Z"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + 7}"/><line x1="${cx - 4}" y1="${cy + 7}" x2="${cx + 4}" y2="${cy + 7}"/></g>`;
const _wine = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><path d="M${cx - 4},${cy - 7} a4,5 0 0,0 8,0 Z"/><line x1="${cx}" y1="${cy - 2}" x2="${cx}" y2="${cy + 7}"/><line x1="${cx - 4}" y1="${cy + 7}" x2="${cx + 4}" y2="${cy + 7}"/></g>`;
const _chev = (cx, cy, s = 6) => `<path d="M${cx - s / 2},${cy - s} L${cx + s / 2},${cy} L${cx - s / 2},${cy + s}" stroke="${_C}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const _hline = (w) => `<line x1="8" y1="24" x2="76" y2="24" stroke="${_C}" stroke-width="${w}" stroke-linecap="round"/>`;
const _row = (fn, xs) => xs.map((x) => fn(x, 24)).join('');
const _txt = (x, y, s, str, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-size="${s}" fill="${_C}" ${extra}>${str}</text>`;

/* Monogram styles (7) grouped 3 / 2 / 1 Initials — cloudfront …/dropdown-personalization/ */
const MONO_STYLES = [
  { key: 'circle', group: '3 Initials', label: 'Circle', svg: `<circle cx="42" cy="24" r="19" fill="none" stroke="${_C}" stroke-width="1.4"/>${_txt(42, 30, 17, 'ABC', 'font-style="italic"')}` },
  { key: 'hex', group: '3 Initials', label: 'Hexagram', svg: `<polygon points="42,6 60,15 60,33 42,42 24,33 24,15" fill="none" stroke="${_C}" stroke-width="1.4"/>${_txt(42, 29, 14, 'ABC')}` },
  { key: 'gardenia', group: '3 Initials', label: 'Gardenia', svg: `<path d="M16,24q6,-7 12,0q-6,7 -12,0Z" fill="${_C}" opacity=".45"/><path d="M68,24q-6,-7 -12,0q6,7 12,0Z" fill="${_C}" opacity=".45"/><text x="42" y="31" text-anchor="middle" font-family="'Brush Script MT',cursive" font-style="italic" font-size="20" fill="${_C}">ABC</text>` },
  { key: 'vertical', group: '2 Initials', label: 'Vertical', svg: `${_txt(30, 31, 20, 'M')}<line x1="42" y1="10" x2="42" y2="38" stroke="${_C}" stroke-width="1.4"/>${_txt(54, 31, 20, 'D')}` },
  { key: 'horizontal', group: '2 Initials', label: 'Horizontal', svg: `${_txt(42, 20, 15, 'M')}<line x1="28" y1="24" x2="56" y2="24" stroke="${_C}" stroke-width="1.4"/>${_txt(42, 40, 15, 'D')}` },
  { key: 'diagonal', group: '2 Initials', label: 'Diagonal', svg: `${_txt(28, 34, 20, 'M')}<line x1="58" y1="10" x2="26" y2="38" stroke="${_C}" stroke-width="1.4"/>${_txt(56, 24, 20, 'D')}` },
  { key: 'simple-circle', group: '1 Initial', label: 'Simple Circle', svg: `<circle cx="42" cy="24" r="16" fill="none" stroke="${_C}" stroke-width="1.4"/>${_txt(42, 31, 20, 'A')}` },
];

/* AlignXL alignment styles (8) — cloudfront …/images/IDalign/align-xl-*.png */
const ALIGNXL_STYLES = [
  { key: 'star', label: 'Star', svg: _row((x) => _star(x, 24, 5), [12, 26.5, 41, 55.5, 70]) },
  { key: 'thin', label: 'Thin', svg: _hline(2) },
  { key: 'medium', label: 'Medium', svg: _hline(5) },
  { key: 'thick', label: 'Thick', svg: _hline(9) },
  { key: 'dot', label: 'Dot', svg: _row((x) => _dot(x, 24, 3), [12, 24, 36, 48, 60, 72]) },
  { key: 'skull', label: 'Skull', svg: _hline(2) + _skull(42, 24) },
  { key: 'martini', label: 'Martini', svg: _hline(2) + _martini(42, 23) },
  { key: 'wineglass', label: 'Wine', svg: _hline(2) + _wine(42, 23) },
];

/* IDAlign alignment styles (12) — cloudfront …/images/IDalign/*.png */
const IDALIGN_STYLES = [
  { key: 'quadArrow', label: 'Quad Arrow', svg: _row((x) => _chev(x, 24, 5), [18, 33, 48, 63]) },
  { key: 'doubleRow', label: 'Double Row', svg: `<g stroke="${_C}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"><line x1="11" y1="20" x2="73" y2="20"/><line x1="11" y1="28" x2="73" y2="28"/></g>` },
  { key: 'chevron', label: 'Chevron', svg: _row((x) => _chev(x, 24, 6), [34, 46, 58]) },
  { key: 'line', label: 'Line', svg: `<line x1="10" y1="24" x2="74" y2="24" stroke="${_C}" stroke-width="2"/>` },
  { key: 'skulls', label: 'Skulls', svg: _row((x) => _skull(x, 24), [27, 42, 57]) },
  { key: 'arrowStyled', label: 'Arrow', svg: `<line x1="20" y1="24" x2="58" y2="24" stroke="${_C}" stroke-width="2.2" stroke-linecap="round"/>${_chev(60, 24, 7)}` },
  { key: 'solidArrow', label: 'Solid Arrow', svg: `<line x1="18" y1="24" x2="55" y2="24" stroke="${_C}" stroke-width="3" stroke-linecap="round"/><polygon points="53,17 68,24 53,31" fill="${_C}"/>` },
  { key: 'solidDots', label: 'Solid Dots', svg: _row((x) => _dot(x, 24, 3.5), [20, 31, 42, 53, 64]) },
  { key: 'solidLine', label: 'Solid Line', svg: `<line x1="10" y1="24" x2="74" y2="24" stroke="${_C}" stroke-width="6" stroke-linecap="round"/>` },
  { key: 'solidStars', label: 'Solid Stars', svg: _row((x) => _star(x, 24, 6), [24, 42, 60]) },
  { key: 'martiniGlasses', label: 'Martini', svg: _row((x) => _martini(x, 23), [27, 42, 57]) },
  { key: 'wine', label: 'Wine', svg: _row((x) => _wine(x, 23), [27, 42, 57]) },
];

/* Icons (30) — real site PNGs, themed; static.golfballs.com/A/icons/ */
const ICON_HOST = 'https://static.golfballs.com/A/icons/';
const ICON_THEMES = {
  'Dad / Father\'s Day': [['Dad Beer', 'dad-beer.png'], ['No. 1 Dad', 'no-1-dad.png'], ['Tie', 'tie.png'], ['Dad Crown', 'dad-crown.png'], ['Best Dad by Par', 'best-dad-by-par.png']],
  'Drinks': [['Martini', 'martini2.png'], ['Old Fashioned', 'old-fashioned.png'], ['Tom Collins', 'tom-collins.png'], ['Bloody Mary', 'bloody-mary.png'], ['Margarita', 'margarita.png'], ['Cosmopolitan', 'cosmopolitan.png'], ['Wine Glass', 'wine-glass.png'], ['Beer Mug', 'beer-mug-colored.png'], ['Cigar', 'cigar.png']],
  'USA / Patriotic': [['USA Sunglasses', 'usa-sunglasses.png'], ['USA Wordmark', 'usa-wordmark.png'], ['USA Flag', 'usa-flag.png'], ['Merica', 'merica.png']],
  'Masters': [['Masters Azalea', 'masters-azalea.png'], ['Masters Sweet Tea', 'masters-sweet-tea.png'], ['Masters Pimento Cheese', 'masters-pimento-cheese.png'], ['Masters Jumpsuit', 'masters-jumpsuit.png']],
  'Misc': [['Four-leaf Clover', 'fourleafclover-full-color.png'], ['Flamingo', 'flamingo-colored.png'], ['Sunglasses', 'sunglasses.png'], ['Skull & Crossbones', 'skullandcrossbones.png'], ['Ladybug', 'ladybug-color.png'], ['Bomb', 'bomb.png'], ['Taco', 'taco.png'], ['Dots Green', 'dots-green.png']],
};

/* Solr modificationName_ss spellings → our schema keys (live uses a space / singular). */
const MOD_ALIAS = { 'Align XL': 'AlignXL', 'Icon': 'Icons' };

/* modificationName_ss value → control schema (live-verified). Folds of Honor
   intentionally omitted (niche licensed art — excluded per product owner). */
const MODS = {
  'Custom Logo': { controls: ['imageUpload', 'secondImprint', 'commercial'] },
  'Personalized': { controls: ['personalized'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Monogram': { controls: ['monoStyle', 'initials', 'color', 'color2'], preview: true },
  'Photo': { controls: ['photoUpload'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Custom Player Number': { controls: ['number'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'AlignXL': { controls: ['alignXL', 'optText', 'textColor', 'lineColor', 'sameColor'], preview: true },
  'IDAlign': { controls: ['alignID', 'initials', 'textColor', 'lineColor'], preview: true },
  'Icons': { controls: ['iconGrid'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Tee': { controls: ['line1', 'textColorSingle'], preview: true },
  'Poker Chip Second Pole': { controls: ['secondImprint'] },
  'Custom Accessory Bundle': { controls: ['bundle'] },
  'Golf Towel': { controls: [], note: 'Matching towel add-on (verify in live UI before quoting).' },
  'Golf Hat': { controls: [], note: 'Matching hat add-on (verify in live UI before quoting).' },
};
/* Canonical print-type order for the golf-ball grid (Folds removed). The grid
   shows only the intersection of this with a product's real modNames. */
const BALL_ORDER = ['Custom Logo', 'Personalized', 'Monogram', 'Photo', 'AlignXL', 'IDAlign', 'Icons', 'Custom Player Number'];

/* Normalize a product's raw modificationName_ss → our supported keys,
   aliasing Solr spellings and dropping Folds of Honor + anything unknown. */
function supportedMods(p) {
  const raw = Array.isArray(p.modNames) ? p.modNames : [];
  return [...new Set(raw.map((m) => MOD_ALIAS[m] || m).filter((m) => MODS[m] && m !== 'Folds of Honor'))];
}

/* Which modifications + which UX layout a product gets. Golf balls → the
   print-type grid, gated to the product's REAL modNames (so e.g. Custom Player
   Number shows only on Pro V1/Pro V1x, and zero-customization balls show none).
   Everything else → its feed mods, Custom Logo guaranteed when decoration exists. */
export function modsForProduct(p) {
  const norm = supportedMods(p);
  if (p.cat === 'Logo Golf Balls') {
    return { ux: 'grid', mods: BALL_ORDER.filter((m) => norm.includes(m)) };
  }
  const mods = norm.length ? (norm.includes('Custom Logo') ? norm : ['Custom Logo', ...norm]) : ['Custom Logo'];
  return { ux: 'inline', mods };
}


const UploadI = (props) => <Icon {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></Icon>;
const SparkI = (props) => <Icon {...props}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Icon>;
const money = (n) => '$' + (n || 0).toFixed(2);

/* ── primitives ──────────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>{label}{required && <span style={{ color: 'var(--gb-danger, #e5484d)' }}> *</span>}</div>}
      {children}
    </div>
  );
}
function TextInput({ value, onChange, placeholder, maxLength }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (f ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), boxShadow: f ? 'var(--gb-focus-ring)' : 'none', transition: 'all var(--gb-anim)' }}>
      <input value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5, fontWeight: 500 }} />
      {maxLength && <span style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>{(value || '').length}/{maxLength}</span>}
    </div>
  );
}
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} style={{ padding: '5px 12px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, transition: 'all var(--gb-anim)', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', boxShadow: on ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'none' }}>{o}</button>
        );
      })}
    </div>
  );
}
/* hex → HSL, used to order the palette by hue then shade */
function hexToHsl(hex) {
  if (!hex || hex === 'transparent') return { h: 999, s: 0, l: 2 };
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
/* group by hue family (near-grays last), shades adjacent (light → dark) within each */
function sortByHueShade(colors) {
  return colors.map((c) => ({ c, hsl: hexToHsl(c.hex) })).sort((a, b) => {
    const ag = a.hsl.s < 0.12, bg = b.hsl.s < 0.12;
    if (ag !== bg) return ag ? 1 : -1;
    if (ag && bg) return b.hsl.l - a.hsl.l;
    const ah = Math.floor(a.hsl.h / 30), bh = Math.floor(b.hsl.h / 30);
    if (ah !== bh) return ah - bh;
    return b.hsl.l - a.hsl.l;
  }).map((x) => x.c);
}
function Swatch({ color, on, onClick, size = 20 }) {
  const trans = color.name === 'Transparent';
  return (
    <button onClick={onClick} title={color.name} style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', padding: 0, position: 'relative', flexShrink: 0, background: trans ? 'var(--gb-fill-subtle)' : color.hex, border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), boxShadow: on ? '0 0 0 1.5px var(--gb-surface-modal), 0 0 0 3px var(--gb-brand-label)' : 'none', transition: 'all var(--gb-anim)' }}>
      {trans && <span style={{ position: 'absolute', inset: 2, borderTop: '1.5px solid var(--gb-danger, #e5484d)', transform: 'rotate(45deg)' }} />}
    </button>
  );
}
/* Compact imprint-color picker: a common quick row, expandable to the full
   palette organized by hue then shade. */
function ColorRow({ swatches, transparent, value, onChange }) {
  const [showAll, setShowAll] = useState(false);
  const transOpt = transparent ? [{ name: 'Transparent', hex: 'transparent' }] : [];
  const expandable = swatches.length > 24;
  const list = (!expandable || showAll)
    ? [...transOpt, ...sortByHueShade(swatches)]
    : [...transOpt, ...swatches.slice(0, COMMON_COUNT)];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>{value}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: showAll ? 132 : 'none', overflowY: showAll ? 'auto' : 'visible', paddingRight: showAll ? 4 : 0 }}>
        {list.map((c) => <Swatch key={c.name} color={c} on={value === c.name} onClick={() => onChange(c.name)} size={20} />)}
      </div>
      {expandable && (
        <button onClick={() => setShowAll((s) => !s)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, color: 'var(--gb-brand-label)' }}>
          {showAll ? '− Show fewer' : `+ ${swatches.length - COMMON_COUNT} more colors`}
        </button>
      )}
    </div>
  );
}
function Checkbox({ checked, onClick, label, note }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
      <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--gb-brand-label)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), color: 'var(--gb-surface-deep)' }}>
        {checked && <I.check size={11} strokeWidth={3} />}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{label}{note && <span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}> · {note}</span>}</span>
    </div>
  );
}

/* renders an SVG-string thumbnail (currentColor) at tile size */
function SvgArt({ inner, w = 56, h = 32 }) {
  return <svg viewBox="0 0 84 48" width={w} height={h} dangerouslySetInnerHTML={{ __html: inner }} />;
}
/* selectable grid of SVG-art style tiles (alignment graphics) */
function GraphicGrid({ items, value, onChange, cols = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button key={it.key} onClick={() => onChange(it.key)} title={it.label || it.key} style={{ height: 50, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
            <SvgArt inner={it.svg} />
          </button>
        );
      })}
    </div>
  );
}
/* monogram style picker — grouped 3 / 2 / 1 Initials, real SVG layouts */
function MonoGrid({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {['3 Initials', '2 Initials', '1 Initial'].map((g) => (
        <div key={g}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--gb-text-muted)', marginBottom: 6 }}>{g}</div>
          <GraphicGrid items={MONO_STYLES.filter((s) => s.group === g)} value={value} onChange={onChange} cols={3} />
        </div>
      ))}
    </div>
  );
}
/* themed icon grid — the real site PNGs */
function IconGrid({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto', paddingRight: 4 }}>
      {Object.entries(ICON_THEMES).map(([theme, items]) => (
        <div key={theme}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--gb-text-muted)', marginBottom: 6 }}>{theme}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
            {items.map(([name, file]) => {
              const on = value === name;
              return (
                <button key={name} onClick={() => onChange(name)} title={name} style={{ height: 46, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)') }}>
                  <img src={ICON_HOST + file} alt={name} loading="lazy" style={{ maxWidth: 32, maxHeight: 32 }} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageUpload({ ai, label = 'Upload Your Company Logo' }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ padding: '20px 16px', borderRadius: 'var(--gb-r-lg)', textAlign: 'center', cursor: 'pointer', background: hover ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-inverse-medium)', border: '1.5px dashed ' + (hover ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), transition: 'all var(--gb-anim)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', margin: '0 auto 9px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UploadI size={17} /></div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3 }}>Drag files here or <span style={{ color: 'var(--gb-brand-label)', fontWeight: 600 }}>click to browse</span></div>
      </div>
      {ai && <Btn variant="secondary" size="sm" icon={<SparkI />} style={{ alignSelf: 'flex-start' }}>AI Image Generator</Btn>}
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--gb-text-secondary)' }}>OR</b> email your logo to <span style={{ color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>art@golfballs.com</span> — we’ll contact you after you order.
        <span style={{ display: 'block', color: 'var(--gb-brand-label)', fontWeight: 600, marginTop: 3 }}>Need design help? Free consultation →</span>
      </div>
    </div>
  );
}
/* Second-pole imprint — the live reveal: a choice row, then the matching control. */
const SECOND_IMPRINT_CHOICES = ['Same as Front', 'Personalized', 'Monogram', 'Upload Image', 'Logo Library', 'Custom'];
/* full personalized imprint — 3 wired text lines + imprint color, font, size.
   Shared by the Personalized print type and the second-pole Personalized choice. */
function PersonalizedImprint() {
  const [l1, setL1] = useState('');
  const [l2, setL2] = useState('');
  const [l3, setL3] = useState('');
  const [color, setColor] = useState('Black');
  const [font, setFont] = useState(FONTS[0]);
  const [size, setSize] = useState(SIZES[0]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Field label="Line 1" required><TextInput value={l1} onChange={setL1} placeholder="Your text" maxLength={17} /></Field>
      <Field label="Optional Line 2"><TextInput value={l2} onChange={setL2} placeholder="Optional" maxLength={17} /></Field>
      <Field label="Optional Line 3"><TextInput value={l3} onChange={setL3} placeholder="Optional" maxLength={17} /></Field>
      <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={color} onChange={setColor} /></Field>
      <Field label="Font"><Segmented options={FONTS} value={font} onChange={setFont} /></Field>
      <Field label="Size"><Segmented options={SIZES} value={size} onChange={setSize} /></Field>
    </div>
  );
}

function SecondImprint() {
  const [on, setOn] = useState(false);
  const [choice, setChoice] = useState('Same as Front');
  const [mono, setMono] = useState(MONO_STYLES[0].key);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Checkbox checked={on} onClick={() => setOn(!on)} label="Add Second Imprint (Optional)" />
      {on && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SECOND_IMPRINT_CHOICES.map((v) => {
              const sel = choice === v;
              return <button key={v} onClick={() => setChoice(v)} style={{ padding: '7px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: sel ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (sel ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{v}</button>;
            })}
          </div>
          {choice === 'Personalized' && <PersonalizedImprint />}
          {choice === 'Monogram' && <MonoGrid value={mono} onChange={setMono} />}
          {(choice === 'Upload Image' || choice === 'Custom' || choice === 'Logo Library') && <ImageUpload label="Upload Second Imprint" />}
          {choice === 'Same as Front' && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Reuses your front imprint on the second pole.</div>}
        </div>
      )}
    </div>
  );
}
function Commercial({ p, config, serviceLevel }) {
  const ladder = (p.breaks && p.breaks.length ? p.breaks : [{ q: p.minQty || 12, p: p.price || 0 }]);
  // setup fee + service options come from the live config; balls (no config) keep the legacy defaults.
  const serviceOpts = config
    ? (config.serviceLevel && config.serviceLevel.length ? config.serviceLevel : config.shipping)
    : (serviceLevel ? ['8 Business Day Standard', '3-Day', '2-Day', 'Overnight'] : []);
  const prodTime = p.productionTime;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Min qty</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{p.minQty || 12}</div>
        </div>
        {prodTime != null && prodTime > 0 && (
          <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Production</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{prodTime}<span style={{ fontSize: 10, fontWeight: 600 }}> day{prodTime === 1 ? '' : 's'}</span></div>
          </div>
        )}
      </div>
      {serviceOpts.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Service level</div>
          <select defaultValue={serviceOpts[0]} style={{ width: '100%', height: 32, padding: '0 10px', background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600 }}>
            {serviceOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 6 }}>Volume price ladder · per unit</div>
        <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          {ladder.map((b, i) => {
            const best = i === ladder.length - 1;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 11px', background: best ? 'var(--gb-brand-tint-soft)' : i % 2 ? 'var(--gb-fill-faint)' : 'transparent', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>{b.q}+ qty</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: best ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>{money(b.p)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 5 }}>Unit price includes application of your custom logo.</div>
      </div>
    </div>
  );
}

/* ── config-driven accessory customizer ──────────────────────────────────────
   The real per-product options come from the product page's ProductModification
   + ProductChild (fetched via background.js fetchProductConfig). */
function useProductConfig(p) {
  const [state, setState] = useState({ loading: !!(p && p.url), config: null });
  useEffect(() => {
    const canMsg = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    if (!p || !p.url || !canMsg) { setState({ loading: false, config: null }); return undefined; }
    let alive = true;
    setState({ loading: true, config: null });
    try {
      chrome.runtime.sendMessage({ action: 'fetchProductConfig', url: p.url }, (resp) => {
        if (!alive) return;
        setState({ loading: false, config: resp && resp.ok ? resp.config : null });
      });
    } catch (e) { setState({ loading: false, config: null }); }
    return () => { alive = false; };
  }, [p && p.url]);
  return state;
}

/* base product color — labelled buttons, exactly like the live site */
function BaseColorPicker({ label = 'Color', colors, value, onChange }) {
  if (!colors || colors.length < 1) return null;
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {colors.map((c) => {
          const on = value === c;
          return <button key={c} onClick={() => onChange(c)} style={{ padding: '6px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{c}</button>;
        })}
      </div>
    </Field>
  );
}

/* Custom Logo decoration — logo upload + (second imprint only where the product
   actually has a second pole) + commercial block. */
function CustomLogoFlow({ p, config, dualPole }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ImageUpload />
      {dualPole && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 7 }}>Second Pole Imprint</div>
          <SecondImprint />
        </div>
      )}
      <Commercial p={p} config={config} />
    </div>
  );
}

/* embroidery decoration: text + thread color */
function PersonalizedDecoration() {
  const [v, setV] = useState('');
  const [c, setC] = useState('Black');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Line 1"><TextInput value={v} onChange={setV} placeholder="Your text" maxLength={17} /></Field>
      <Field label="Thread Color"><ColorRow swatches={THREAD_COLORS} value={c} onChange={setC} /></Field>
    </div>
  );
}

/* embroidery decoration: monogram style + initials + two imprint colors */
function MonogramDecoration() {
  const [style, setStyle] = useState(MONO_STYLES[0].key);
  const [v, setV] = useState('');
  const [c1, setC1] = useState('Black');
  const [c2, setC2] = useState('Transparent');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Monogram Style"><MonoGrid value={style} onChange={setStyle} /></Field>
      <Field label="Initials"><TextInput value={v} onChange={setV} placeholder="ABC" maxLength={3} /></Field>
      <Field label="Color 1"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>
      <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>
    </div>
  );
}

/* one base-product input (Color, Size, Metal Finish, Imprint side, …) — from data */
function PropertyInput({ label, options }) {
  const [v, setV] = useState(options[0]);
  const clean = (label || 'Option').replace(/^(Accessories|Apparel|Product)\s+/i, '');
  return <BaseColorPicker label={clean} colors={options} value={v} onChange={setV} />;
}

/* all of a product's base-product inputs (PropertyProduct / property_*_ss) —
   shared by the golf-ball and accessory paths so e.g. Ball Color always shows. */
function BaseProperties({ p, config }) {
  // The product page (PropertyProduct) is authoritative; the catalog facet is an
  // incomplete fallback (some products, e.g. Devant towels, have no facet at all).
  const all = (config && config.properties && config.properties.length) ? config.properties : (p.properties || []);
  // Skip single-value properties (e.g. "Colors in Logo: [1 Color]") — not a real picker.
  const properties = all.filter((prop) => (prop.options || []).length > 1);
  return <>{properties.map((prop, i) => <PropertyInput key={(prop.label || '') + i} label={prop.label} options={prop.options} />)}</>;
}

/* a tee imprint — text (up to 23 chars) + text color */
function TeeDecoration() {
  const [v, setV] = useState('');
  const [c, setC] = useState('Black');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Imprint Text"><TextInput value={v} onChange={setV} placeholder="Up to 23 characters" maxLength={23} /></Field>
      <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c} onChange={setC} /></Field>
    </div>
  );
}

/* The translation from modificationName_ss → decoration tabs (the "connection"):
   Custom Logo → Custom; a Golf Towel/Hat embroidery mod → Personalized; Tee → Tee;
   Photo → Photo; Monogram/Personalized map to themselves. Live-verified against the
   Tri-Fold towel (["Golf Towel","Custom Logo"] → Stock / Personalized / Custom). */
function decorationsFor(mods) {
  const norm = [...new Set((mods || []).map((m) => MOD_ALIAS[m] || m))];
  const decos = [];
  const add = (tab, kind) => { if (!decos.some((d) => d.tab === tab)) decos.push({ tab, kind }); };
  norm.forEach((m) => {
    if (m === 'Custom Logo') add('Custom', 'custom');
    else if (/^Golf (Towel|Hat)/i.test(m)) add('Personalized', 'personalized');
    else if (m === 'Personalized') add('Personalized', 'personalized');
    else if (m === 'Monogram') add('Monogram', 'monogram');
    else if (m === 'Tee') add('Tee', 'tee');
    else if (m === 'Photo') add('Photo', 'photo');
  });
  return decos;
}
const DECO_ORDER = ['Stock', 'Personalized', 'Monogram', 'Tee', 'Photo', 'Custom'];
function renderDeco(kind, p, config, dualPole) {
  switch (kind) {
    case 'custom': return <CustomLogoFlow p={p} config={config} dualPole={dualPole} />;
    case 'personalized': return <PersonalizedDecoration />;
    case 'monogram': return <MonogramDecoration />;
    case 'tee': return <TeeDecoration />;
    case 'photo': return <ImageUpload ai label="Upload Image" />;
    case 'stock': return <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '8px 0' }}>Buy as-is — no decoration.</div>;
    default: return null;
  }
}

/* the decoration area: one inline block, or Stock / … / Custom tabs when the
   product supports more than one decoration type (driven by modificationName_ss). */
function DecorationArea({ p, config, mods, dualPole }) {
  const decos = decorationsFor(mods);
  const [active, setActive] = useState('Custom');
  if (decos.length <= 1) return renderDeco(decos[0] ? decos[0].kind : 'custom', p, config, dualPole);
  const tabs = [{ tab: 'Stock', kind: 'stock' }, ...decos].sort((a, b) => DECO_ORDER.indexOf(a.tab) - DECO_ORDER.indexOf(b.tab));
  const cur = tabs.find((t) => t.tab === active) || tabs[tabs.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gb-border-subtle)', flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const on = cur.tab === t.tab;
          return <button key={t.tab} onClick={() => setActive(t.tab)} style={{ padding: '8px 13px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'transparent'), marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)' }}>{t.tab}</button>;
        })}
      </div>
      {renderDeco(cur.kind, p, config, dualPole)}
    </div>
  );
}

/* a bundle (customData.bundleItems) — one decoration section per component */
function BundleSections({ items, p, config, dualPole }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((item, i) => {
        const isTee = /tee/i.test(item);
        // bundleItems carry raw mod names like "Generic Inhouse Custom" — label them sensibly
        const label = isTee ? 'Tee' : (/custom|logo/i.test(item) ? 'Custom Logo' : item);
        return (
          <div key={i} style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
            <div style={{ padding: '9px 12px', background: 'var(--gb-fill-subtle)', fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)', textTransform: 'capitalize' }}>{label}</div>
            <div style={{ padding: 14 }}>
              {isTee ? <TeeDecoration /> : <CustomLogoFlow p={p} config={config} dualPole={dualPole} />}
            </div>
          </div>
        );
      })}
      <Commercial p={p} config={config} />
    </div>
  );
}

/* the accessory customizer: every base-product input (from PropertyProduct /
   property_*_ss), then the decoration blocks from modificationName_ss. */
function AccessoryCustomizer({ p, config, loading }) {
  // Modifications / second pole / bundle: the catalog doc's customData_s is the
  // authoritative source (richer than the product page), so prefer p.* here.
  const mods = (p.modNames && p.modNames.length) ? p.modNames : ((config && config.modifications) || []);
  const dualPole = p.dualPole || (config && config.dualPole) || false;
  const bundleItems = (p.bundleItems && p.bundleItems.length) ? p.bundleItems : ((config && config.bundleItems) || null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loading && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Loading live options…</div>}
      <BaseProperties p={p} config={config} />
      {bundleItems && bundleItems.length
        ? <BundleSections items={bundleItems} p={p} config={config} dualPole={dualPole} />
        : <DecorationArea mods={mods} p={p} config={config} dualPole={dualPole} />}
    </div>
  );
}

/* one control unit, keyed by the schema's control id */
function Control({ k, p, config, serviceLevel }) {
  const [v, setV] = useState('');
  const [c1, setC1] = useState('Black'); const [c2, setC2] = useState('Transparent');
  const [font, setFont] = useState(FONTS[0]); const [size, setSize] = useState(SIZES[0]);
  const [style, setStyle] = useState(MONO_STYLES[0].key);
  const [icon, setIcon] = useState('');
  const [align, setAlign] = useState(ALIGNXL_STYLES[0].key);
  const [alignID, setAlignID] = useState(IDALIGN_STYLES[0].key);
  const [num, setNum] = useState(73); const [same, setSame] = useState(false);
  switch (k) {
    case 'imageUpload': return <ImageUpload />;
    case 'photoUpload': return <ImageUpload ai label="Upload Image" />;
    case 'secondImprint': return <SecondImprint />;
    case 'commercial': return <Commercial p={p} config={config} serviceLevel={serviceLevel} />;
    case 'personalized': return <PersonalizedImprint />;
    case 'lines3': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Field label="Line 1" required><TextInput value={v} onChange={setV} placeholder="Your text" maxLength={17} /></Field>
        <Field label="Optional Line 2"><TextInput value="" onChange={() => {}} placeholder="Optional" maxLength={17} /></Field>
        <Field label="Optional Line 3"><TextInput value="" onChange={() => {}} placeholder="Optional" maxLength={17} /></Field>
      </div>
    );
    case 'line1': return <Field label="Line 1"><TextInput value={v} onChange={setV} placeholder="Imprint text" /></Field>;
    case 'initials': return <Field label="Initials"><TextInput value={v} onChange={setV} placeholder="ABC" maxLength={3} /></Field>;
    case 'optText': return <Field label="Enter Text (Optional)"><TextInput value={v} onChange={setV} maxLength={17} /></Field>;
    case 'color': return <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'color2': return <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>;
    case 'textColor': return <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'textColorSingle': return <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'lineColor': return <Field label="Line Color"><ColorRow swatches={IMPRINT_COLORS} value={c2} onChange={setC2} /></Field>;
    case 'sameColor': return <Checkbox checked={same} onClick={() => setSame(!same)} label="Use same Color" note="line = text color" />;
    case 'thread': return <Field label="Thread Color"><ColorRow swatches={THREAD_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'font': return <Field label="Font"><Segmented options={FONTS} value={font} onChange={setFont} /></Field>;
    case 'size': return <Field label="Size"><Segmented options={SIZES} value={size} onChange={setSize} /></Field>;
    case 'number': return (
      <Field label="Number">
        <div style={{ display: 'inline-flex', alignItems: 'center', height: 32, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          <button onClick={() => setNum((n) => Math.max(0, n - 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>−</button>
          <div style={{ width: 50, textAlign: 'center', fontFamily: 'var(--gb-font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)', borderLeft: '1px solid var(--gb-border-subtle)', borderRight: '1px solid var(--gb-border-subtle)', lineHeight: '32px' }}>{num}</div>
          <button onClick={() => setNum((n) => Math.min(99, n + 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>+</button>
        </div>
      </Field>
    );
    case 'monoStyle': return <Field label="Monogram Style"><MonoGrid value={style} onChange={setStyle} /></Field>;
    case 'alignXL': return <Field label="Alignment Style"><GraphicGrid items={ALIGNXL_STYLES} value={align} onChange={setAlign} /></Field>;
    case 'alignID': return <Field label="Alignment"><GraphicGrid items={IDALIGN_STYLES} value={alignID} onChange={setAlignID} /></Field>;
    case 'iconGrid': return <Field label="Icon"><IconGrid value={icon} onChange={setIcon} /></Field>;
    case 'bundle': return (
      <Field label="Base product color"><ColorRow swatches={BASE_COLORS} value={c1} onChange={setC1} /></Field>
    );
    default: return null;
  }
}

/* the assembled controls for one modification */
function ModControls({ name, p, config, serviceLevel }) {
  const meta = MODS[name];
  if (!meta) return null;
  if (!meta.controls.length) {
    return <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', padding: '4px 0' }}>{meta.note || 'Preset — no buyer-facing controls.'}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {meta.controls.map((k, i) => <Control key={i} k={k} p={p} config={config} serviceLevel={serviceLevel} />)}
      {meta.extras && (
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.bolt size={11} style={{ color: 'var(--gb-brand-label)' }} /> {meta.extras}
        </div>
      )}
    </div>
  );
}

/* golf-ball print-type tile grid */
function PrintTypeGrid({ p, mods, config }) {
  const [sel, setSel] = useState(mods[0]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
        {mods.map((t) => {
          const on = sel === t;
          return (
            <button key={t} onClick={() => setSel(t)} style={{ position: 'relative', minHeight: 54, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--gb-brand-label)' : 'var(--gb-fill-strong)', border: '1px solid var(--gb-border-strong)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{t}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 14 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-brand-label)', marginBottom: 12 }}>{sel}</div>
        <ModControls name={sel} p={p} config={config} serviceLevel />
      </div>
    </div>
  );
}

/* ── exported: the Customization accordion for the DetailPanel ── */
export function CustomizeBlock({ p }) {
  // A "Custom Accessory Bundle" (e.g. a Sleeve/Chip/Tee Kit) is a bundle, not a
  // plain ball — route it to the bundle path even though it's filed under Golf Balls.
  const isBundle = (p.modNames || []).includes('Custom Accessory Bundle');
  const isBall = p.cat === 'Logo Golf Balls' && !isBundle;
  const { mods } = modsForProduct(p);
  const { config, loading } = useProductConfig(p);
  const [open, setOpen] = useState(false);
  // golf ball with no supported print types (USA / pre-decorated editions) → ships as-is
  if (isBall && !mods.length) {
    return (
      <div style={{ marginTop: 16, padding: '11px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', fontSize: 11.5, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <I.alert size={13} style={{ color: 'var(--gb-text-tertiary)' }} /> No customization available — this product ships as-is.
      </div>
    );
  }
  const subtitle = isBall ? `${mods.length} print ${mods.length === 1 ? 'type' : 'types'}` : 'Color & imprint options';
  return (
    <div style={{ marginTop: 16 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', cursor: 'pointer', background: open ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', borderRadius: open ? 'var(--gb-r-md) var(--gb-r-md) 0 0' : 'var(--gb-r-md)', border: '1px solid ' + (open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)') }}>
        <div style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.edit size={12} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Customization</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{subtitle}</div>
        </div>
        <I.chevd size={13} style={{ color: 'var(--gb-text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
      </div>
      {open && (
        <div style={{ border: '1px solid var(--gb-brand-tint-border)', borderTop: 'none', borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)', padding: 14 }}>
          {isBall ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                <BaseProperties p={p} config={config} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Select a print type</span>
                <Tag tone="neutral" size="sm">corporate: Custom Logo</Tag>
              </div>
              <PrintTypeGrid p={p} mods={mods} config={config} />
            </>
          ) : (
            <AccessoryCustomizer p={p} config={config} loading={loading} />
          )}
        </div>
      )}
    </div>
  );
}
