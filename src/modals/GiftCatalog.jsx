import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Btn, IconBtn, Tag, Dot } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { loadCatalog, clearCatalogCache, readCatalogCache, GIFT_CATALOG_SEED, CATEGORY_ORDER, DEPT_ORDER, BRAND_ORDER } from '../lib/giftCatalog.js';
import { loadDevSettings, useDevSetting, STORAGE_KEY as DEV_STORAGE_KEY } from '../lib/devSettings.js';
import { CustomizeBlock, ProductOptions } from './giftCustomize.jsx';
import { buildProposalDraft, copyToClipboard, loadSavedProposals, saveProposalDraft, removeSavedProposal, linesFromSaved, fetchRawProduct } from '../lib/saveProposal.js';
import { ballish, decoImprints, canApplyImprint, mergeImprint } from '../lib/giftImprints.js';
import { decoratedPricingForLine } from '../lib/cartSerializer.js';

/* ───────────────────────────────────────────────────────────────
   GiftCatalog — Corporate Gifting Catalog modal.

   Port of the design (gift-catalog-modal.jsx) onto the real design
   system. A pop-over the rep opens mid-workflow to look up what they
   sell — photos, retail price, and the custom-logo imprint price
   ladder. Data comes from the live Solr feed via loadCatalog()
   (seed-first for an instant paint, then the full live pull).

   "Add to quote" is intentionally a no-op for now.
─────────────────────────────────────────────────────────────── */

/* One-time keyframes (the design's animations). */
function ensureCatalogKeyframes() {
  if (typeof document === 'undefined' || document.getElementById('__gb-catalog-kf')) return;
  const s = document.createElement('style');
  s.id = '__gb-catalog-kf';
  s.textContent = `
    @keyframes gc-pop { from { opacity:0; transform: scale(.96) translateY(8px); } to { opacity:1; transform:none; } }
    @keyframes dp-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes cm-slide { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform:none; } }
    @keyframes cm-fade { from { opacity:0; } to { opacity:1; } }
    @keyframes gb-spin { to { transform: rotate(360deg); } }
    @keyframes gc-orb-pulse { 0% { transform: scale(1); opacity: .5; } 70%, 100% { transform: scale(2.6); opacity: 0; } }
    @keyframes pp-rise { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
    @keyframes gc-indef { 0% { left: -40%; } 100% { left: 100%; } }
    .gb-gc-norail { scrollbar-width: none; -ms-overflow-style: none; }
    .gb-gc-norail::-webkit-scrollbar { width: 0; height: 0; display: none; }`;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Local icons (not in the shared library) ───────────────── */
const Gift  = (p) => <Icon {...p}><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12h18M12 8v13M12 8S10.5 3.5 8 4.2C6 4.8 6.6 8 8.5 8M12 8s1.5-4.5 4-3.8C18 4.8 17.4 8 15.5 8"/></Icon>;
const StarI = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.05 1.1-6.47-4.7-4.58 6.5-.95z"/></Icon>;
const Layers= (p) => <Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></Icon>;
const ArrowL= (p) => <Icon {...p} strokeWidth={2.2}><path d="M19 12H5M12 19l-7-7 7-7"/></Icon>;
const TagI  = (p) => <Icon {...p}><path d="M20.6 13.4L13 21a1.7 1.7 0 01-2.4 0L3 13.4A1.7 1.7 0 012.5 12V4.5A1.5 1.5 0 014 3h7.5a1.7 1.7 0 011.2.5l7.9 7.9a1.7 1.7 0 010 2.4z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></Icon>;

const usd = (n) => (n == null ? '—' : '$' + Number(n).toFixed(2));

const onSale = (p) => p.orig != null && p.orig > p.price;
const hasPromo = (p) => !!(p && p.promo);
const isDeal = (p) => onSale(p) || hasPromo(p);

const money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rid = () => Math.random().toString(36).slice(2, 8);
const nfmt = (n) => Number(n || 0).toLocaleString('en-US');

/* "updated just now / 5m ago / 2h ago / 3d ago" for the catalog index age. */
function relTime(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

/* Per-unit price for a quantity, walking the custom-logo volume ladder. */
function priceAtQty(p, qty) {
  if (p.breaks && p.breaks.length) {
    let price = p.breaks[0].p;
    for (const b of p.breaks) if (qty >= b.q) price = b.p;
    return price;
  }
  return p.logo || p.price || 0;
}
/* Has the price been hand-edited away from the tier the qty implies? */
const isTierPrice = (p, qty, price) => Math.abs(priceAtQty(p, qty) - price) < 0.005;

/* ── Accurate proposal-line pricing ───────────────────────────────────────────
   The card headlines the custom-logo "from" price, but the PROPOSAL/cart must
   reflect what's actually configured:
     • no imprint            → retail (product.price)
     • custom-logo imprint   → the custom-logo volume ladder at the qty
     • a chosen base variant → its price (tee count, etc.)
     • + the second-pole upcharge when a dual-pole imprint is added
   These (Logo +$6 / Text +$4 per dozen) are golfballs.com's standard second-pole
   fees — the charge that was missing and skewing cart totals. */
const SECOND_POLE_FEE = { logo: 6, text: 4 };
const lineHasImprint = (line) => { const d = line && line.decoration; return !!(d && d.engine && d.engine !== 'none'); };
const lineSecondPoleFee = (line) => {
  const d = line && line.decoration;
  if (!d || !d.pole2 || !d.pole2.kind) return 0;   // keyed on a real 2nd-pole imprint
  return SECOND_POLE_FEE[d.pole2.kind] || 0;
};
function linePriceAt(line, qty) {
  const p = (line && line.product) || {};
  let base;
  if (line && line.variant && line.variant.price != null) base = line.variant.price;          // tee count etc.
  else if (lineHasImprint(line) && p.customLogo) base = priceAtQty(p, qty);                    // custom-logo ladder
  else base = p.price || 0;                                                                     // no imprint → retail
  return Math.round((base + lineSecondPoleFee(line)) * 100) / 100;
}
const lineIsTierPrice = (line, qty, price) => Math.abs(linePriceAt(line, qty) - price) < 0.005;
// Largest break ≤ q from a [{q,p}] ladder (the verified engine's output shape).
const priceAtBreaks = (breaks, q) => { let p = null; for (const b of (breaks || [])) if (b.q <= q) p = b.p; return p; };

/* The per-imprint model (capabilities + chip/merge/validation) lives in
   ../lib/giftImprints.js so it's unit-testable; imported at the top of this file. */

/* When a dual-pole line's FRONT imprint is deleted, the 2nd pole is promoted to
   be the sole (front) imprint. Rebuild a front decoration from the pole2
   descriptor (text → ballText, monogram → monogram, logo → ball/overlay logo). */
function promotePole2ToFront(product, deco) {
  const p2 = deco && deco.pole2;
  if (!p2) return null;
  const baseColor = '#FFFFFF', finish = { MFS: '279', SecondMFS: '279' };
  if (p2.kind === 'text') {
    return { engine: 'ballText', baseColor, finish, dualPole: false,
      pole1: { lines: p2.lines || [null, null, null], font: p2.font || 'Kabel Dm BT', color: p2.color || '#000000' } };
  }
  if (p2.kind === 'monogram') {
    return { engine: 'monogram', baseColor, finish, dualPole: false,
      monogram: { baseColor, text: p2.text || '', view: p2.view, color: p2.color || '#000000', color2: p2.color2 || '#FFFFFF', overlay: String(p2.view || 'circle').replace(/\d+$/, '') } };
  }
  if (p2.kind === 'logo') {
    return { engine: ballish(product) ? 'ballLogo' : 'logoOverlay', baseColor, finish, dualPole: false,
      logo: p2.logo || null, _localImageDataUrl: p2._localImageDataUrl || null };
  }
  return null;
}

/* Highest custom-logo per-unit price (the smallest-qty tier) — shown
   on the card by default ("from" pricing), before volume discounts. */
const topPrice = (p) => (p.breaks && p.breaks.length ? Math.max(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));
const lowPrice = (p) => (p.breaks && p.breaks.length ? Math.min(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));
// On-sale markdown (MSRP − sale price). The custom-logo break ladder is stored
// PRE-markdown; this discount comes off ON TOP (it can be a second, stacked sale).
// So the real per-unit price = break − saleCut, and the raw break is the "was"
// (strike-through). e.g. a $51.99 1+ break with a −$10 markdown actually costs
// $41.99.
const saleCut = (p) => (onSale(p) ? Math.max(0, p.orig - p.price) : 0);
const netP    = (p, raw) => Math.max(0, raw - saleCut(p));   // a raw break/unit price after the markdown
const netTop  = (p) => netP(p, topPrice(p));                  // actual per-unit (1+) price
const netLow  = (p) => netP(p, lowPrice(p));                  // actual top-volume price

/* "/" quick-filters beyond category + brand. */
const SPECIAL_CMDS = [
  { type: 'special', id: 'sale', label: 'On sale / promo', match: (p) => isDeal(p) },
  // Commissionable = custom-logo products (the ones that carry the commission
  // badge). Replaces the old Custom Logo rail group as the way to scope to them.
  { type: 'special', id: 'commission', label: 'Commissionable only', match: (p) => !!p.customLogo },
];

/* Base card dimensions; on-screen size is this × the "Gifting Catalog:
   zoom scale" dev setting (default 1.8×, in Settings → Developer Settings). */
const CARD_W = 1180;
const CARD_H = 760;

/* One representative glyph per "Shop by Type" category (sidebar + the
   "/" command palette), replacing the generic colored dots. */
const CAT_ICON = {
  'Logo Golf Balls': (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><circle cx="9.5" cy="10" r="0.7" fill="currentColor" stroke="none"/><circle cx="13.2" cy="9.4" r="0.7" fill="currentColor" stroke="none"/><circle cx="11" cy="13" r="0.7" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.6" r="0.7" fill="currentColor" stroke="none"/></Icon>,
  'Golf Shirts': (p) => <Icon {...p}><path d="M9 4L4.5 6.5 6.5 10 9 8.7V20h6V8.7l2.5 1.3 2-3.5L15 4l-3 2.2z"/></Icon>,
  'Golf Towels': (p) => <Icon {...p}><rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M5 8.5h14M5 15.5h14"/></Icon>,
  'Golf Hats': (p) => <Icon {...p}><path d="M3.5 14.5a8.5 8.5 0 0117 0"/><path d="M3.5 14.5h18.5l-3 3.2H3.5z"/></Icon>,
  'Divot Tools': (p) => <Icon {...p}><path d="M9 3.5v5M15 3.5v5M9 8.5c0 2.4 1.3 3.6 3 3.6s3-1.2 3-3.6M12 12.1V20.5"/></Icon>,
  'Logo Tees': (p) => <Icon {...p}><path d="M7 5h10l-2.3 4H9.3z"/><path d="M12 9v11"/></Icon>,
  'Logo Travel Bags': (p) => <Icon {...p}><rect x="3" y="9" width="18" height="10" rx="3"/><path d="M8 9V7a2 2 0 012-2h4a2 2 0 012 2v2M3 13.5h18"/></Icon>,
  'Promotional Products': (p) => <Icon {...p}><rect x="4" y="9.5" width="16" height="10.5" rx="1"/><path d="M4 13.5h16M12 9.5V20"/><path d="M12 9.5S10.6 5.8 8.6 6.4 8 9.5 10 9.5M12 9.5s1.4-3.7 3.4-3.1S16 9.5 14 9.5"/></Icon>,
  'Golf Umbrellas': (p) => <Icon {...p}><path d="M3 12a9 9 0 0118 0z"/><path d="M12 12v6.5a2 2 0 003.2 0"/></Icon>,
  'Golf Gloves': (p) => <Icon {...p}><path d="M8 11V5.6a1.5 1.5 0 013 0V10M11 9.6V4.6a1.5 1.5 0 013 0V10M14 10.6V6.6a1.5 1.5 0 013 0V13a5 5 0 01-10 0v-1l-1.5-1.5a1.4 1.4 0 012-2L8 11"/></Icon>,
  'Custom Packaging': (p) => <Icon {...p}><path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4 7.2l8 4.2 8-4.2M12 11.4V21"/></Icon>,
  'Drinkware': (p) => <Icon {...p}><path d="M7 4h10l-1.2 16.2a1 1 0 01-1 .8H9.2a1 1 0 01-1-.8z"/><path d="M7.3 9h9.4"/></Icon>,
  'Golf Bags': (p) => <Icon {...p}><rect x="7" y="6" width="9" height="15" rx="3"/><path d="M10 6V3.8M13 6V3.4M16 9.5c2 0 3 1 3 3V16"/></Icon>,
  'Ball Markers': (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></Icon>,
  'Outerwear': (p) => <Icon {...p}><path d="M6 4l6 3 6-3 2 4.5-3 1.8V21H7V10.3L4 8.5z"/><path d="M12 7v14"/></Icon>,
};
const AllItemsIcon = (p) => <Icon {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></Icon>;
const ClubsIcon = (p) => <Icon {...p}><path d="M16 3.5l3 3-8.5 8.5"/><path d="M10.5 15a3.4 3.4 0 11-3.5 3.4c0-1 .5-1.8 1.2-2.4L16 6.5"/></Icon>;
const FootwearIcon = (p) => <Icon {...p}><path d="M3 9.5l4-1 2.5 2.5 3.5.5c4 .6 7 1.8 8 3.5v2.5H3z"/><path d="M3 14h18"/></Icon>;
/* Per-department glyphs for the full-catalog rail — reuse the custom-logo
   icons where the shape matches, add club/shoe for the new departments. */
const DEPT_ICON = {
  'Golf Balls': CAT_ICON['Logo Golf Balls'],
  'Clubs': ClubsIcon,
  'Apparel': CAT_ICON['Golf Shirts'],
  'Footwear': FootwearIcon,
  'Golf Bags': CAT_ICON['Golf Bags'],
  'Accessories': (p) => <Icon {...p}><path d="M20.6 13.4L13 21a1.7 1.7 0 01-2.4 0L3 13.4A1.7 1.7 0 012.5 12V4.5A1.5 1.5 0 014 3h7.5a1.7 1.7 0 011.2.5l7.9 7.9a1.7 1.7 0 010 2.4z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></Icon>,
  'Drinkware': CAT_ICON['Drinkware'],
  'Promotional Products': CAT_ICON['Promotional Products'],
  'Gift Sets': CAT_ICON['Custom Packaging'],
  'Other': AllItemsIcon,
};
const CustomLogoIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><path d="M8.4 12.2l2.4 2.4 4.8-4.8"/></Icon>;
function CatGlyph({ id, size = 15, color = 'currentColor' }) {
  const Ico = (id === 'all' ? AllItemsIcon : id === 'cl' ? CustomLogoIcon : (CAT_ICON[id] || DEPT_ICON[id])) || AllItemsIcon;
  return <Ico size={size} style={{ color, flexShrink: 0 }} />;
}

/* Commissionable marker — a "$" coin pinned to the bottom-right of the
   product photo. Driven by the SAME customLogo flag that files a product
   under the Custom Logo section (modificationName "Custom Logo" / Corporate
   itemType), so a custom-logo twin (e.g. B5367) wears the $ and its plain-
   stock twin (B5368) doesn't — telling them apart in the "All" view. The
   parent image wrapper must be position: relative. */
function CommissionDollar({ size = 16 }) {
  return (
    <span title="Commissionable — custom-logo SKU" style={{
      position: 'absolute', bottom: 6, right: 6, zIndex: 2,
      width: size, height: size, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
      border: '1px solid var(--gb-success-fg, #2e9e5b)',
      color: 'var(--gb-success-fg, #2e9e5b)',
      fontSize: Math.round(size * 0.64), fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
      lineHeight: 1, userSelect: 'none',
    }}>$</span>
  );
}

/* The search box doubles as a command bar: typing "/" switches into
   filter mode (like Quick Notes) — type a category or brand, pick it,
   and the matching filter is applied while the search field clears so
   you can immediately type a specific term. */
function SearchBox({ value, onChange, commands, onPick, filtersActive, onClearAll }) {
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);

  // Focus on mount so the rep can type the moment the catalog opens.
  useEffect(() => {
    const t = setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch { /* detached */ } }, 60);
    return () => clearTimeout(t);
  }, []);

  const isCmd = value.startsWith('/');
  const term = isCmd ? value.replace(/^\/+/, '').trim().toLowerCase() : '';
  const matches = useMemo(() => {
    if (!isCmd) return [];
    const list = term ? commands.filter((c) => c.label.toLowerCase().includes(term)) : commands;
    return list.slice(0, 8);
  }, [isCmd, term, commands]);
  useEffect(() => { setHi(0); }, [term, isCmd]);

  const onKey = (e) => {
    if (!isCmd) return;
    if (e.key === 'Escape') { e.preventDefault(); onChange(''); return; }
    // Enter with nothing to pick still clears, so a stray "/typo" never lingers.
    if (!matches.length) { if (e.key === 'Enter') { e.preventDefault(); onChange(''); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); onPick(matches[hi]); }
  };

  const open = isCmd && focused && matches.length > 0;
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{
        height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-fill-inverse-medium)',
        border: '1px solid ' + (isCmd || focused ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
        boxShadow: focused ? 'var(--gb-focus-ring)' : 'none', transition: 'all var(--gb-anim)',
      }}>
        {isCmd
          ? <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0, lineHeight: 1 }}>/</span>
          : <I.search size={14} style={{ color: focused ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', flexShrink: 0 }} />}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={isCmd ? 'Filter — type, brand, sale…' : 'Search products, or / to filter…'}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5, fontWeight: 500 }}
        />
        {(value || filtersActive) && (
          <span onClick={() => (onClearAll ? onClearAll() : onChange(''))} title="Clear all filters" style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}>
            <I.close size={13} />
          </span>
        )}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 40, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)', padding: 5, animation: 'cm-slide .15s ease', maxHeight: 300, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '4px 8px 6px' }}>Jump to filter</div>
          {matches.map((c, i) => (
            <div key={c.type + ':' + c.id} onMouseDown={(e) => { e.preventDefault(); onPick(c); }} onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', background: i === hi ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
              {c.type === 'cat'
                ? <CatGlyph id={c.glyph || c.id} size={14} color={i === hi ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)'} />
                : c.type === 'special'
                ? <TagI size={13} style={{ color: i === hi ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', flexShrink: 0 }} />
                : <span style={{ width: 11, textAlign: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>@</span>}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: i === hi ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{c.label}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-ghost)' }}>{c.type === 'cat' ? 'Type' : c.type === 'special' ? 'Filter' : 'Brand'}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', minWidth: 22, textAlign: 'right' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SORTS = { popular: 'Most reviewed', priceLow: 'Price: low → high', priceHigh: 'Price: high → low', name: 'Name A–Z' };
function SortSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => setOpen((o) => !o)} style={{
        height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px',
        borderRadius: 'var(--gb-r-md)', cursor: 'pointer', whiteSpace: 'nowrap',
        background: 'var(--gb-fill-subtle)',
        border: '1px solid ' + (open ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
        color: 'var(--gb-text-secondary)', fontSize: 12, fontWeight: 600, transition: 'all var(--gb-anim)',
      }}>
        <Layers size={13} style={{ color: 'var(--gb-text-muted)' }} />
        {SORTS[value]}
        <I.chevd size={12} style={{ color: 'var(--gb-text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 30, minWidth: 180,
          background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)', padding: 5, animation: 'cm-slide .15s ease',
        }}>
          {Object.entries(SORTS).map(([k, label]) => {
            const on = k === value;
            return (
              <div key={k} onClick={() => { onChange(k); setOpen(false); }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
                <span style={{ flex: 1 }}>{label}</span>
                {on && <I.check size={13} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductImage({ src, alt, pad = 16, radius = 'var(--gb-r-md)', h }) {
  const [loaded, setLoaded] = useState(false);
  // Image-box height. The product grid passes a FIXED pixel height (`h`):
  // under the modals CSS `zoom` (scales.js applies real `zoom` to the mount
  // root), a percentage/aspect-derived height mis-rounds, so cards render
  // taller than their grid track and the next row overlaps. A fixed px height
  // scales predictably under `zoom`, keeping every card — and every row — the
  // same height. (No `h` → square via padding-ratio, for the detail panel's
  // single image where there's no grid to creep.)
  const box = h ? { height: h } : { height: 0, paddingBottom: '100%' };
  return (
    <div style={{ position: 'relative', width: '100%', ...box, background: '#f4f4f1', borderRadius: radius, overflow: 'hidden', border: '1px solid var(--gb-border-subtle)' }}>
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #d8d8d2', borderTopColor: '#a8a89e', animation: 'gb-spin .8s linear infinite' }} />
        </div>
      )}
      <img src={src} alt={alt} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: pad, boxSizing: 'border-box', opacity: loaded ? 1 : 0, transition: 'opacity .3s ease' }} />
    </div>
  );
}

function Rating({ value, count, size = 11 }) {
  if (!value) return <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)' }}>No reviews</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <StarI size={size} style={{ color: 'var(--gb-warning)' }} />
      <span style={{ fontSize: size + 0.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{value.toFixed(1)}</span>
      <span style={{ fontSize: size - 1, color: 'var(--gb-text-muted)', fontWeight: 500 }}>({count})</span>
    </span>
  );
}

/* Quick-add control on each card's bottom-right — drop an item into the
   proposal without opening the detail panel. Always a "+" (no locked check
   state) so repeated clicks keep adding; a subtle brand tint just signals the
   item is already in the proposal. Stops propagation so it never opens the
   card. */
function AddButton({ inProposal, compact, onAdd }) {
  const [h, setH] = useState(false);
  const sz = compact ? 17 : 19;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onAdd && onAdd(); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      title={inProposal ? 'Add another to proposal' : 'Add to proposal'}
      style={{
        flexShrink: 0, width: sz, height: sz, borderRadius: '50%', padding: 0, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        border: '1px solid ' + (h || inProposal ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
        background: h ? 'var(--gb-brand-tint-strong)' : inProposal ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)',
        color: 'var(--gb-brand-label)',
        boxShadow: h ? '0 1px 5px rgba(0,0,0,.12)' : 'none',
        transform: h ? 'scale(1.12)' : 'none',
        transition: 'all var(--gb-anim)',
      }}>
      <I.plus size={compact ? 11 : 12} />
    </button>
  );
}

function ProductCard({ p, compact, showRating, active, inProposal, onAdd, onClick }) {
  const [hover, setHover] = useState(false);
  const ring = active ? '0 0 0 1px var(--gb-brand-label), 0 2px 8px rgba(0,0,0,.09)' : hover ? '0 2px 7px rgba(0,0,0,.07)' : '';
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', cursor: 'pointer', background: 'var(--gb-surface-1)', height: '100%',
        border: '1px solid ' + (active ? 'var(--gb-brand-label)' : hover ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-lg)', padding: compact ? 9 : 11,
        // Clip any sub-pixel content overflow inside the card so it can't bleed
        // into the row below under fractional zoom (browser/OS scale).
        overflow: 'hidden',
        boxShadow: ring || 'none',
        transform: hover && !active ? 'translateY(-1px)' : 'none',
        transition: 'transform var(--gb-anim), border-color var(--gb-anim), box-shadow var(--gb-anim)',
      }}>
      <div style={{ position: 'relative' }}>
        <ProductImage src={p.img} alt={p.title} pad={compact ? 12 : 16} h={compact ? 132 : 156} />
        {hasPromo(p) && (
          <span style={{ position: 'absolute', top: 7, left: 7, display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: .3, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-success-solid, #2e9e5b)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>{p.promo.label}</span>
        )}
        {onSale(p) && (
          <span style={{ position: 'absolute', top: 7, right: 7, display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-danger, #e5484d)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>Sale</span>
        )}
        {p.customLogo && <CommissionDollar size={compact ? 14 : 16} />}
      </div>
      <div style={{ paddingTop: compact ? 8 : 10, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 5, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brand}</span>
          {showRating && p.rating && <Rating value={p.rating} count={p.reviews} size={10} />}
        </div>
        <div style={{ fontSize: compact ? 12 : 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.32, letterSpacing: -.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: compact ? undefined : '2.6em' }}>{p.title}</div>
        {p.sku && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', flexShrink: 0 }}>SKU</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              {/* Custom-logo items headline the "from" (first-ladder) imprint price;
                  everything else headlines retail. The PROPOSAL re-prices each line
                  accurately (retail when no imprint, ladder + 2nd-pole when added). */}
              <span style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.5, fontFamily: 'var(--gb-font-mono)' }}>{usd(p.customLogo ? netTop(p) : p.price)}</span>
              {onSale(p) && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: 'var(--gb-font-mono)' }}>{usd(p.customLogo ? topPrice(p) : p.orig)}</span>}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>each</span>
          </div>
          <AddButton inProposal={inProposal} compact={compact} onAdd={() => onAdd && onAdd(p)} />
        </div>
      </div>
    </div>
  );
}

function PriceStat({ label, value, accent, was }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: accent ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)') }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.5 }}>{value}</span>
        {was && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: 'var(--gb-font-mono)' }}>{was}</span>}
      </div>
    </div>
  );
}

function DetailPanel({ p, inProposal, onAdd, onOpenProposal, onClose }) {
  // The live decoration the buyer is building (emitted by CustomizeBlock); it
  // rides along when the product is added so the saved cart carries the real
  // imprint. Reset when the panel switches to a different product.
  const [decoration, setDecoration] = useState(null);
  // Selected base-product variant (e.g. Tee Count) → drives the displayed price
  // for products whose options change the price. Reset when the product changes.
  const [variant, setVariant] = useState(null);
  useEffect(() => { setDecoration(null); setVariant(null); }, [p.id]);
  // Headline: a chosen variant (Tee Count, …) wins; otherwise custom-logo items
  // show their "from" (first-ladder) imprint price and everything else retail.
  // The proposal re-prices accurately on add (retail / ladder + 2nd-pole).
  const unitPrice = (variant && variant.price != null) ? variant.price : (p.customLogo ? netTop(p) : p.price);
  const openProduct = () => {
    if (!p.url) return;
    // p.url is a complete URL now, but an older cached catalog may still hold a
    // relative path — normalize either form to one absolute golfballs.com URL.
    let u = p.url;
    if (!/^https?:\/\//i.test(u)) u = 'https://www.golfballs.com' + (u.startsWith('/') ? u : '/' + u) + (/\.html?$/i.test(u) ? '' : '.htm');
    try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ }
  };
  return (
    <>
      <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}
        style={{ position: 'absolute', inset: 0, background: 'var(--gb-backdrop)', zIndex: 20 }} />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 460, damping: 40 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(380px, 82%)', zIndex: 21, background: 'var(--gb-surface-modal)', borderLeft: '1px solid var(--gb-border-default)', boxShadow: '-10px 0 28px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <IconBtn size="sm" variant="ghost" icon={<ArrowL />} onClick={onClose} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Product detail</span>
          <div style={{ flex: 1 }} />
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
          <div style={{ position: 'relative' }}>
            <ProductImage src={p.img} alt={p.title} pad={26} radius="var(--gb-r-lg)" />
            {p.customLogo && <CommissionDollar size={20} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</span>
            <Tag tone="neutral" size="sm" icon={<CatGlyph id={p.dept || p.cat} size={12} />}>{p.dept || p.cat}</Tag>
            {onSale(p) && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 'var(--gb-r-pill)', fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-danger, #e5484d)' }}>Sale −{usd(p.orig - p.price)}</span>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.25, letterSpacing: -.2 }}>{p.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <Rating value={p.rating} count={p.reviews} size={12} />
            {p.sku && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-ghost)' }}>SKU</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{p.sku}</span>
              </span>
            )}
          </div>
          {/* Base options that change the price (Tee Count, pack size, …) —
              self-hides when the product has no price-varying options. */}
          <ProductOptions p={p} onChange={setVariant} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <PriceStat label="Per unit" value={usd(unitPrice)} accent was={onSale(p) ? usd(p.orig) : null} />
          </div>
          {hasPromo(p) && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint, rgba(46,158,91,.12))', border: '1px solid var(--gb-success-border, rgba(46,158,91,.3))' }}>
              <TagI size={14} style={{ color: 'var(--gb-success-fg, #2e9e5b)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500 }}>
                <b style={{ color: 'var(--gb-success-fg, #2e9e5b)' }}>{p.promo.label}</b> · code <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{p.promo.code}</span>
              </span>
            </div>
          )}
          {p.breaks && p.breaks.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Gift size={12} style={{ color: 'var(--gb-brand-label)' }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-secondary)' }}>Custom-logo quantity pricing</span>
              </div>
              <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
                {p.breaks.map((b, i) => {
                  const best = i === p.breaks.length - 1;
                  const save = p.breaks[0].p - b.p;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: best ? 'var(--gb-brand-tint-soft)' : i % 2 ? 'var(--gb-fill-faint)' : 'transparent', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)', minWidth: 64 }}>{b.q}+ qty</span>
                      <div style={{ flex: 1 }} />
                      {save > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-success-fg)' }}>−{usd(save)}</span>}
                      <span style={{ fontSize: 13, fontWeight: 800, color: best ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', minWidth: 58, textAlign: 'right' }}>{usd(netP(p, b.p))}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.4 }}>Per-unit price drops with order volume — quote the tier that matches the gift run.</div>
            </div>
          )}
          {/* Show the customization UI for ANY customizable product (custom
              logo, personalized, monogram, photo, ball-marker, …), not just
              custom-logo — e.g. a "Personalized Ball Marker" hat clip. */}
          {(p.customizable || p.customLogo) && <CustomizeBlock p={p} onChange={setDecoration} />}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', gap: 8, flexShrink: 0, background: 'var(--gb-fill-inverse-strong)' }}>
          <Btn variant="secondary" size="md" icon={<I.eye />} style={{ flex: 1 }} onClick={openProduct}>View product</Btn>
          {/* Always allow adding — a product can sit on multiple proposal
              lines (different customizations/quantities). */}
          <Btn variant="primary" size="md" icon={<I.plus />} style={{ flex: 1.2 }} onClick={() => onAdd && onAdd(p, decoration, variant)}>{inProposal ? 'Add another' : 'Add to proposal'}</Btn>
        </div>
      </motion.div>
    </>
  );
}

/* One selectable rail row. `glyph` is the CatGlyph id (category/dept/'all'/
   'cl'); `indent` nudges child rows under a group header; `chevron` (when
   provided) renders a collapse caret that fires onToggle without selecting. */
function CatRow({ glyph, label, count, active, onClick, indent = false, chevron, onToggle }) {
  const [hover, setHover] = useState(false);
  const col = active ? 'var(--gb-brand-label)' : hover ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)';
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', paddingLeft: indent ? 26 : 11, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', flexShrink: 0, transition: 'all var(--gb-anim)', background: active ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'transparent') }}>
      {chevron != null && (
        <span onClick={(e) => { e.stopPropagation(); onToggle && onToggle(); }} title={chevron ? 'Collapse' : 'Expand'}
          style={{ display: 'flex', flexShrink: 0, color: col, marginLeft: -4 }}>
          <I.chevr size={12} style={{ transform: chevron ? 'rotate(90deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
        </span>
      )}
      <CatGlyph id={glyph} size={indent ? 14 : 15} color={col} />
      <span style={{ flex: 1, fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{count}</span>
    </div>
  );
}

/* Placeholder row for an upcoming saved view (disabled until built). */
function SavedStub({ label, icon }) {
  return (
    <div title="Coming soon" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'default', opacity: .55 }}>
      <span style={{ color: 'var(--gb-text-tertiary)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 11.5, fontWeight: 500, color: 'var(--gb-text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)', padding: '1px 5px' }}>Soon</span>
    </div>
  );
}

/* A clickable saved-view nav row (active-aware, with a count badge). */
function SavedNavRow({ label, icon, count, active, onClick }) {
  const [hover, setHover] = useState(false);
  const col = active ? 'var(--gb-brand-label)' : hover ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)';
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', flexShrink: 0, transition: 'all var(--gb-anim)', background: active ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'transparent') }}>
      <span style={{ color: col, display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{count}</span>
    </div>
  );
}

function CategoryRail({ sel, onSelect, depts, deptCounts, total, dock, view, onSetView, savedCount }) {
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 10px 8px', flexShrink: 0 }}>Browse</div>
      {/* Capped, scrollable list with a soft fade at the top/bottom edges. */}
      <div className="gb-gc-norail" style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 0', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)' }}>
        <CatRow glyph="all" label="All Items" count={total} active={view === 'catalog' && sel === 'all'} onClick={() => onSelect('all')} />

        {/* ── Departments — custom-logo items are folded into their depts; use
            the /Commissionable filter to scope to commissionable products. ── */}
        {depts.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '10px 11px 4px', flexShrink: 0 }}>Departments</div>
            {depts.map((d) => (
              <CatRow key={'dept:' + d} glyph={d} label={d} count={deptCounts[d] || 0}
                active={view === 'catalog' && sel === 'dept:' + d} onClick={() => onSelect('dept:' + d)} />
            ))}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, marginTop: 4 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '8px 10px 6px' }}>Saved</div>
        <SavedNavRow label="Saved Proposals" icon={<I.bookmark size={14} />} count={savedCount}
          active={view === 'proposals'} onClick={() => onSetView('proposals')} />
        <SavedStub label="Previous orders" icon={<I.refresh size={14} />} />
      </div>
      {/* AnimatePresence so the dock plays its exit when the proposal opens
          (it carries marginTop/flexShrink itself now). */}
      <AnimatePresence>{dock}</AnimatePresence>
    </div>
  );
}

function BrandChip({ label, count, on, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 'var(--gb-r-pill)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all var(--gb-anim)', fontSize: 11.5, fontWeight: 600, background: on ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)') }}>
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', opacity: .85 }}>{count}</span>
    </div>
  );
}

/* ── Proposal: qty stepper, editable price, split lines, dock + panel ── */

function QtyStepper({ value, onChange }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const commit = (v) => { let n = parseInt(v, 10); if (isNaN(n) || n < 1) n = 1; onChange(n); setTxt(String(n)); };
  const Step = ({ d, children }) => {
    const [h, setH] = useState(false);
    return (
      <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => commit(value + d)}
        style={{ width: 26, height: 28, border: 'none', background: h ? 'var(--gb-fill-subtle)' : 'transparent', color: h ? 'var(--gb-text-primary)' : 'var(--gb-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>{children}</button>
    );
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', height: 28, flexShrink: 0, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden' }}>
      <Step d={-1}><span style={{ width: 9, height: 1.6, borderRadius: 1, background: 'currentColor' }} /></Step>
      <input value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => commit(txt)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ width: 40, textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700, borderLeft: '1px solid var(--gb-border-subtle)', borderRight: '1px solid var(--gb-border-subtle)', height: '100%' }} />
      <Step d={1}><I.plus size={11} /></Step>
    </div>
  );
}

function PriceField({ value, onChange }) {
  const [txt, setTxt] = useState(value.toFixed(2));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(value.toFixed(2)); }, [value, focus]);
  const commit = () => { let n = parseFloat(txt); if (isNaN(n) || n < 0) n = 0; onChange(Math.round(n * 100) / 100); };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1, height: 28, padding: '0 8px', flexShrink: 0, background: 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (focus ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), boxShadow: focus ? 'var(--gb-focus-ring)' : 'none', borderRadius: 'var(--gb-r-sm)', transition: 'all var(--gb-anim)' }}>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>$</span>
      <input value={txt} inputMode="decimal" onFocus={() => setFocus(true)} onChange={(e) => setTxt(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => { setFocus(false); commit(); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ width: 52, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700 }} />
    </div>
  );
}

function MiniThumb({ src, size = 42 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, background: '#f4f4f1', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden' }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, boxSizing: 'border-box' }} />
    </div>
  );
}

/* One split row: qty × price = subtotal. Changing qty follows the
   volume ladder unless the price was hand-edited; a "tier ↺" link
   re-snaps it to the auto price. */
function SplitRow({ line, split, canRemove, onChange, onRemove }) {
  // Price follows the LINE (imprint/variant/2nd-pole aware), not just the bare
  // product's custom-logo ladder — so a no-imprint line stays at retail and a
  // dual-pole line keeps its second-pole upcharge as the qty changes.
  const onQty = (q) => {
    const followTier = lineIsTierPrice(line, split.qty, split.price);
    onChange({ qty: q, price: followTier ? linePriceAt(line, q) : split.price });
  };
  const tier = linePriceAt(line, split.qty);
  const custom = !lineIsTierPrice(line, split.qty, split.price);
  return (
    <motion.div layout
      initial={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
      animate={{ opacity: 1, height: 'auto', paddingTop: 7, paddingBottom: 7 }}
      exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: .2, ease: [0.32, 0.72, 0, 1] }}
      style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
      <QtyStepper value={split.qty} onChange={onQty} />
      <span style={{ fontSize: 11, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>×</span>
      <PriceField value={split.price} onChange={(pr) => onChange({ price: pr })} />
      {custom && (
        <span onClick={() => onChange({ price: tier })} title={`Reset to ${usd(tier)}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 600, color: 'var(--gb-brand-label)', cursor: 'pointer', fontFamily: 'var(--gb-font-mono)', flexShrink: 0, whiteSpace: 'nowrap' }}>↺ {usd(tier)}</span>
      )}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)', minWidth: 58, textAlign: 'right', flexShrink: 0 }}>{money(split.qty * split.price)}</span>
      <span onClick={canRemove ? onRemove : undefined} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: canRemove ? 'var(--gb-text-muted)' : 'var(--gb-text-ghost)', cursor: canRemove ? 'pointer' : 'default', opacity: canRemove ? 1 : .35 }}><I.close size={11} /></span>
    </motion.div>
  );
}

function ProposalLine({ line, onPatchSplit, onAddSplit, onRemoveSplit, onRemove, drag, onTagDragStart, onTagDragEnd, onDropDeco, onRemoveFront, onRemoveSecond }) {
  const p = line.product;
  const lineTot = line.splits.reduce((s, x) => s + x.qty * x.price, 0);
  const lineUnits = line.splits.reduce((s, x) => s + x.qty, 0);
  const chips = decoImprints(line.decoration);   // one draggable tag per imprint (front + 2nd pole)
  // Each custom base-option (Tee Count, Set Makeup, Shaft …) becomes its own pill
  // so a long option set wraps onto new rows instead of overflowing the line.
  const variantPills = (line.variant && line.variant.values)
    ? Object.entries(line.variant.values).filter(([k]) => k !== 'Color').map(([k, v]) => `${k}: ${v}`)
    : [];
  // Drag-to-copy: a single imprint from another line is in flight — can it land here?
  const [over, setOver] = useState(false);
  const dragActive = !!(drag && drag.fromLineId !== line.id);
  const dropOk = dragActive && canApplyImprint(p, drag.imprint, line.decoration).ok;
  const tagDrag = (chip) => ({
    draggable: true,
    onDragStart: (e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', 'gb-imprint'); } catch { /* */ } onTagDragStart(line, chip); },
    onDragEnd: () => onTagDragEnd(),
  });
  // Trailing × on a pill — deletes the imprint. preventDefault on dragstart so a
  // press on the × never starts a drag of the pill it sits inside.
  const TagX = ({ onClick, title }) => (
    <span role="button" title={title} draggable={false}
      onDragStart={(e) => e.preventDefault()} onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, marginLeft: 2, marginRight: -2, borderRadius: '50%', cursor: 'pointer', opacity: 0.6 }}>
      <I.close size={9} />
    </span>
  );
  return (
    <motion.div layout
      initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: .92, transition: { duration: .15 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      onDragOver={(e) => { if (dropOk) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={(e) => { if (dropOk) { e.preventDefault(); onDropDeco(line.id); } setOver(false); }}
      style={{ position: 'relative', background: over && dropOk ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
        border: '1px solid ' + (over && dropOk ? 'var(--gb-brand-label)' : dropOk ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-lg)', padding: 12,
        boxShadow: over && dropOk ? 'var(--gb-focus-ring)' : 'none',
        opacity: dragActive && !dropOk ? 0.5 : 1,
        transition: 'opacity var(--gb-anim), border-color var(--gb-anim), box-shadow var(--gb-anim), background var(--gb-anim)' }}>
      {dropOk && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--gb-r-lg)', pointerEvents: 'none', display: over ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-brand-tint-soft)', zIndex: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-brand-label)', color: 'var(--gb-surface-deep)', fontSize: 10.5, fontWeight: 800 }}>
            <I.copy size={11} /> Copy imprint here
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <MiniThumb src={p.img} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', flexShrink: 0 }}>{money(lineTot)}</span>
          </div>
        </div>
        <span onClick={onRemove} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--gb-text-muted)', cursor: 'pointer', borderRadius: 'var(--gb-r-sm)' }}><I.trash size={13} /></span>
      </div>
      {/* Per-imprint tags (front + 2nd pole, each draggable) + per-option pills,
          all wrapping independently so nothing overflows the line width. */}
      {(chips.length > 0 || variantPills.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
          {chips.map((chip) => {
            const second = chip.slot === 'second';
            return (
              <span key={chip.slot} {...tagDrag(chip)} title="Drag onto another item to copy this imprint"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px 2px 7px', borderRadius: 'var(--gb-r-pill)',
                  background: second ? 'var(--gb-success-tint, rgba(46,158,91,.14))' : 'var(--gb-brand-tint-soft)',
                  border: '1px solid ' + (second ? 'var(--gb-success-border, rgba(46,158,91,.32))' : 'var(--gb-brand-tint-border)'),
                  color: second ? 'var(--gb-success-fg, #2e9e5b)' : 'var(--gb-brand-label)',
                  fontSize: 9.5, fontWeight: second ? 800 : 700, maxWidth: 220, overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'grab' }}>
                {chip.image
                  ? <img src={chip.image} alt="" draggable={false} style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover', background: '#f4f4f1', flexShrink: 0 }} />
                  : (chip.kind === 'monogram' ? <Layers size={9} /> : <I.edit size={9} />)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
                <TagX onClick={() => (second ? onRemoveSecond() : onRemoveFront())}
                  title={second ? 'Remove second imprint' : (chips.length > 1 ? 'Remove front imprint (the second pole becomes the only imprint)' : 'Remove imprint')} />
              </span>
            );
          })}
          {variantPills.map((label, i) => (
            <span key={'v' + i} style={{ padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-tertiary)', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, borderTop: '1px solid var(--gb-border-subtle)' }}>
        <AnimatePresence initial={false}>
          {line.splits.map((s) => (
            <SplitRow key={s.id} line={line} split={s} canRemove={line.splits.length > 1} onChange={(patch) => onPatchSplit(s.id, patch)} onRemove={() => onRemoveSplit(s.id)} />
          ))}
        </AnimatePresence>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
        <button onClick={onAddSplit} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-soft)', color: 'var(--gb-brand-label)', border: '1px dashed var(--gb-brand-tint-border)', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <I.plus size={10} /> Split tier
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{lineUnits} units</span>
      </div>
    </motion.div>
  );
}

/* Compact dock pinned to the bottom of the left rail — spans the
   sidebar width (220px rail − 12px gutters = 196). */
function ProposalDock({ count, total, active, onOpen }) {
  const [h, setH] = useState(false);
  return (
    <motion.div onClick={onOpen} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      style={{
        width: '100%', boxSizing: 'border-box', cursor: 'pointer', marginTop: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 13, padding: '7px 9px',
        background: (h || active) ? 'var(--gb-brand-tint-strong)' : 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)', transition: 'background var(--gb-anim)',
      }}>
      <span style={{ position: 'relative', display: 'flex', color: 'var(--gb-brand-label)' }}>
        <I.card size={15} />
        <span style={{ position: 'absolute', top: -6, right: -7, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7, background: 'var(--gb-brand-label)', color: 'var(--gb-surface-deep)', fontSize: 8.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--gb-font-mono)' }}>{count}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-brand-label)', opacity: .8 }}>Proposal</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.3 }}>{money(total)}</div>
      </div>
      <I.chevr size={12} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />
    </motion.div>
  );
}

/* ── Saved proposals gallery ───────────────────────────────────────────────
   Renders the drafts persisted in chrome.storage. Each card resolves its
   stored product snapshots into units/subtotal so it stands on its own even if
   the live catalog has since changed. */
function fmtSavedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveSavedEntry(entry) {
  const entries = (entry.lines || []).filter((l) => l && l.product).map((l) => ({
    product: l.product, decoration: l.decoration, splits: l.splits || [],
  }));
  const units = entries.reduce((s, e) => s + e.splits.reduce((a, x) => a + (x.qty || 0), 0), 0);
  const total = entries.reduce((s, e) => s + e.splits.reduce((a, x) => a + (x.qty || 0) * (x.price || 0), 0), 0);
  return { entries, units, total };
}

function ThumbStack({ entries, max = 4, size = 44 }) {
  const shown = entries.slice(0, max);
  const extra = entries.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((e, i) => (
        <div key={i} style={{ marginLeft: i ? -13 : 0, zIndex: shown.length - i, width: size, height: size, flexShrink: 0, background: '#f4f4f1', borderRadius: 'var(--gb-r-md)', overflow: 'hidden', border: '1px solid var(--gb-border-default)', boxShadow: '0 0 0 2px var(--gb-surface-modal), 0 1px 5px rgba(0,0,0,.18)' }}>
          {e.product.img && <img src={e.product.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5, boxSizing: 'border-box' }} />}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ marginLeft: -13, zIndex: 0, width: size, height: size, flexShrink: 0, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-strong)', border: '1px solid var(--gb-border-default)', boxShadow: '0 0 0 2px var(--gb-surface-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)' }}>+{extra}</div>
      )}
    </div>
  );
}

/* Square icon action used on a saved card (copy / delete) — its own hover. */
function CardIconBtn({ icon, title, danger, active, onClick }) {
  const [h, setH] = useState(false);
  const col = active ? 'var(--gb-success-fg, #2e9e5b)' : (danger && h) ? 'var(--gb-danger, #e5484d)' : h ? 'var(--gb-text-primary)' : 'var(--gb-text-tertiary)';
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', background: h ? 'var(--gb-fill-strong)' : 'var(--gb-fill-subtle)', border: '1px solid ' + ((danger && h) ? 'var(--gb-danger-tint-border, rgba(229,72,77,.4))' : h ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'), color: col, transition: 'background var(--gb-anim), border-color var(--gb-anim), color var(--gb-anim)', fontFamily: 'inherit' }}>
      {icon}
    </button>
  );
}

function SavedCard({ item, loaded, onLoad, onCopy, onDelete }) {
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const r = useMemo(() => resolveSavedEntry(item), [item]);
  const lines = r.entries.map((e) => ({ qty: e.splits.reduce((a, x) => a + (x.qty || 0), 0), title: (e.product.title || e.product.brand || 'Item') }));
  const shownLines = lines.slice(0, 3);
  // Copying isn't instant — it uploads each line's artwork before building the
  // cart command — so the button spins until that round-trip finishes.
  const doCopy = (e) => {
    e.stopPropagation();
    if (copying) return;
    setCopying(true);
    Promise.resolve(onCopy(item))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => {})
      .finally(() => setCopying(false));
  };
  const copyIcon = copying
    ? <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'gb-spin .7s linear infinite' }} />
    : copied ? <I.check size={14} strokeWidth={3} /> : <I.copy size={14} />;
  return (
    <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .92 }} transition={{ duration: .2, ease: [0.32, 0.72, 0, 1] }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 11, padding: 13, background: 'var(--gb-surface-1)', border: '1px solid ' + (loaded ? 'var(--gb-brand-label)' : hover ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-lg)', boxShadow: hover ? '0 2px 7px rgba(0,0,0,.07)' : 'none', transform: hover && !loaded ? 'translateY(-1px)' : 'none', transition: 'transform var(--gb-anim), border-color var(--gb-anim), box-shadow var(--gb-anim)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <ThumbStack entries={r.entries} />
        <div style={{ flex: 1 }} />
        <Tag tone="neutral" size="sm" icon={<I.bookmark size={9} />}>Draft</Tag>
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        {/* A short, readable run-down of what's inside (qty × product). Each
            row truncates with an ellipsis, never a fade, so it stays legible. */}
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {shownLines.map((l, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{l.qty}×</span> {l.title}
            </div>
          ))}
          {lines.length > shownLines.length && (
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 600 }}>+{lines.length - shownLines.length} more</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 10, borderTop: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{fmtSavedDate(item.date)}</span>
        <Dot tone="muted" size={3} />
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{r.units} units</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)', letterSpacing: -.4 }}>{money(r.total)}</span>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={(e) => { e.stopPropagation(); onLoad(item); }} title="Load these items into the proposal"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', background: hover ? 'var(--gb-brand-tint-medium)' : 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', transition: 'background var(--gb-anim)' }}>
          <I.plus size={13} /> Load into proposal
        </button>
        <CardIconBtn title={copying ? 'Preparing command…' : 'Copy as a console command'} active={copied} onClick={doCopy} icon={copyIcon} />
        <CardIconBtn title="Delete draft" danger onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} icon={<I.trash size={14} />} />
      </div>
    </motion.div>
  );
}

function SavedGallery({ items, loadedId, onLoad, onCopy, onDelete }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I.bookmark size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Saved Proposals</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, fontWeight: 500 }}>{items.length} saved · click to load one back into a proposal{items.length ? ', or copy it as a cart command' : ''}</div>
        </div>
      </div>
      <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {items.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I.bookmark size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No saved proposals yet</div>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>Build a proposal and hit “Save draft” to keep it here for later.</div>
          </div>
        ) : (
          // Masonry via CSS columns — cards keep their natural height and pack
          // up the shortest column instead of stretching to a row baseline.
          <div style={{ columnWidth: 296, columnGap: 12 }}>
            <AnimatePresence mode="popLayout">
              {items.map((it) => <SavedCard key={it.id} item={it} loaded={loadedId === it.id} onLoad={onLoad} onCopy={onCopy} onDelete={onDelete} />)}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, onClose, onPatchSplit, onAddSplit, onRemoveSplit, onRemoveLine, onClear, onSaveDraft, onMergeImprint, onRemoveFront, onRemoveSecond }) {
  const total = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const units = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty, 0), 0);
  // Drag-to-copy imprints between lines. `drag` holds the in-flight source so
  // every line can light up (or stay dim) based on whether it can take it.
  const [drag, setDrag] = useState(null);              // { fromLineId, slot, imprint }
  const startDrag = (line, chip) => setDrag({ fromLineId: line.id, slot: chip.slot, imprint: chip });
  const endDrag = () => setDrag(null);
  const dropDeco = (toLineId) => { if (drag) onMergeImprint(drag.fromLineId, toLineId, drag.imprint); setDrag(null); };
  const canCopy = proposal.length >= 2 && proposal.some((l) => decoImprints(l.decoration).length > 0);
  // Save-draft flow: an inline name box → confirm → success flash.
  const [saveMode, setSaveMode] = useState(false);
  const [name, setName] = useState('');
  const [nameFocus, setNameFocus] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const savedTimer = useRef(null);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  useEffect(() => { if (proposal.length === 0) { setSaveMode(false); setSaved(false); } }, [proposal.length]);
  useEffect(() => { if (!saveMode) return; const id = setTimeout(() => nameRef.current && nameRef.current.focus(), 60); return () => clearTimeout(id); }, [saveMode]);
  const confirmSave = () => {
    if (saving) return;
    setSaving(true);
    Promise.resolve(onSaveDraft && onSaveDraft(name.trim() || 'Untitled draft')).then(() => {
      setSaving(false); setSaveMode(false); setName(''); setSaved(true);
      clearTimeout(savedTimer.current); savedTimer.current = setTimeout(() => setSaved(false), 2400);
    }).catch(() => setSaving(false));
  };
  return (
    /* In-flow side card (not an overlay) — sits BESIDE the catalog so the
       proposal and item details are visible at once. The slide/resize is
       driven by the parent column's flex-basis + opacity transition. */
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)',
      display: 'flex', flexDirection: 'column',
    }}>
        <div style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0, background: 'var(--gb-fill-inverse-strong)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I.card size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Proposal</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{proposal.length} {proposal.length === 1 ? 'product' : 'products'} · {units} units</div>
          </div>
          {proposal.length > 0 && <Btn variant="ghost" size="sm" onClick={onClear}>Clear</Btn>}
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposal.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--gb-text-muted)', textAlign: 'center', padding: 24 }}>
              <div style={{ width: 46, height: 46, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.card size={20} /></div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No products yet</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 220 }}>Open a product and hit <b style={{ color: 'var(--gb-brand-label)' }}>Add to proposal</b> — then set quantities, prices, and split tiers here.</div>
            </div>
          ) : (
            <>
              {canCopy && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px dashed var(--gb-border-default)', color: 'var(--gb-text-tertiary)', fontSize: 10, fontWeight: 600 }}>
                  <I.copy size={11} style={{ flexShrink: 0, color: 'var(--gb-text-muted)' }} />
                  Drag an imprint tag onto another item to copy it.
                </div>
              )}
              <AnimatePresence initial={false} mode="popLayout">
                {proposal.map((line) => (
                  <ProposalLine key={line.id} line={line}
                    drag={drag} onTagDragStart={startDrag} onTagDragEnd={endDrag} onDropDeco={dropDeco}
                    onRemoveFront={() => onRemoveFront(line.id)} onRemoveSecond={() => onRemoveSecond(line.id)}
                    onPatchSplit={(sid, patch) => onPatchSplit(line.id, sid, patch)}
                    onAddSplit={() => onAddSplit(line.id)}
                    onRemoveSplit={(sid) => onRemoveSplit(line.id, sid)}
                    onRemove={() => onRemoveLine(line.id)} />
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
        {proposal.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-inverse-strong)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Estimated total</span>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)' }}>{units} units</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.6 }}>{money(total)}</span>
            </div>
            {/* Name box — collapses in between the total and the buttons. */}
            <div style={{ overflow: 'hidden', maxHeight: saveMode ? 110 : 0, opacity: saveMode ? 1 : 0, transition: 'max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease' }}>
              <div style={{ padding: '2px 12px 4px' }}>
                <div style={{ borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Draft name</label>
                  <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
                    onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') { setSaveMode(false); setName(''); } }}
                    placeholder="e.g. Q3 Client Gift Run"
                    style={{ width: '100%', height: 32, padding: '0 10px', boxSizing: 'border-box', background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (nameFocus ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5, fontWeight: 500, transition: 'border-color var(--gb-anim)' }} />
                </div>
              </div>
            </div>
            {/* Action row — morphs between idle / name-entry / saved flash. */}
            {saved ? (
              <div style={{ padding: '4px 12px 12px' }}>
                <div style={{ height: 38, borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--gb-success-tint-medium, rgba(46,158,91,.16))', border: '1px solid var(--gb-success-tint-border, rgba(46,158,91,.35))', color: 'var(--gb-success-fg, #2e9e5b)', fontSize: 12.5, fontWeight: 700, animation: 'pp-rise .2s cubic-bezier(.34,1.5,.64,1)' }}>
                  <I.check size={15} strokeWidth={3} /> Saved to Saved Proposals
                </div>
              </div>
            ) : saveMode ? (
              <div style={{ padding: '4px 12px 12px', display: 'flex', gap: 8 }}>
                <Btn variant="ghost" size="md" style={{ flex: 1 }} onClick={() => { setSaveMode(false); setName(''); }}>Cancel</Btn>
                <Btn variant="primary" size="md" icon={<I.check />} style={{ flex: 1.4 }} state={saving ? 'loading' : 'idle'} onClick={confirmSave}>Confirm save</Btn>
              </div>
            ) : (
              <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
                <Btn variant="secondary" size="md" icon={<I.bookmark />} style={{ flex: 1 }} onClick={() => { setSaved(false); setName(''); setSaveMode(true); }}>Save draft</Btn>
                <Btn variant="primary" size="md" icon={<I.send />} style={{ flex: 1.4 }}>Send proposal</Btn>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

/* Read the catalog zoom from Developer Settings before first paint, so
   the modal opens at the right size instead of snapping from the 1.8
   default to a custom value. Cached module-side so reopening is instant. */
let _catalogScale = null;
function useCatalogScale() {
  const [scale, setScale] = useState(_catalogScale);
  useEffect(() => {
    let alive = true;
    const apply = (v) => { const n = Number(v) || 1.8; _catalogScale = n; if (alive) setScale(n); };
    loadDevSettings().then((d) => apply(d['giftCatalog.scale']));
    const onCh = (changes) => { if (changes && changes[DEV_STORAGE_KEY]) apply((changes[DEV_STORAGE_KEY].newValue || {})['giftCatalog.scale']); };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* no storage */ }
    return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);
  return scale;
}

export function GiftCatalog({ onClose, density = 'comfortable', showRating = true, priceFocus = 'retail' }) {
  ensureCatalogKeyframes();
  const scale = useCatalogScale(); // loaded before first paint to avoid a resize snap
  const toast = useToast();
  const [catalog, setCatalog] = useState(GIFT_CATALOG_SEED);
  const [loading, setLoading] = useState(true);        // first paint pending (no data yet)
  const [refreshing, setRefreshing] = useState(false); // a live pull is in flight
  const [progress, setProgress] = useState(null);      // { loaded, total } during a pull, else null
  const [updatedTs, setUpdatedTs] = useState(0);       // when the shown catalog was last indexed
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const [query, setQuery] = useState('');
  const [selBrands, setSelBrands] = useState(() => new Set()); // empty = all brands
  const toggleBrand = (b) => setSelBrands((s) => { const n = new Set(s); n.has(b) ? n.delete(b) : n.add(b); return n; });
  // Sidebar selection: 'all' | 'cl' (all custom-logo) | 'cl:<category>' | 'dept:<department>'.
  const [sel, setSel] = useState('all');
  const [sort, setSort] = useState('popular');
  // Seed sort/density from dev settings (giftCatalog.defaultSort / .density);
  // re-applies only when the setting itself changes, so a user's in-session
  // sort choice isn't clobbered.
  const dsSort = useDevSetting('giftCatalog.defaultSort');
  useEffect(() => { if (dsSort) setSort(dsSort); }, [dsSort]);
  const dsDensity = useDevSetting('giftCatalog.density');
  const [selected, setSelected] = useState(null);
  const [special, setSpecial] = useState(null); // 'sale' | 'logo' | null
  const [proposal, setProposal] = useState([]);
  const [proposalOpen, setProposalOpen] = useState(false);
  // ── Verified DISPLAY pricing ───────────────────────────────────────────────
  // The catalog only carries the custom-logo ladder, so a monogram / embroidery /
  // tee line can't be priced from it. Pull each DECORATED line's raw product page
  // (background-cached) and reprice its splits with the SAME engine the cart uses
  // (decoratedPricingForLine), so the proposal shows exactly what the site will
  // charge — no "price changed" surprise. Retail lines keep their estimate. The
  // signature excludes prices, so applying prices doesn't re-trigger the fetch.
  const rawCacheRef = useRef(new Map());
  const pricedSigRef = useRef('');
  useEffect(() => {
    const decorated = proposal.filter((l) => l.decoration && l.decoration.engine && l.decoration.engine !== 'none' && l.product && l.product.url);
    const sig = JSON.stringify(decorated.map((l) => [l.product.url, l.decoration, l.variant && l.variant.values, l.splits.map((s) => s.qty)]));
    if (!decorated.length || sig === pricedSigRef.current) return undefined;
    let alive = true;
    (async () => {
      for (const l of decorated) {
        const url = l.product.url;
        if (!rawCacheRef.current.has(url)) rawCacheRef.current.set(url, await fetchRawProduct(url));
      }
      if (!alive) return;
      let changed = false;
      const next = proposal.map((l) => {
        if (!l.decoration || !l.decoration.engine || l.decoration.engine === 'none') return l;
        const raw = rawCacheRef.current.get(l.product && l.product.url);
        if (!raw) return l;
        let pr; try { pr = decoratedPricingForLine(raw, l.decoration, { values: l.variant && l.variant.values }); } catch { pr = null; }
        if (!pr || !pr.breaks || !pr.breaks.length) return l;
        let lineChanged = false;
        const splits = l.splits.map((s) => {
          const unit = priceAtBreaks(pr.breaks, s.qty);
          if (unit != null && Math.abs(unit - s.price) > 0.005) { lineChanged = true; return { ...s, price: unit }; }
          return s;
        });
        if (lineChanged) changed = true;
        return lineChanged ? { ...l, splits } : l;
      });
      pricedSigRef.current = sig;
      if (alive && changed) setProposal(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal]);
  // Saved Proposals library (chrome.storage). `view` swaps the catalog grid
  // for the gallery; `loadedId` flags the last draft copied into the proposal.
  const [view, setView] = useState('catalog');        // 'catalog' | 'proposals'
  const [savedProposals, setSavedProposals] = useState([]);
  const [loadedId, setLoadedId] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSavedProposals().then((l) => { if (alive) setSavedProposals(l); });
    const onCh = (changes) => { if (changes && changes.gbSavedProposals) setSavedProposals(changes.gbSavedProposals.newValue || []); };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* */ }
    return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);
  // Animated open/close: doClose plays the exit, AnimatePresence's
  // onExitComplete then runs the real onClose (unmount) — matches the
  // slide-over panels so the whole modal fades/scales out, not snaps.
  const [open, setOpen] = useState(true);
  const doClose = () => setOpen(false);

  const compact = (dsDensity || density) === 'compact';

  // `productId` (not the line id) drives the "added" hint on cards, since a
  // product can now appear on multiple lines (e.g. different customizations).
  const inProposal = (id) => proposal.some((l) => l.productId === id);
  const propTotal = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const addToProposal = (p, decoration = null, variant = null) => setProposal((prev) => {
    // Always add a NEW line (unique id) — the same product can be added more
    // than once so the rep can quote different customizations/quantities. The
    // decoration descriptor (from the detail panel's CustomizeBlock) and the
    // selected base variant (e.g. Tee Count → its price) ride along so Save
    // draft serializes the real imprint + price; the card quick-add omits both.
    const qty = p.minQty || 1;
    // Accurate per-unit price: retail when no imprint, custom-logo ladder when
    // imprinted, a chosen variant's price, + the second-pole upcharge if dual.
    const startPrice = linePriceAt({ product: p, decoration, variant }, qty);
    return [...prev, { id: rid(), productId: p.id, product: p, decoration: decoration || null, variant: variant || null, splits: [{ id: rid(), qty, price: startPrice }] }];
  });
  const patchSplit = (lineId, splitId, patch) => setProposal((prev) => prev.map((l) => l.id === lineId ? { ...l, splits: l.splits.map((s) => s.id === splitId ? { ...s, ...patch } : s) } : l));
  const addSplit = (lineId) => setProposal((prev) => prev.map((l) => { if (l.id !== lineId) return l; const last = l.splits[l.splits.length - 1]; return { ...l, splits: [...l.splits, { id: rid(), qty: last.qty, price: last.price }] }; }));
  const removeSplit = (lineId, splitId) => setProposal((prev) => prev.flatMap((l) => { if (l.id !== lineId) return [l]; const splits = l.splits.filter((s) => s.id !== splitId); return splits.length ? [{ ...l, splits }] : []; }));
  const removeLine = (lineId) => setProposal((prev) => prev.filter((l) => l.id !== lineId));

  // Drag-to-copy: stamp one line's imprint onto another. mode 'front' copies the
  // front imprint; 'full' copies both poles. Validated against what the target
  // supports, then the engine is re-targeted (ball ↔ accessory) and prices are
  // recomputed for the new imprint (custom-logo ladder + any 2nd-pole upcharge).
  // Drag-drop: merge ONE imprint from a source line onto a target line. The
  // imprint is validated against the target, then merged (front, or a free 2nd
  // pole — logo wins the front slot), and the line is re-priced for the new state.
  const mergeImprintOnLine = (fromLineId, toLineId, imprint) => {
    if (!fromLineId || fromLineId === toLineId || !imprint) return;
    const tgt = proposal.find((l) => l.id === toLineId);
    if (!tgt) return;
    const check = canApplyImprint(tgt.product, imprint, tgt.decoration);
    if (!check.ok) { toast?.error?.(check.reason); return; }
    const next = mergeImprint(tgt.decoration, tgt.product, imprint);
    setProposal((prev) => prev.map((l) => l.id === toLineId
      ? { ...l, decoration: next, splits: l.splits.map((s) => ({ ...s, price: linePriceAt({ product: l.product, decoration: next, variant: l.variant }, s.qty) })) }
      : l));
  };

  // Re-price a line after its decoration changed (imprint removed / promoted).
  const repriceLine = (l, decoration) => ({ ...l, decoration, splits: l.splits.map((s) => ({ ...s, price: linePriceAt({ product: l.product, decoration, variant: l.variant }, s.qty) })) });
  // Delete the FRONT imprint. If the line is dual-pole, the 2nd pole is promoted
  // to be the sole imprint; otherwise the line goes back to no imprint (retail).
  const removeFrontImprint = (lineId) => setProposal((prev) => prev.map((l) => {
    if (l.id !== lineId) return l;
    const next = (l.decoration && l.decoration.pole2) ? promotePole2ToFront(l.product, l.decoration) : null;
    return repriceLine(l, next);
  }));
  // Delete just the SECOND pole, keeping the front imprint (and dropping the fee).
  const removeSecondPole = (lineId) => setProposal((prev) => prev.map((l) => {
    if (l.id !== lineId || !l.decoration) return l;
    return repriceLine(l, { ...l.decoration, pole2: null, dualPole: false });
  }));

  // Save draft — snapshot the current proposal into the Saved Proposals
  // library (chrome.storage) under a name. Returns the promise so the panel's
  // confirm button can drive its success flash.
  const saveDraft = (name) => {
    if (!proposal.length) return Promise.resolve();
    return saveProposalDraft(name, proposal)
      .then((r) => { setSavedProposals(r.list); toast?.success?.(`Saved “${r.entry.name}” to Saved Proposals`); })
      .catch((e) => { toast?.error?.('Couldn’t save — ' + ((e && e.message) || 'unknown error')); throw e; });
  };

  // Load a saved draft's lines into the live proposal (merging by product so
  // re-loading the same draft doesn't duplicate lines). Stay on the gallery and
  // just open the proposal panel beside it, so the load is visible in place
  // rather than dumping the user back into the All Items grid.
  const loadSaved = (entry) => {
    const incoming = linesFromSaved(entry, rid);
    setProposal((prev) => {
      const have = new Set(prev.map((l) => l.productId));
      return [...prev, ...incoming.filter((l) => !have.has(l.productId))];
    });
    setLoadedId(entry.id);
    setProposalOpen(true);
  };

  // Copy a saved draft as a paste-and-run console command (loads it into the
  // golfballs.com cart). This is the "copy as a command" action on each card.
  const copySaved = (entry) => buildProposalDraft(linesFromSaved(entry, rid))
    .then((r) => copyToClipboard(r.command).then(() => {
      const skip = r.skipped && r.skipped.length ? ` · ${r.skipped.length} skipped` : '';
      toast?.success?.(`“${entry.name}” copied — paste in the golfballs.com console to load ${r.itemCount} item${r.itemCount > 1 ? 's' : ''}${skip}`);
    }))
    .catch((e) => { toast?.error?.('Couldn’t build the command — ' + ((e && e.message) || 'unknown error')); throw e; });

  const deleteSaved = (id) => removeSavedProposal(id).then((next) => setSavedProposals(next));

  /* One shared live pull, with progress. `force` clears the cache first
     (manual rebuild — stale items/sales can't survive as a fallback);
     `silent` keeps the grid painted and suppresses the error toast (a
     background top-up over good cache — failures stay quiet, per the
     errors-only notification rule). */
  const runPull = (opts = {}) => {
    const { force = false, silent = false } = opts;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setProgress({ loaded: 0, total: 0 });
    const pre = force ? clearCatalogCache() : Promise.resolve();
    pre.then(() => loadCatalog({ force: true, onProgress: (p) => { if (aliveRef.current) setProgress(p); } }))
      .then((c) => { if (aliveRef.current && c && c.length) { setCatalog(c); setUpdatedTs(Date.now()); } })
      .catch((e) => { if (aliveRef.current && !silent) toast?.error?.('Catalog rebuild failed — ' + (e?.message || 'couldn’t reach the pricing service') + '. Showing previous data.'); })
      .finally(() => { if (aliveRef.current) { setRefreshing(false); setProgress(null); setLoading(false); } });
  };

  // Paint the cache instantly (even if stale), then top up in the background
  // when it's stale or empty — opening the modal never blocks on the network.
  useEffect(() => {
    let live = true;
    (async () => {
      let haveCache = false;
      try {
        const { products, ts, stale } = await readCatalogCache();
        if (!live) return;
        if (products && products.length) { setCatalog(products); setUpdatedTs(ts); setLoading(false); haveCache = true; if (!stale) return; }
      } catch { /* no cache → fall through to a live pull */ }
      if (live) runPull({ silent: haveCache });
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line

  // Manual rebuild button — always a fresh, cache-clearing crawl.
  const refresh = () => { if (refreshing) return; runPull({ force: true }); };

  // Custom-logo subset: total, per-"Shop by Type" category counts, and the
  // ordered list of categories present (canonical order, extras trail).
  // Commissionable (custom-logo) count — kept only for the header stat; these
  // items now live in their departments, scoped via the /Commissionable filter.
  const clTotal = useMemo(() => catalog.filter((p) => p.customLogo).length, [catalog]);

  // Full-catalog departments: per-dept counts + ordered list present.
  const deptCounts = useMemo(() => { const m = {}; catalog.forEach((p) => { m[p.dept] = (m[p.dept] || 0) + 1; }); return m; }, [catalog]);
  const depts = useMemo(() => {
    const present = new Set(catalog.map((p) => p.dept).filter(Boolean));
    const ordered = DEPT_ORDER.filter((d) => present.has(d));
    const extra = [...present].filter((d) => !DEPT_ORDER.includes(d)).sort();
    return [...ordered, ...extra];
  }, [catalog]);

  // Readable label for the current selection (footer + "in <x>" text).
  const selLabel = sel === 'all' ? '' : sel.startsWith('dept:') ? sel.slice(5) : sel;

  // Products in the current sidebar selection.
  const inCat = useMemo(() => {
    if (sel === 'all') return catalog;
    if (sel.startsWith('dept:')) { const d = sel.slice(5); return catalog.filter((p) => p.dept === d); }
    return catalog;
  }, [sel, catalog]);
  const brands = useMemo(() => {
    const m = {}; inCat.forEach((p) => { m[p.brand] = (m[p.brand] || 0) + 1; });
    // "Shop by Brand" order; brands outside the canonical list trail by count.
    const rank = (b) => { const i = BRAND_ORDER.indexOf(b); return i === -1 ? BRAND_ORDER.length : i; };
    return Object.entries(m).sort((a, b) => (rank(a[0]) - rank(b[0])) || (b[1] - a[1]));
  }, [inCat]);

  // Drop selected brands not present in the current category.
  useEffect(() => {
    setSelBrands((s) => {
      const present = new Set(brands.map(([b]) => b));
      const next = new Set([...s].filter((b) => present.has(b)));
      return next.size === s.size ? s : next;
    });
  }, [brands]); // eslint-disable-line

  // "/" command bar — every category + brand becomes a jump-to filter.
  const brandCounts = useMemo(() => { const m = {}; catalog.forEach((p) => { m[p.brand] = (m[p.brand] || 0) + 1; }); return m; }, [catalog]);
  const commands = useMemo(() => {
    const specCmds = SPECIAL_CMDS.map((s) => ({ ...s, count: catalog.filter(s.match).length })).filter((s) => s.count > 0);
    // Category jumps carry the full selection key as `id`; `glyph` is the bare
    // name so the palette icon still resolves. Departments only now —
    // custom-logo items are folded into them.
    const deptCmds = depts.map((d) => ({ type: 'cat', id: 'dept:' + d, glyph: d, label: d, count: deptCounts[d] || 0 }));
    const rank = (b) => { const i = BRAND_ORDER.indexOf(b); return i === -1 ? BRAND_ORDER.length : i; };
    const brandCmds = Object.keys(brandCounts)
      .sort((a, b) => (rank(a) - rank(b)) || (brandCounts[b] - brandCounts[a]))
      .map((b) => ({ type: 'brand', id: b, label: b, count: brandCounts[b] }));
    return [...specCmds, ...deptCmds, ...brandCmds];
  }, [depts, deptCounts, brandCounts, catalog]);
  // Commands stack + combine: a brand toggles into the multi-select,
  // category replaces, special toggles — so "/titleist /callaway /sale"
  // narrows to both brands on sale.
  const onPickCommand = (c) => {
    if (!c) return;
    if (c.type === 'cat') setSel(c.id);
    else if (c.type === 'brand') toggleBrand(c.id);
    else if (c.type === 'special') setSpecial((cur) => (cur === c.id ? null : c.id));
    setQuery('');
  };
  const filtersActive = sel !== 'all' || selBrands.size > 0 || !!special || !!query;
  const clearAll = () => { setSel('all'); setSelBrands(new Set()); setSpecial(null); setQuery(''); };

  const results = useMemo(() => {
    let r = inCat;
    if (selBrands.size > 0) r = r.filter((p) => selBrands.has(p.brand));
    if (special) { const sc = SPECIAL_CMDS.find((s) => s.id === special); if (sc) r = r.filter(sc.match); }
    if (query.trim() && !query.startsWith('/')) {
      const q = query.toLowerCase();
      r = r.filter((p) =>
        p.title.toLowerCase().includes(q)
        || p.brand.toLowerCase().includes(q)
        || (p.sku && p.sku.toLowerCase().includes(q))
        || (p.dept && p.dept.toLowerCase().includes(q))
        || p.cat.toLowerCase().includes(q));
    }
    r = [...r];
    if (sort === 'popular') r.sort((a, b) => b.reviews - a.reviews);
    else if (sort === 'priceLow') r.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'priceHigh') r.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title));
    return r;
  }, [inCat, selBrands, query, sort, special]);

  /* Incremental rendering — the full catalog is ~3,100 items; mounting that
     many cards at once janks the open animation and lags scroll. Render an
     initial window and grow it as the user nears the bottom, so the grid
     reads as complete without ever holding the whole list in the DOM. */
  const GRID_INITIAL = 60;
  const GRID_CHUNK = 48;
  const gridScrollRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(GRID_INITIAL);
  // Reset the window (and scroll to top) whenever the result set changes —
  // a new filter/search/sort/catalog shouldn't inherit the old scroll depth.
  useEffect(() => {
    setVisibleCount(GRID_INITIAL);
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
  }, [results]);
  const onGridScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 800) {
      setVisibleCount((c) => (c < results.length ? Math.min(results.length, c + GRID_CHUNK) : c));
    }
  };
  // Small result sets fit the initial window → keep the per-card entrance
  // animation. Large sets render plain + windowed for performance.
  const animateCards = results.length <= GRID_INITIAL;
  const shown = animateCards ? results : results.slice(0, visibleCount);

  const colMin = compact ? 150 : 188;

  // Hold the first paint until the scale is known (avoids a size snap).
  if (scale == null) return null;

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
      <motion.div key="gc-overlay" onClick={(e) => { if (e.target === e.currentTarget) doClose(); }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}
        style={{ position: 'fixed', inset: 0, zIndex: 999990, padding: 24, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', overflow: 'auto' }}>
      {/* Scale via transform, NOT zoom: Chrome accumulates sub-pixel rounding
          on grid ROW positions under a fractional `zoom`, so the product rows
          creep into each other below 1x (columns recompute per row, so they
          stay fine). transform lays the grid out at natural size and only
          scales the paint; transform-origin center + margin auto keep it
          centered. */}
      <div style={{ margin: 'auto', flexShrink: 0, transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        {/* Flex row: catalog card + proposal side column. The row WIDENS when
            the proposal opens (CARD_W → CARD_W+416), so the centered catalog
            slides left and the proposal emerges beside it — both visible. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: CARD_H, width: proposalOpen ? CARD_W + 416 : CARD_W, transition: 'width .42s cubic-bezier(.4,0,.2,1)' }}>
        <motion.div
          initial={{ opacity: 0, scale: .96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          style={{ width: CARD_W, height: '100%', flex: '0 0 auto', zIndex: 2, position: 'relative', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gift size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Golfballs.com Catalog</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {refreshing && progress ? (
                <>Indexing {nfmt(progress.loaded)}{progress.total ? ' / ' + nfmt(progress.total) : ''} products…</>
              ) : (
                <>{nfmt(catalog.length)} products{clTotal ? <> · {nfmt(clTotal)} custom-logo</> : null}{updatedTs ? <> · updated {relTime(updatedTs)}</> : null}</>
              )}
              {refreshing && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite', display: 'inline-block', flexShrink: 0 }} />}
            </div>
          </div>
          <SearchBox value={query} onChange={setQuery} commands={commands} onPick={onPickCommand} filtersActive={filtersActive} onClearAll={clearAll} />
          <SortSelect value={sort} onChange={setSort} />
          <IconBtn size="md" title="Rebuild catalog index" icon={<I.refresh style={{ animation: refreshing ? 'gb-spin .8s linear infinite' : 'none' }} />} onClick={refresh} />
          <IconBtn size="md" icon={<I.close />} onClick={doClose} />
        </div>

        {/* Re-index progress bar — determinate when numFound is known, a thin
            indeterminate sweep otherwise. Sits flush under the header so the
            grid below stays visible (no blanking) during a refresh. */}
        <div style={{ height: 2, flexShrink: 0, position: 'relative', overflow: 'hidden', background: refreshing ? 'var(--gb-border-subtle)' : 'transparent' }}>
          {refreshing && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: progress && progress.total ? `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%` : '35%',
              background: 'var(--gb-brand-label)', borderRadius: 2,
              transition: 'width .35s ease',
              animation: progress && progress.total ? 'none' : 'gc-indef 1.1s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* Body — also the positioning context for the slide-over panels,
            so they span the sidebar's height (header + footer stay visible). */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 7px 7px -7px rgba(0,0,0,.16), inset 0 -7px 7px -7px rgba(0,0,0,.16)' }}>
          <CategoryRail sel={sel} onSelect={(s) => { setView('catalog'); setSel(s); }} total={catalog.length}
            depts={depts} deptCounts={deptCounts}
            view={view} onSetView={setView} savedCount={savedProposals.length}
            dock={proposal.length > 0 && !proposalOpen ? <ProposalDock key="dock" count={proposal.length} total={propTotal} active={proposalOpen} onOpen={() => setProposalOpen(true)} /> : null} />
          <AnimatePresence mode="wait" initial={false}>
          {view === 'proposals' ? (
            <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <SavedGallery items={savedProposals} loadedId={loadedId}
              onLoad={loadSaved} onCopy={copySaved} onDelete={deleteSaved} />
          </motion.div>
          ) : (
          <motion.div key="catalog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="gb-gc-norail" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--gb-border-subtle)', overflowX: 'auto', flexShrink: 0, WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)', maskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0, marginRight: 2 }}>Brand</span>
              <BrandChip label="All" count={inCat.length} on={selBrands.size === 0} onClick={() => setSelBrands(new Set())} />
              {brands.map(([b, n]) => <BrandChip key={b} label={b} count={n} on={selBrands.has(b)} onClick={() => toggleBrand(b)} />)}
            </div>
            <div ref={gridScrollRef} onScroll={onGridScroll} className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
              {results.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I.search size={20} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No products match</div>
                  <Btn variant="secondary" size="sm" onClick={clearAll}>Clear filters</Btn>
                </div>
              ) : (
                <>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: compact ? 10 : 12 }}>
                  {/* Small sets animate per-card; large sets render a windowed
                      slice (grown on scroll by onGridScroll) so the DOM never
                      holds all ~3,100 cards and the open animation stays smooth. */}
                  {animateCards ? (
                    <AnimatePresence>
                      {shown.map((p) => (
                        <motion.div key={p.id} initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }} transition={{ duration: .17, ease: [0.32, 0.72, 0, 1] }}>
                          <ProductCard p={p} compact={compact} showRating={showRating}
                            active={selected && selected.id === p.id} inProposal={inProposal(p.id)} onAdd={addToProposal} onClick={() => setSelected(p)} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  ) : (
                    shown.map((p) => (
                      <ProductCard key={p.id} p={p} compact={compact} showRating={showRating}
                        active={selected && selected.id === p.id} inProposal={inProposal(p.id)} onAdd={addToProposal} onClick={() => setSelected(p)} />
                    ))
                  )}
                </div>
                {/* Lazy-load affordance: a quiet "loading more" row while the
                    window hasn't reached the full result count yet. */}
                {!animateCards && visibleCount < results.length && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 0 6px', color: 'var(--gb-text-ghost)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: .3 }}>Loading more — {nfmt(visibleCount)} of {nfmt(results.length)}</span>
                  </div>
                )}
                </>
              )}
            </div>
          </motion.div>
          )}
          </AnimatePresence>

          {/* Item details stay an overlay INSIDE the catalog card, so they
              coexist with the proposal side card (both visible at once). */}
          <AnimatePresence>
            {selected && (
              <DetailPanel key="detail" p={selected} inProposal={inProposal(selected.id)} onAdd={addToProposal}
                onOpenProposal={() => { setSelected(null); setProposalOpen(true); }} onClose={() => setSelected(null)} />
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <Layers size={13} style={{ color: 'var(--gb-text-muted)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', fontWeight: 500 }}>
            Showing <b style={{ color: 'var(--gb-text-primary)' }}>{nfmt(results.length)}</b> of {nfmt(catalog.length)}
            {selLabel && <> in <b style={{ color: 'var(--gb-text-secondary)' }}>{selLabel}</b></>}
            {selBrands.size > 0 && <> · <b style={{ color: 'var(--gb-text-secondary)' }}>{[...selBrands].join(', ')}</b></>}
            {special && <> · <b style={{ color: 'var(--gb-success-fg, #2e9e5b)' }}>{(SPECIAL_CMDS.find((s) => s.id === special) || {}).label}</b></>}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dot tone="brand" size={5} /> Logo imprint available
          </span>
        </div>

        </motion.div>

        {/* Proposal side column — a PHYSICALLY SEPARATE card that lives beside
            the catalog. It emerges from BEHIND the catalog (which holds
            zIndex:2): the column's flex-basis grows 0 → 416 in lockstep with
            the row widening, and the absolute panel (anchored right:0) rides
            out from under the catalog's right edge. */}
        <div style={{ flex: proposalOpen ? '0 0 416px' : '0 0 0px', height: '100%', position: 'relative', overflow: 'visible', transition: 'flex-basis .42s cubic-bezier(.4,0,.2,1)' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 400, opacity: proposalOpen ? 1 : 0, pointerEvents: proposalOpen ? 'auto' : 'none', transition: 'opacity .24s ease' }}>
            <ProposalPanel proposal={proposal} onClose={() => setProposalOpen(false)}
              onPatchSplit={patchSplit} onAddSplit={addSplit} onRemoveSplit={removeSplit}
              onRemoveLine={removeLine} onSaveDraft={saveDraft} onMergeImprint={mergeImprintOnLine}
              onRemoveFront={removeFrontImprint} onRemoveSecond={removeSecondPole}
              onClear={() => { setProposal([]); setProposalOpen(false); }} />
          </div>
        </div>
        </div>{/* /flex row */}
      </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
