import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Btn, IconBtn, Tag, Dot, Input, Dropdown } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { loadCatalog, clearCatalogCache, readCatalogCache, GIFT_CATALOG_SEED, CATEGORY_ORDER, DEPT_ORDER, BRAND_ORDER } from '../lib/giftCatalog.js';
import { loadDevSettings, useDevSetting, STORAGE_KEY as DEV_STORAGE_KEY } from '../lib/devSettings.js';
import { CustomizeBlock, ProductOptions, colorNameOf } from './giftCustomize.jsx';
import { buildProposalDraft, copyToClipboard, loadSavedProposals, saveProposalDraft, removeSavedProposal, linesFromSaved, fetchRawProduct, saveProposalToOpportunity, fetchOpportunitiesForAccount, loadCurrentProposal, saveCurrentProposal } from '../lib/saveProposal.js';
import { loadCustomItems, saveCustomItem, removeCustomItem, removeCustomItems, customItemToProduct, uploadCustomItemImage, ingestImageUrl, needsIngest, costAtQty, repoOf, REPOS } from '../lib/customItems.js';
import { importHpgCatalog } from '../lib/hpgImport.js';
import { importSnugzCatalog } from '../lib/snugzImport.js';
import { getInventory, cachedCostForSku, primeCostCache, importCosts } from '../lib/inventory.js';
import { ProposalEmailModal, ProposalEmailComposer } from './ProposalEmail.jsx';
import { Checkbox } from '../ui/components/Checkbox.jsx';
import { ballish, decoImprints, canApplyImprint, mergeImprint } from '../lib/giftImprints.js';
import { decoratedPricingForLine, giftSetPreviewUrl } from '../lib/cartSerializer.js';
import { giftSetLadder, giftSetSizeLabel } from '../lib/giftSets.js';

/* The boxed gift-set preview for a line (sleeve render with the ball's print +
   sleeve overlay; static photo for 6-ball / wooden), or null when not a gift set. */
const lineGiftImg = (line) => {
  const gs = line && line.decoration && line.decoration.giftSet;
  if (!gs) return null;
  const p = line.product || {};
  return giftSetPreviewUrl(gs, { decoration: line.decoration, sleeveImage: p.giftSetSleeveImage, brand: p.brand }) || gs.thumbnail || null;
};
/* A gift-set line's display identity is the SET, not the bare ball — so the
   saved-card list, margin table, and email all read "6-Ball … Gift Set" instead
   of "a dozen balls". Null when the line isn't a gift set. */
const lineGiftTitle = (line) => {
  const gs = line && line.decoration && line.decoration.giftSet;
  return gs ? (gs.name || 'Gift set') : null;
};

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
  // Gift set: per-set price from the verified gift-set ladder (the catalog's
  // custom-logo ladder == the raw ladder, so this matches the cart exactly).
  const gs = line && line.decoration && line.decoration.giftSet;
  if (gs && p.customLogo && p.breaks && p.breaks.length) {
    const v = priceAtBreaks(giftSetLadder(p.breaks, gs), qty);
    if (v != null) return v;
  }
  let base;
  if (line && line.variant && line.variant.price != null) base = line.variant.price;          // tee count etc.
  else if (p.isCustom && p.breaks && p.breaks.length) base = priceAtQty(p, qty);               // custom item ladder
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brand}</span>
            {p.repoTag && (
              <span style={{ flexShrink: 0, padding: '0 4px', borderRadius: 3, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', fontSize: 7.5, fontWeight: 800, letterSpacing: .3, textTransform: 'uppercase', color: 'var(--gb-text-tertiary)' }}>{p.repoTag}</span>
            )}
          </span>
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

/* Lazy inventory table for a catalog SKU — loads on press from the Dynamics
   endpoint (cached per SKU; the Cost also feeds the margin calculator). */
function InventoryPanel({ sku }) {
  const [state, setState] = useState('idle');     // idle | loading | done | error
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = (force) => {
    setState('loading'); setErr('');
    getInventory(sku, { force })
      .then((d) => { setData(d); setState('done'); })
      .catch((e) => { setErr((e && e.message) || 'failed'); setState('error'); });
  };
  const numCell = (v) => <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-secondary)', borderTop: '1px solid var(--gb-border-subtle)' }}>{(v || 0).toLocaleString('en-US')}</td>;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Layers size={12} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-secondary)' }}>Inventory</span>
        <div style={{ flex: 1 }} />
        {state === 'done' && <button type="button" onClick={() => load(true)} title="Refresh" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}><I.refresh size={12} /></button>}
      </div>
      {state === 'idle' && <Btn variant="secondary" size="sm" icon={<Layers size={13} />} onClick={() => load(false)}>Check inventory</Btn>}
      {state === 'loading' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 11.5, padding: '6px 0' }}><span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} /> Loading inventory…</div>}
      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-danger-tint, rgba(229,72,77,.1))', border: '1px solid var(--gb-danger-tint-border, rgba(229,72,77,.28))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: 'var(--gb-text-secondary)', fontWeight: 500, lineHeight: 1.4 }}>
            <I.alert size={13} style={{ color: 'var(--gb-danger, #e5484d)', flexShrink: 0, marginTop: 1 }} />
            <span>{err}</span>
          </div>
          <Btn variant="secondary" size="sm" icon={<I.refresh size={13} />} onClick={() => load(true)} style={{ alignSelf: 'flex-start' }}>Retry</Btn>
        </div>
      )}
      {state === 'done' && data && (data.rows.length ? (
        <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gb-fill-inverse-strong)' }}>
                {['Item', 'Avail', 'OnHand', 'Alloc', 'OnOrdr', 'Cost'].map((h, i) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} title={r.description || ''}>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-primary)', borderTop: '1px solid var(--gb-border-subtle)', whiteSpace: 'nowrap' }}>{r.itemNumber}</td>
                  {numCell(r.available)}{numCell(r.onHand)}{numCell(r.alloc)}{numCell(r.onOrder)}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--gb-font-mono)', fontSize: 11, fontWeight: 700, color: r.cost ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)', borderTop: '1px solid var(--gb-border-subtle)' }}>{r.cost != null ? usd(r.cost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>No inventory rows for this SKU.</div>)}
    </div>
  );
}

function DetailPanel({ p, inProposal, onAdd, onOpenProposal, onClose, onEdit }) {
  // The live decoration the buyer is building (emitted by CustomizeBlock); it
  // rides along when the product is added so the saved cart carries the real
  // imprint. Reset when the panel switches to a different product.
  const [decoration, setDecoration] = useState(null);
  // Selected base-product variant (e.g. Tee Count) → drives the displayed price
  // for products whose options change the price. Reset when the product changes.
  const [variant, setVariant] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => {
    setDecoration(null);
    // Custom items default to their first Style option so an un-touched add still
    // carries a style; catalog products start with no variant.
    const opts = p.isCustom && Array.isArray(p.styleOptions) ? p.styleOptions : [];
    setVariant(opts.length ? { values: { style: opts[0] }, price: null } : null);
  }, [p.id]);
  // Headline: a chosen variant (Tee Count, …) wins; otherwise custom-logo items
  // show their "from" (first-ladder) imprint price and everything else retail.
  // The proposal re-prices accurately on add (retail / ladder + 2nd-pole).
  // A gift set re-prices the whole line per set (ball custom-logo ladder ×size +
  // kit), so the header + tier table preview the gift-set ladder, not the ball's.
  const giftSet = decoration && decoration.giftSet;
  const giftBreaks = (giftSet && p.customLogo && p.breaks && p.breaks.length) ? giftSetLadder(p.breaks, giftSet) : null;
  const giftImg = giftSet ? giftSetPreviewUrl(giftSet, { decoration, sleeveImage: p.giftSetSleeveImage, brand: p.brand }) : null;
  const priceLadder = giftBreaks || p.breaks;
  const isGiftPricing = !!giftBreaks;
  const unitPrice = giftBreaks
    ? priceAtBreaks(giftBreaks, (giftBreaks[0] && giftBreaks[0].q) || 1)
    : (variant && variant.price != null) ? variant.price : (p.customLogo ? netTop(p) : p.price);
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
            <ProductImage src={giftImg || p.img} alt={p.title} pad={26} radius="var(--gb-r-lg)" />
            {p.customLogo && <CommissionDollar size={20} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</span>
            {(p.dept || p.cat) && <Tag tone="neutral" size="sm" icon={<CatGlyph id={p.dept || p.cat} size={12} />}>{p.dept || p.cat}</Tag>}
            {p.isCustom && <Tag tone="brand" size="sm" icon={<I.sparkle size={10} />}>Custom item</Tag>}
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
          {/* Custom item description (rep-entered) — shown in the sidebar. */}
          {p.isCustom && p.custom && p.custom.description && (
            <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.55, color: 'var(--gb-text-tertiary)', whiteSpace: 'pre-wrap' }}>{p.custom.description}</div>
          )}
          {/* Custom items: a rep-defined Style selector (the chosen option rides
              into the cart's SERVICEITEM 'style'). Catalog items: base options
              that change price (Tee Count, …), which self-hide when none. */}
          {p.isCustom ? (
            (p.styleOptions && p.styleOptions.length > 1) ? (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Style</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.styleOptions.map((s) => {
                    const on = ((variant && variant.values && variant.values.style) || p.styleOptions[0]) === s;
                    return (
                      <button key={s} onClick={() => setVariant({ values: { style: s }, price: null })}
                        style={{
                          padding: '5px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                          background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)',
                          border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
                          color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', transition: 'all var(--gb-anim)',
                        }}>{s}</button>
                    );
                  })}
                </div>
              </div>
            ) : null
          ) : (p.customizable || p.customLogo) ? (
            // Customizable products show their base options (Color, etc.) inside
            // CustomizeBlock's BaseProperties below — don't render ProductOptions
            // too, or the Color picker appears twice.
            null
          ) : (
            <ProductOptions p={p} onChange={setVariant} />
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <PriceStat label={isGiftPricing ? 'Per set' : 'Per unit'} value={usd(unitPrice)} accent was={(!isGiftPricing && onSale(p)) ? usd(p.orig) : null} />
          </div>
          {hasPromo(p) && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint, rgba(46,158,91,.12))', border: '1px solid var(--gb-success-border, rgba(46,158,91,.3))' }}>
              <TagI size={14} style={{ color: 'var(--gb-success-fg, #2e9e5b)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500 }}>
                <b style={{ color: 'var(--gb-success-fg, #2e9e5b)' }}>{p.promo.label}</b> · code <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{p.promo.code}</span>
              </span>
            </div>
          )}
          {priceLadder && priceLadder.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {isGiftPricing ? <I.sparkle size={12} style={{ color: 'var(--gb-brand-label)' }} /> : <Gift size={12} style={{ color: 'var(--gb-brand-label)' }} />}
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-secondary)' }}>{isGiftPricing ? 'Gift-set quantity pricing' : p.isCustom ? 'Quantity pricing' : 'Custom-logo quantity pricing'}</span>
              </div>
              <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
                {priceLadder.map((b, i) => {
                  const best = i === priceLadder.length - 1;
                  const unit = isGiftPricing ? b.p : netP(p, b.p);
                  const save = (isGiftPricing ? priceLadder[0].p : netP(p, priceLadder[0].p)) - unit;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: best ? 'var(--gb-brand-tint-soft)' : i % 2 ? 'var(--gb-fill-faint)' : 'transparent', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)', minWidth: 64 }}>{b.q}+ {isGiftPricing ? 'sets' : 'qty'}</span>
                      <div style={{ flex: 1 }} />
                      {save > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-success-fg)' }}>−{usd(save)}</span>}
                      <span style={{ fontSize: 13, fontWeight: 800, color: best ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', minWidth: 58, textAlign: 'right' }}>{usd(unit)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.4 }}>{isGiftPricing ? 'Per-set price drops with order volume — quote the tier that matches the gift run.' : 'Per-unit price drops with order volume — quote the tier that matches the gift run.'}</div>
            </div>
          )}
          {/* View product — opens the saved supplier link (custom items only),
              with a copy-to-clipboard icon beside it. */}
          {p.isCustom && p.link && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', marginTop: 14 }}>
              <Btn variant="secondary" size="sm" icon={<I.eye />} style={{ flex: 1 }}
                onClick={() => { try { window.open(p.link, '_blank', 'noopener'); } catch { /* */ } }}>View product</Btn>
              <IconBtn size="sm" variant="secondary" active={linkCopied} icon={linkCopied ? <I.check size={14} /> : <I.copy size={14} />}
                title="Copy product URL" onClick={() => { copyToClipboard(p.link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1400); }).catch(() => {}); }} />
            </div>
          )}
          {/* Show the customization UI for ANY customizable product (custom
              logo, personalized, monogram, photo, ball-marker, …), not just
              custom-logo — e.g. a "Personalized Ball Marker" hat clip. */}
          {!p.isCustom && (p.customizable || p.customLogo) && <CustomizeBlock p={p} onChange={setDecoration} />}
          {/* Inventory + cost for a catalog SKU (loads on press). */}
          {!p.isCustom && p.sku && <InventoryPanel sku={p.parentCode || p.sku} />}
          {p.isCustom && p.custom && p.custom.cost > 0 && (
            <div style={{ marginTop: 16, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Cost <b style={{ color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)' }}>{usd(p.custom.cost)}</b>/unit · used for margin</div>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', gap: 8, flexShrink: 0, background: 'var(--gb-fill-inverse-strong)' }}>
          {p.isCustom
            ? <Btn variant="secondary" size="md" icon={<I.edit />} style={{ flex: 1 }} onClick={() => onEdit && onEdit(p.custom)}>Edit</Btn>
            : <Btn variant="secondary" size="md" icon={<I.eye />} style={{ flex: 1 }} onClick={openProduct}>View product</Btn>}
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

function CategoryRail({ sel, onSelect, depts, deptCounts, total, dock, view, onSetView, savedCount, customCount }) {
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 10px 8px', flexShrink: 0 }}>Browse</div>
      {/* Capped, scrollable list with a soft fade at the top/bottom edges. */}
      <div className="gb-gc-norail" style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 0', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)' }}>
        {/* No "All Items" row — the catalog defaults to the full golfballs.com
            set, and a plain search spans everything. Pick a department to browse
            one (click it again to clear); /category scopes a search. ── */}
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

        {/* Custom items — rep-defined, deliberately kept OUT of "All Items".
            Sits at the foot of Departments behind a thin divider. */}
        <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '8px 11px', flexShrink: 0 }} />
        <SavedNavRow label="Custom Items" icon={<I.sparkle size={14} />} count={customCount}
          active={view === 'custom'} onClick={() => onSetView('custom')} />

        {/* ── Saved — lives inside the scroll list, anchored to the categories
            so it never shifts when the proposal dock animates in/out below. ── */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '12px 11px 4px', flexShrink: 0 }}>Saved</div>
        <SavedNavRow label="Saved Proposals" icon={<I.bookmark size={14} />} count={savedCount}
          active={view === 'proposals'} onClick={() => onSetView('proposals')} />
        {/* Coming soon: proposals already applied to the opportunity (pulled from
            the CRM), distinct from local saved drafts. */}
        <SavedStub label="Current Proposals" icon={<I.card size={14} />} />
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
  const giftSet = line.decoration && line.decoration.giftSet;   // gift-set packaging (sleeve / 6-ball / wooden)
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
        <MiniThumb src={lineGiftImg(line) || p.img} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', flexShrink: 0 }}>{money(lineTot)}</span>
          </div>
        </div>
        <span onClick={onRemove} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--gb-text-muted)', cursor: 'pointer', borderRadius: 'var(--gb-r-sm)' }}><I.trash size={13} /></span>
      </div>
      {/* Gift-set packaging banner — the line is boxed into a corporate gift set,
          priced per set (the ball customization shows as the imprint tags below). */}
      {giftSet && (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)' }}>
          <I.sparkle size={11} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gb-brand-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{giftSet.name}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gb-text-tertiary)', flexShrink: 0, whiteSpace: 'nowrap' }}>· {giftSetSizeLabel(giftSet)} · per set</span>
        </div>
      )}
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
                  ? <img src={chip.image} alt="" draggable={false} style={{ width: 14, height: 14, borderRadius: 3, objectFit: chip.iconName ? 'contain' : 'cover', background: '#f4f4f1', flexShrink: 0 }} />
                  : (chip.kind === 'text' || chip.kind === 'monogram')
                    ? <span title={chip.color} style={{ width: 9, height: 9, borderRadius: '50%', background: chip.color || 'currentColor', border: '1px solid var(--gb-border-default)', flexShrink: 0 }} />
                    : <I.edit size={9} />}
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

/* ── Margin / cost model ──────────────────────────────────────────────────────
   Real cost when we have it, else a flat-40% placeholder:
     • custom items carry their own per-unit `cost`,
     • catalog products use the per-SKU Cost cached from the inventory endpoint
       (populated when a rep checks inventory; primed on modal mount),
     • otherwise fall back to 60%-of-sell. */
const COST_RATIO = 0.60;            // assumed cost as a fraction of sell price → 40% margin
const ASSUMED_MARGIN = 1 - COST_RATIO;
const unitCostOf = (product, unitPrice, qty) => {
  const p = product || {};
  if (p.isCustom) {
    // Per-qty cost from the net-cost ladder when present (most accurate), else the
    // single cost.
    const cb = p.costBreaks || (p.custom && p.custom.costBreaks);
    if (cb && cb.length) { const c = costAtQty(cb, qty || p.minQty || 1, null); if (c != null && c > 0) return Math.round(c * 100) / 100; }
    const c = p.cost != null ? p.cost : (p.custom && p.custom.cost);
    if (c != null && c > 0) return Math.round(c * 100) / 100;
  } else {
    const c = cachedCostForSku(p.parentCode || p.sku);
    if (c != null && c > 0) return Math.round(c * 100) / 100;
  }
  return Math.round((unitPrice || 0) * COST_RATIO * 100) / 100;
};

/* Per-line + blended margin for resolved entries
   ([{ product, decoration, splits:[{qty,price}] }]). Setup/decoration fees fold
   in here later (they're already in each split's price for the cart). */
function marginReport(entries) {
  let rev = 0, cost = 0, units = 0;
  const lines = (entries || []).map((e) => {
    let lr = 0, lc = 0, u = 0;
    (e.splits || []).forEach((s) => { const q = s.qty || 0, p = s.price || 0; lr += q * p; lc += q * unitCostOf(e.product, p, q); u += q; });
    rev += lr; cost += lc; units += u;
    return { ...e, units: u, lineRev: lr, lineCost: lc, profit: lr - lc, margin: lr ? (lr - lc) / lr : 0 };
  });
  return { lines, units, count: lines.length, rev, cost, profit: rev - cost, margin: rev ? (rev - cost) / rev : 0 };
}

const marginTone = (m) => (m >= 0.45 ? 'success' : m >= 0.32 ? 'warning' : 'error');
const TONE_FG = { success: 'var(--gb-success-fg, #2e9e5b)', warning: 'var(--gb-warning-fg, #b6830a)', error: 'var(--gb-danger, #e5484d)' };
const TONE_BG = { success: 'var(--gb-success-tint, rgba(46,158,91,.12))', warning: 'var(--gb-warning-tint, rgba(182,131,10,.12))', error: 'var(--gb-danger-tint, rgba(229,72,77,.12))' };
const TONE_BD = { success: 'var(--gb-success-border, rgba(46,158,91,.32))', warning: 'var(--gb-warning-border, rgba(182,131,10,.32))', error: 'var(--gb-danger-tint-border, rgba(229,72,77,.32))' };
const pctOf = (n) => (n * 100).toFixed(1) + '%';

function MarginBadge({ m, lg }) {
  const t = marginTone(m);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: lg ? '3px 9px' : '2px 7px', borderRadius: 'var(--gb-r-sm)', background: TONE_BG[t], border: '1px solid ' + TONE_BD[t], color: TONE_FG[t], fontSize: lg ? 12.5 : 10.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{pctOf(m)}</span>
  );
}

function StatTile({ label, value, sub, accent, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: accent ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)') }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', letterSpacing: -.4, color: tone || (accent ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)') }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
      {icon && <span style={{ color: 'var(--gb-brand-label)', display: 'flex' }}>{React.cloneElement(icon, { size: 13 })}</span>}
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-secondary)' }}>{children}</span>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

function SummaryRow({ label, value, strong, tone, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontSize: strong ? 12.5 : 11.5, padding: strong ? '3px 0' : '2px 0' }}>
      <span style={{ color: strong ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)', fontWeight: strong ? 700 : 500 }}>{label}</span>
      <div style={{ flex: 1 }} />
      {badge}
      {value != null && <span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: strong ? 800 : 600, color: tone || (strong ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)'), marginLeft: 8 }}>{value}</span>}
    </div>
  );
}

/* One product row in the line-items + margin table. */
function MarginLineRow({ e, first }) {
  const chips = decoImprints(e.decoration);
  return (
    <div style={{ padding: '9px 12px', borderTop: first ? 'none' : '1px solid var(--gb-border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MiniThumb src={lineGiftImg(e) || e.product.img} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{e.product.brand}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lineGiftTitle(e) || e.product.title}</div>
        </div>
        <span style={{ width: 50, textAlign: 'right', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{e.units}</span>
        <span style={{ width: 80, textAlign: 'right', fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{money(e.lineRev)}</span>
        <span style={{ width: 74, textAlign: 'right', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{money(e.lineCost)}</span>
        <span style={{ width: 56, display: 'flex', justifyContent: 'flex-end' }}><MarginBadge m={e.margin} /></span>
      </div>
      {(e.splits.length > 1 || chips.length > 0) && (
        <div style={{ marginTop: 7, paddingLeft: 46, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {e.splits.length > 1 && e.splits.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)' }}>
              <span>{s.qty} × {usd(s.price)}</span>
              <span style={{ color: 'var(--gb-text-ghost)', margin: '0 7px' }}>·</span>
              <span style={{ color: 'var(--gb-text-muted)' }}>cost {usd(unitCostOf(e.product, s.price))}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{money((s.qty || 0) * (s.price || 0))}</span>
            </div>
          ))}
          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: e.splits.length > 1 ? 3 : 0 }}>
              {chips.map((c) => (
                <span key={c.slot} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', fontSize: 9, fontWeight: 700 }}>{c.label}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* A color chip — swatch + hex (or a named label). */
function Swatch({ color, label }) {
  if (!color) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid var(--gb-border-default)', flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-muted)', textTransform: 'uppercase' }}>{label || color}</span>
    </span>
  );
}

/* A detailed customization row for one imprint chip (front or 2nd pole): the art
   (logo / icon image or a typed glyph), the type + which pole, the actual content
   (text + font · initials + style · filename · icon name), and color swatch(es). */
function ImprintDetail({ chip }) {
  const slotLabel = chip.slot === 'second' ? 'Back' : 'Front';
  const typeLabel = chip.iconName ? 'Icon' : chip.kind === 'text' ? 'Personalized' : chip.kind === 'monogram' ? 'Monogram' : 'Custom Logo';
  const lines = (chip.lines || []).filter((l) => l != null && String(l).trim() !== '');
  const monoStyle = chip.kind === 'monogram' ? String(chip.view || chip.overlay || '').replace(/(\d)/, ' $1').trim() : '';
  // The little square of "art" on the left.
  const art = chip.image
    ? <img src={chip.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3, boxSizing: 'border-box' }} />
    : chip.kind === 'monogram'
      ? <span style={{ fontSize: 13, fontWeight: 800, color: chip.color || '#000', fontFamily: 'var(--gb-font-mono)' }}>{String(chip.text || '').toUpperCase().slice(0, 3) || 'AB'}</span>
      : chip.kind === 'text'
        ? <span style={{ fontSize: 14, fontWeight: 700, color: chip.color || '#000' }}>Aa</span>
        : <I.edit size={15} style={{ color: 'var(--gb-text-tertiary)' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
      <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 'var(--gb-r-sm)', background: '#fff', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{art}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{typeLabel}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: chip.slot === 'second' ? 'var(--gb-success-fg, #2e9e5b)' : 'var(--gb-brand-label)', background: chip.slot === 'second' ? 'var(--gb-success-tint, rgba(46,158,91,.12))' : 'var(--gb-brand-tint-soft)', border: '1px solid ' + (chip.slot === 'second' ? 'var(--gb-success-border, rgba(46,158,91,.32))' : 'var(--gb-brand-tint-border)'), borderRadius: 'var(--gb-r-pill)', padding: '1px 6px' }}>{slotLabel} pole</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {chip.kind === 'text' && (lines.length ? <>“{lines.join(' / ')}” · <span style={{ color: 'var(--gb-text-muted)' }}>{chip.font}</span></> : <span style={{ fontStyle: 'italic', color: 'var(--gb-text-muted)' }}>No text entered</span>)}
          {chip.kind === 'monogram' && <>{String(chip.text || '').toUpperCase() || '—'}{monoStyle ? <> · <span style={{ color: 'var(--gb-text-muted)', textTransform: 'capitalize' }}>{monoStyle}</span></> : null}</>}
          {chip.kind === 'logo' && (chip.iconName || chip.fileName || <span style={{ fontStyle: 'italic', color: 'var(--gb-text-muted)' }}>Uploaded logo</span>)}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        {chip.kind === 'text' && <Swatch color={chip.color} />}
        {chip.kind === 'monogram' && <>
          <Swatch color={chip.color} label="C1" />
          {chip.color2 && chip.color2 !== '#FFFFFF' && <Swatch color={chip.color2} label="C2" />}
        </>}
      </div>
    </div>
  );
}

/* The proposal-breakdown drill-in: revenue, cost, gross profit, blended margin,
   the line items + per-line margin, the imprints, and a margin summary. Opened
   by clicking a saved card or the current-proposal card. */
function SavedDetail({ title, subtitle, badge, entries, current, loaded, onClose, onLoad, onOpenProposal, onCopy, onSaveToAccount, buildEmailSource }) {
  const M = useMemo(() => marginReport(entries), [entries]);
  const decorated = M.lines.filter((l) => decoImprints(l.decoration).length > 0 || (l.decoration && l.decoration.giftSet));
  // Email composer lives INLINE here (replacing the breakdown) rather than in a
  // separate modal — a smoother single-surface flow. Built lazily on demand.
  const [emailMode, setEmailMode] = useState(false);
  const emailSource = useMemo(() => (emailMode && buildEmailSource) ? buildEmailSource() : null, [emailMode, buildEmailSource]);
  const canEmail = !!buildEmailSource && M.count > 0;
  // Copy-as-command spins while artwork uploads, mirroring the card behaviour.
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    if (!onCopy || copying) return;
    setCopying(true);
    Promise.resolve(onCopy()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}).finally(() => setCopying(false));
  };
  const copyIcon = copying
    ? <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'gb-spin .7s linear infinite' }} />
    : copied ? <I.check /> : <I.copy />;
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)' }}>
      {/* header — morphs to an email-composer header in emailMode */}
      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <IconBtn size="sm" variant="ghost" icon={<ArrowL />} onClick={emailMode ? () => setEmailMode(false) : onClose} />
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: emailMode ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (emailMode ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), color: emailMode ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background var(--gb-anim), border-color var(--gb-anim), color var(--gb-anim)' }}>
          {emailMode ? <I.mail size={16} /> : current ? <I.card size={16} /> : <I.bookmark size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emailMode ? `Compose proposal email · ${M.count} ${M.count === 1 ? 'item' : 'items'}` : subtitle}</div>
        </div>
        {!emailMode && badge}
        <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {emailMode && emailSource ? (
      <motion.div key="email" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }} transition={{ duration: .2 }}>
        <ProposalEmailComposer source={emailSource} onBack={() => setEmailMode(false)} backLabel="Back to breakdown" />
      </motion.div>
      ) : (
      <motion.div key="breakdown" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: .2 }}>
      {/* stat strip */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px 6px', flexShrink: 0 }}>
        <StatTile label="Revenue" value={money(M.rev)} sub={`${M.units} units · ${M.count} ${M.count === 1 ? 'item' : 'items'}`} />
        <StatTile label="Est. cost" value={money(M.cost)} sub="assumed" />
        <StatTile label="Gross profit" value={money(M.profit)} accent />
        <StatTile label="Blended margin" value={pctOf(M.margin)} tone={TONE_FG[marginTone(M.margin)]} sub="all-in" />
      </div>

      {/* body */}
      <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <SectionTitle icon={<I.card />}>Line items &amp; margin</SectionTitle>
          {M.lines.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', padding: '8px 2px' }}>No items yet.</div>
          ) : (
            <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'var(--gb-fill-subtle)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
                <span style={{ flex: 1 }}>Product</span>
                <span style={{ width: 50, textAlign: 'right' }}>Qty</span>
                <span style={{ width: 80, textAlign: 'right' }}>Revenue</span>
                <span style={{ width: 74, textAlign: 'right' }}>Cost</span>
                <span style={{ width: 56, textAlign: 'right' }}>Margin</span>
              </div>
              {M.lines.map((e, i) => <MarginLineRow key={e.id || i} e={e} first={i === 0} />)}
            </div>
          )}
        </div>

        {decorated.length > 0 && (
          <div>
            <SectionTitle icon={<Gift />} right={<span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{decorated.length} decorated</span>}>Customization</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {decorated.map((e, i) => (
                <div key={e.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MiniThumb src={lineGiftImg(e) || e.product.img} size={22} />
                    <div style={{ minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.product.title}</div>
                  </div>
                  {e.decoration && e.decoration.giftSet && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)' }}>
                      <I.sparkle size={11} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gb-brand-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.decoration.giftSet.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gb-text-tertiary)', flexShrink: 0 }}>· {giftSetSizeLabel(e.decoration.giftSet)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 6 }}>
                    {decoImprints(e.decoration).map((c) => <ImprintDetail key={c.slot} chip={c} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <SectionTitle icon={<Layers />}>Margin summary</SectionTitle>
          <div style={{ borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-subtle)', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SummaryRow label={`Revenue · ${M.units} units`} value={money(M.rev)} />
            <SummaryRow label={`Est. cost · ${pctOf(COST_RATIO)} of sell`} value={'−' + money(M.cost)} tone="var(--gb-text-muted)" />
            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '7px 0' }} />
            <SummaryRow label="Gross profit" value={money(M.profit)} strong tone="var(--gb-brand-label)" />
            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '7px 0' }} />
            <SummaryRow label="Blended margin" strong badge={<MarginBadge m={M.margin} lg />} />
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <I.alert size={12} /> Costs &amp; margins are estimates ({pctOf(ASSUMED_MARGIN)} assumed) for quoting.
        </span>
        <div style={{ flex: 1 }} />
        {current ? (
          <>
            <Btn variant="ghost" size="md" icon={<I.card />} onClick={onOpenProposal}>Open proposal</Btn>
            {canEmail && <Btn variant="primary" size="md" icon={<I.mail />} onClick={() => setEmailMode(true)}>Generate email</Btn>}
          </>
        ) : (
          <>
            {onCopy && <Btn variant="ghost" size="md" icon={copyIcon} onClick={doCopy}>{copied ? 'Copied' : 'Copy command'}</Btn>}
            {onSaveToAccount && <Btn variant="ghost" size="md" icon={<I.send />} onClick={onSaveToAccount}>Save to account</Btn>}
            <Btn variant="secondary" size="md" icon={loaded ? <I.check /> : <I.plus />} onClick={onLoad}>{loaded ? 'Loaded' : 'Load'}</Btn>
            {canEmail && <Btn variant="primary" size="md" icon={<I.mail />} onClick={() => setEmailMode(true)}>Generate email</Btn>}
          </>
        )}
      </div>
      </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

function ThumbStack({ entries, max = 4, size = 44 }) {
  const shown = entries.slice(0, max);
  const extra = entries.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((e, i) => (
        <div key={i} style={{ marginLeft: i ? -13 : 0, zIndex: shown.length - i, width: size, height: size, flexShrink: 0, background: '#f4f4f1', borderRadius: 'var(--gb-r-md)', overflow: 'hidden', border: '1px solid var(--gb-border-default)', boxShadow: '0 0 0 2px var(--gb-surface-modal), 0 1px 5px rgba(0,0,0,.18)' }}>
          {(lineGiftImg(e) || e.product.img) && <img src={lineGiftImg(e) || e.product.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5, boxSizing: 'border-box' }} />}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ marginLeft: -13, zIndex: 0, width: size, height: size, flexShrink: 0, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-strong)', border: '1px solid var(--gb-border-default)', boxShadow: '0 0 0 2px var(--gb-surface-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)' }}>+{extra}</div>
      )}
    </div>
  );
}

function SavedCard({ item, loaded, pos, colW, onMeasure, onOpen, onLoad, onDelete, moveAnim }) {
  const [hover, setHover] = useState(false);
  const [tagHover, setTagHover] = useState(false);
  const cardRef = useRef(null);
  // Report natural height up so the masonry can pack columns and animate
  // neighbors into the gap when a card is removed. Re-measure when the column
  // width changes (re-wraps titles) or fonts/content settle.
  useLayoutEffect(() => {
    const el = cardRef.current; if (!el) return;
    const report = () => onMeasure(item.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, colW, onMeasure]);
  const r = useMemo(() => resolveSavedEntry(item), [item]);
  const lines = r.entries.map((e) => ({ qty: e.splits.reduce((a, x) => a + (x.qty || 0), 0), title: (lineGiftTitle(e) || e.product.title || e.product.brand || 'Item') }));
  const shownLines = lines.slice(0, 3);
  return (
    <motion.div ref={cardRef}
      initial={{ opacity: 0, scale: .97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: .92 }}
      transition={{ duration: .2, ease: [.34, 1.4, .64, 1] }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onOpen && onOpen(item)} title="View margin breakdown"
      style={{ position: 'absolute', top: pos.y, left: pos.x, width: colW, display: 'flex', flexDirection: 'column', gap: 11, padding: 13, boxSizing: 'border-box', cursor: 'pointer', background: 'var(--gb-surface-1)', border: '1px solid ' + (loaded ? 'var(--gb-brand-label)' : hover ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-lg)', boxShadow: hover ? '0 2px 7px rgba(0,0,0,.07)' : 'none', transition: (moveAnim ? 'top .42s cubic-bezier(.4,0,.2,1), left .42s cubic-bezier(.4,0,.2,1), ' : '') + 'border-color var(--gb-anim), box-shadow var(--gb-anim)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <ThumbStack entries={r.entries} />
        <div style={{ flex: 1 }} />
        {/* The "Draft" tag IS the delete control — hovering it turns it red and
            clicking removes the draft (keeps the card otherwise button-free). */}
        <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          onMouseEnter={() => setTagHover(true)} onMouseLeave={() => setTagHover(false)}
          title={tagHover ? 'Delete this draft' : 'Saved draft'}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 20, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: .2, overflow: 'hidden',
            background: tagHover ? 'var(--gb-danger-tint, rgba(229,72,77,.12))' : 'var(--gb-fill-subtle)',
            border: '1px solid ' + (tagHover ? 'var(--gb-danger-tint-border, rgba(229,72,77,.4))' : 'var(--gb-border-default)'),
            color: tagHover ? 'var(--gb-danger, #e5484d)' : 'var(--gb-text-tertiary)',
            transition: 'background var(--gb-anim), border-color var(--gb-anim), color var(--gb-anim)' }}>
          {/* Crossfade the label/icon as it flips Draft → Delete on hover. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={tagHover ? 'del' : 'draft'}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              transition={{ duration: .13, ease: 'easeOut' }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {tagHover ? <><I.trash size={10} /> Delete</> : <><I.bookmark size={9} /> Draft</>}
            </motion.span>
          </AnimatePresence>
        </button>
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
      {/* View-breakdown hint and Load sit on ONE aligned row (design parity). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: hover ? 'var(--gb-text-secondary)' : 'var(--gb-text-muted)', transition: 'color var(--gb-anim)' }}>
          <I.eye size={12} /> View breakdown
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onLoad(item); }} title={loaded ? 'Added to proposal' : 'Load these items into the proposal'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, flexShrink: 0, background: loaded ? 'var(--gb-brand-label)' : 'var(--gb-brand-tint-medium)', color: loaded ? 'var(--gb-surface-deep)' : 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)', transition: 'all var(--gb-anim)' }}>
          {loaded ? <><I.check size={12} strokeWidth={3} /> Added</> : <><I.plus size={12} /> Load</>}
        </button>
      </div>
    </motion.div>
  );
}

// Masonry geometry: place each card in the shortest column (absolute x/y) so
// columns stay balanced, cards keep their natural height, and framer can spring
// neighbors into the gap when one is deleted.
const MASONRY_GAP = 12;
const MASONRY_COL_MIN = 290;
function computeMasonry(items, width, heights) {
  if (!width) return { positions: {}, height: 0, colW: MASONRY_COL_MIN, cols: 1 };
  const cols = Math.max(1, Math.floor((width + MASONRY_GAP) / (MASONRY_COL_MIN + MASONRY_GAP)));
  const colW = (width - MASONRY_GAP * (cols - 1)) / cols;
  const colH = new Array(cols).fill(0);
  const positions = {};
  items.forEach((it) => {
    let c = 0;
    for (let i = 1; i < cols; i++) if (colH[i] < colH[c] - 0.5) c = i;
    positions[it.id] = { x: c * (colW + MASONRY_GAP), y: colH[c] };
    colH[c] += (heights[it.id] || 240) + MASONRY_GAP;
  });
  return { positions, height: Math.max(0, Math.max(...colH, 0) - MASONRY_GAP), colW, cols };
}

/* A pinned banner for the live, unsaved working proposal — click to inspect its
   margin in the same breakdown panel. */
function CurrentProposalCard({ entries, onOpen }) {
  const [hover, setHover] = useState(false);
  const M = useMemo(() => marginReport(entries), [entries]);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="View margin breakdown"
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 13, marginBottom: 14, cursor: 'pointer', background: 'var(--gb-brand-tint-soft)', border: '1px dashed var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-lg)', boxShadow: hover ? '0 2px 7px rgba(0,0,0,.07)' : 'none', transition: 'box-shadow var(--gb-anim)' }}>
      <ThumbStack entries={M.lines} size={42} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Current proposal</span>
          <Tag tone="brand" size="sm" icon={<Dot tone="brand" size={5} />}>Unsaved</Tag>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: 3, fontWeight: 500 }}>{M.count} {M.count === 1 ? 'item' : 'items'} · {M.units} units · live working set</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)', letterSpacing: -.4 }}>{money(M.rev)}</div>
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}><MarginBadge m={M.margin} /></div>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hover ? 'var(--gb-brand-label)' : 'var(--gb-brand-tint-medium)', color: hover ? 'var(--gb-surface-deep)' : 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)', transition: 'all var(--gb-anim)' }}>
        <I.chevr size={18} />
      </div>
    </div>
  );
}

function SavedGallery({ items, loadedId, current, onOpen, onOpenCurrent, onLoad, onCopy, onDelete, onSaveToAccount, onEmail }) {
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState({});
  const setHeight = useCallback((id, h) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);
  // Track the scroll area's content width (minus its 16px padding) to size columns.
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const measure = () => setWidth(el.clientWidth - 32);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Drop heights for cards that no longer exist so stale rows don't skew packing.
  useEffect(() => {
    setHeights((prev) => {
      const live = new Set(items.map((it) => it.id));
      const next = {}; let changed = false;
      for (const k in prev) { if (live.has(k)) next[k] = prev[k]; else changed = true; }
      return changed ? next : prev;
    });
  }, [items]);
  const { positions, height, colW } = useMemo(() => computeMasonry(items, width, heights), [items, width, heights]);
  // Don't transition card left/top until the masonry has measured the width AND
  // every card's height. Otherwise the first settle — where all cards momentarily
  // sit at {0,0} before positions resolve — animates, and they "float" out of the
  // top-left corner. Once settled the flag stays on, so deleting a card still
  // animates the rest into the gap.
  const settled = width > 0 && items.length > 0 && items.every((it) => heights[it.id] != null);
  const [moveAnim, setMoveAnim] = useState(false);
  useEffect(() => { if (settled && !moveAnim) setMoveAnim(true); }, [settled, moveAnim]);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I.bookmark size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Saved Proposals</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, fontWeight: 500 }}>Click any card to view its margin breakdown &amp; order items{items.length ? ' · or load / copy a draft' : ''}</div>
        </div>
      </div>
      <div ref={scrollRef} className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {current && current.length > 0 && <CurrentProposalCard entries={current} onOpen={onOpenCurrent} />}
        {items.length === 0 ? (
          (current && current.length > 0) ? (
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', padding: '18px 0', lineHeight: 1.5 }}>Saved drafts appear here — hit “Save draft” to keep one.</div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <I.bookmark size={20} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No saved proposals yet</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>Build a proposal and hit “Save draft” to keep it here for later.</div>
            </div>
          )
        ) : (
          <div style={{ position: 'relative', width: '100%', height }}>
            <AnimatePresence>
              {items.map((it) => (
                <SavedCard key={it.id} item={it} loaded={loadedId === it.id}
                  pos={positions[it.id] || { x: 0, y: 0 }} colW={colW} onMeasure={setHeight} moveAnim={moveAnim}
                  onOpen={onOpen} onLoad={onLoad} onDelete={onDelete} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, onClose, onPatchSplit, onAddSplit, onRemoveSplit, onRemoveLine, onClear, onSaveDraft, onMergeImprint, onRemoveFront, onRemoveSecond, pageContext = {}, onSaveToAccount, onAddOpportunity, accountSaveSeq = 0, onEmail }) {
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
  // Save-to-account (publish) flow — pick an account + opportunity, then PUT the
  // proposal. The account is prefilled from the CRM page context when the catalog
  // was opened on an account/contact/order page; otherwise the rep types one.
  const [acctMode, setAcctMode] = useState(false);
  const [acctSaved, setAcctSaved] = useState(false);
  const [savingAcct, setSavingAcct] = useState(false);
  const [accountId, setAccountId] = useState(pageContext.accountId || '');
  const [opps, setOpps] = useState(pageContext.opportunities || []);
  const [oppId, setOppId] = useState('');
  const [loadingOpps, setLoadingOpps] = useState(false);
  const loadOpps = useCallback((id) => {
    if (!id) { setOpps([]); return; }
    setLoadingOpps(true);
    fetchOpportunitiesForAccount(id)
      .then((list) => setOpps(list || []))
      .catch(() => setOpps([]))
      .finally(() => setLoadingOpps(false));
  }, []);
  const openAccountMode = useCallback(() => {
    setSaved(false); setAcctSaved(false); setSaveMode(false);
    const pcAcct = pageContext.accountId || '';
    setAccountId(pcAcct);
    setOppId('');
    if (pageContext.opportunities && pageContext.opportunities.length) setOpps(pageContext.opportunities);
    else if (pcAcct) loadOpps(pcAcct);
    else setOpps([]);
    setAcctMode(true);
  }, [pageContext.accountId, pageContext.opportunities, loadOpps]);
  const nameRef2 = useRef(null);
  const seqRef = useRef(accountSaveSeq);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  useEffect(() => { if (proposal.length === 0) { setSaveMode(false); setSaved(false); setAcctMode(false); setAcctSaved(false); } }, [proposal.length]);
  useEffect(() => { if (!saveMode) return; const id = setTimeout(() => nameRef.current && nameRef.current.focus(), 60); return () => clearTimeout(id); }, [saveMode]);
  useEffect(() => { if (!acctMode) return; const id = setTimeout(() => nameRef2.current && nameRef2.current.focus(), 60); return () => clearTimeout(id); }, [acctMode]);
  // Draft "Save to account" shortcut bumps accountSaveSeq → open the account form.
  useEffect(() => { if (accountSaveSeq === seqRef.current) return; seqRef.current = accountSaveSeq; openAccountMode(); }, [accountSaveSeq, openAccountMode]);
  const confirmSave = () => {
    if (saving) return;
    setSaving(true);
    Promise.resolve(onSaveDraft && onSaveDraft(name.trim() || 'Untitled draft')).then(() => {
      setSaving(false); setSaveMode(false); setName(''); setSaved(true);
      clearTimeout(savedTimer.current); savedTimer.current = setTimeout(() => setSaved(false), 1600);
    }).catch(() => setSaving(false));
  };
  const confirmAccountSave = () => {
    if (savingAcct || !oppId || !name.trim()) return;
    setSavingAcct(true);
    Promise.resolve(onSaveToAccount && onSaveToAccount({
      opportunityID: oppId,
      customerID: pageContext.customerId || 0,
      name: name.trim(),
    })).then(() => {
      setSavingAcct(false); setAcctMode(false); setName(''); setAcctSaved(true);
      clearTimeout(savedTimer.current); savedTimer.current = setTimeout(() => setAcctSaved(false), 1800);
    }).catch(() => setSavingAcct(false));
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
          {proposal.length > 0 && onEmail && <Btn variant="ghost" size="sm" icon={<I.card />} onClick={onEmail}>HTML</Btn>}
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
            {/* Account + opportunity form — collapses in for "Save to account".
                Account prefills from the CRM page context; opportunities come
                from that page or are fetched for a typed account id. */}
            <div style={{ overflow: 'hidden', maxHeight: acctMode ? 280 : 0, opacity: acctMode ? 1 : 0, transition: 'max-height .32s cubic-bezier(.4,0,.2,1), opacity .22s ease' }}>
              <div style={{ padding: '2px 12px 4px' }}>
                <div style={{ borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Account id (+ name hint when known) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>
                      Account{pageContext.accountName ? ` · ${pageContext.accountName}` : ''}
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Input size="sm" mono value={accountId} placeholder="Account ID"
                        onChange={(v) => setAccountId(v.trim())}
                        onKeyDown={(e) => { if (e.key === 'Enter') loadOpps(accountId); }}
                        style={{ flex: 1 }} />
                      <Btn variant="secondary" size="sm" onClick={() => loadOpps(accountId)} state={loadingOpps ? 'loading' : 'idle'} disabled={!accountId}>Find</Btn>
                    </div>
                  </div>
                  {/* Opportunity dropdown (+ new-opportunity button) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>
                      Opportunity{loadingOpps ? ' · loading…' : opps.length ? ` · ${opps.length}` : ''}
                    </label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                      <Dropdown size="sm" value={oppId} onChange={setOppId} searchable maxHeight={200}
                        disabled={loadingOpps || !opps.length}
                        placeholder={loadingOpps ? 'Loading…' : opps.length ? 'Select an opportunity' : (accountId ? 'No opportunities found' : 'Enter an account first')}
                        options={opps.map((o) => ({ id: String(o.id), label: `${o.id} — ${o.subject || 'Untitled'}${o.estimatedValue ? ` · ${money(o.estimatedValue)}` : ''}` }))}
                        style={{ flex: 1, minWidth: 0 }} />
                      <IconBtn size="sm" variant="secondary" icon={<I.plus />} title="New opportunity" onClick={() => onAddOpportunity && onAddOpportunity(accountId)} />
                    </div>
                  </div>
                  {/* Proposal name */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Proposal name</label>
                    <Input size="sm" nativeRef={nameRef2} value={name} placeholder="e.g. ProV1 Gift Sets"
                      onChange={setName}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmAccountSave(); if (e.key === 'Escape') setAcctMode(false); }} />
                  </div>
                </div>
              </div>
            </div>
            {/* Action row — morphs between idle / name-entry / account / saved
                flash. The slot has a fixed min-height so the footer never jumps:
                the content crossfades in place. */}
            <div style={{ minHeight: 48 }}>
            <AnimatePresence mode="wait" initial={false}>
            {(saved || acctSaved) ? (
              <motion.div key="flash" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18, ease: 'easeOut' }} style={{ padding: '4px 12px 12px' }}>
                <div style={{ height: 32, borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--gb-success-tint-medium, rgba(46,158,91,.16))', border: '1px solid var(--gb-success-tint-border, rgba(46,158,91,.35))', color: 'var(--gb-success-fg, #2e9e5b)', fontSize: 12.5, fontWeight: 700 }}>
                  <I.check size={15} strokeWidth={3} /> {acctSaved ? 'Saved to opportunity' : 'Saved to Saved Proposals'}
                </div>
              </motion.div>
            ) : acctMode ? (
              <motion.div key="acct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14 }} style={{ padding: '4px 12px 12px', display: 'flex', gap: 8 }}>
                <Btn variant="ghost" size="md" style={{ flex: 1 }} onClick={() => { setAcctMode(false); }}>Cancel</Btn>
                <Btn variant="primary" size="md" icon={<I.send />} style={{ flex: 1.4 }} state={savingAcct ? 'loading' : 'idle'} disabled={!oppId || !name.trim()} onClick={confirmAccountSave}>Save to account</Btn>
              </motion.div>
            ) : saveMode ? (
              <motion.div key="namebox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14 }} style={{ padding: '4px 12px 12px', display: 'flex', gap: 8 }}>
                <Btn variant="ghost" size="md" style={{ flex: 1 }} onClick={() => { setSaveMode(false); setName(''); }}>Cancel</Btn>
                <Btn variant="primary" size="md" icon={<I.check />} style={{ flex: 1.4 }} state={saving ? 'loading' : 'idle'} onClick={confirmSave}>Confirm save</Btn>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14 }} style={{ padding: '4px 12px 12px', display: 'flex', gap: 8 }}>
                <Btn variant="secondary" size="md" icon={<I.bookmark />} style={{ flex: 1 }} onClick={() => { setSaved(false); setName(''); setSaveMode(true); }}>Save draft</Btn>
                <Btn variant="primary" size="md" icon={<I.send />} style={{ flex: 1.4 }} onClick={openAccountMode}>Save to account</Btn>
              </motion.div>
            )}
            </AnimatePresence>
            </div>
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

/* ── Custom Items view ───────────────────────────────────────────────────────
   A grid of rep-defined custom items rendered with the standard ProductCard
   (via customItemToProduct), an "add" tile as the last cell, and a top-right
   "Add custom item" button. Clicking a card edits it; the round + adds it to the
   proposal; the trash overlay deletes it. */
function CustomAddTile({ onNew, minH }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onNew} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        minHeight: minH, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: hover ? 'var(--gb-brand-tint-soft)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
        border: '1.5px dashed ' + (hover ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-lg)',
        color: hover ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', transition: 'all var(--gb-anim)',
      }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hover ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (hover ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)') }}>
        <I.plus size={18} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700 }}>New custom item</span>
    </button>
  );
}

const REPO_RUN = { hpg: importHpgCatalog, snugz: importSnugzCatalog };

/* Repo import modal — pick a supplier "repo" and pull its customizable catalog in
   as custom items. A link input is stubbed for a future per-URL import. Running
   shows a live progress animation that can be cancelled mid-flight. */
function RepoImportModal({ onClose, onImported }) {
  const [repo, setRepo] = useState('hpg');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);   // { label, count, total }
  const signalRef = useRef(null);
  const repoOptions = Object.keys(REPOS).map((id) => ({ id, label: REPOS[id].name }));

  const run = () => {
    const fn = REPO_RUN[repo];
    if (!fn || busy) return;
    const signal = { aborted: false };
    signalRef.current = signal;
    setBusy(true);
    setProg({ label: 'Starting…' });
    const onProgress = (p) => {
      if (signal.aborted) return;
      const label = p.phase === 'list'
        ? (p.cats ? `Scanning categories — ${p.cat}/${p.cats} (${p.found} found)` : `Scanning catalog — page ${p.page}${p.totalPages ? '/' + p.totalPages : ''} (${p.kept} kept)`)
        : `Importing products — ${p.count}/${p.total}`;
      setProg({ label, count: p.count, total: p.total });
    };
    fn({ onProgress, signal })
      .then((res) => { if (!signal.aborted) onImported(repo, res); })
      .catch((e) => {
        if (signal.aborted || /cancel/i.test(e && e.message)) return;
        try { window.__gbToast && window.__gbToast.error && window.__gbToast.error((e && e.message) || 'Import failed', { duration: 4500 }); } catch { /* */ }
        setBusy(false);
      });
  };
  const stop = () => { if (signalRef.current) signalRef.current.aborted = true; };
  const close = () => { stop(); onClose(); };
  const pct = (prog && prog.total) ? Math.max(4, Math.round((prog.count / prog.total) * 100)) : null;

  return (
    <motion.div onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}
      style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)' }}>
      <motion.div initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        style={{ width: 420, maxWidth: '92%', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.download size={16} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Import from a repo</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1 }}>Pull a supplier’s customizable catalog into your custom items</div>
          </div>
          {!busy && <IconBtn size="sm" icon={<I.close />} onClick={onClose} />}
        </div>

        {busy ? (
          <div style={{ padding: '28px 22px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 56, height: 56 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--gb-brand-tint-soft)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 7, borderRadius: '50%', border: '2px solid var(--gb-brand-tint-soft)', borderBottomColor: 'var(--gb-brand-label)', animation: 'gb-spin 1.3s linear infinite reverse' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-brand-label)' }}><I.download size={18} /></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Importing {REPOS[repo].name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>{(prog && prog.label) || 'Working…'}</div>
            </div>
            <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'var(--gb-fill-subtle)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'var(--gb-brand-label)', width: pct != null ? `${pct}%` : '30%', animation: pct != null ? 'none' : 'gb-pulse 1s ease-in-out infinite', transition: 'width .35s ease' }} />
            </div>
            <Btn variant="secondary" size="md" icon={<I.close />} onClick={close} style={{ width: '100%' }}>Cancel import</Btn>
          </div>
        ) : (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Repo link</label>
              <Input size="sm" value="" onChange={() => {}} disabled placeholder="Paste a repo link to add a new source…" />
              <span style={{ fontSize: 10, color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Coming soon</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Repo</label>
              <Dropdown size="sm" value={repo} onChange={setRepo} options={repoOptions} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" size="md" icon={<I.download />} onClick={run}>Import</Btn>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function CustomItemsGallery({ items, compact, colMin, inProposal, onAdd, onNew, onOpen, onDelete, onDeleteMany, onReload, search = '' }) {
  const minH = compact ? 232 : 262;
  const INIT = 60, CHUNK = 48;
  const [visible, setVisible] = useState(INIT);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [repoOpen, setRepoOpen] = useState(false);
  const toast = useToast();
  const lastIdx = useRef(null);
  const scrollRef = useRef(null);
  const onRepoImported = (repoId, res) => {
    setRepoOpen(false);
    if (onReload) onReload();
    const r = REPOS[repoId];
    toast?.success?.(`Imported ${res.added} new + ${res.updated} updated from ${r ? r.name : repoId}`, { duration: 4000 });
  };
  // Driven by the shared catalog search bar — a leading "/" is a catalog command,
  // so it filters nothing here.
  const term = useMemo(() => { const s = (search || '').trim(); return s.startsWith('/') ? '' : s.toLowerCase(); }, [search]);
  // Search across name / SKU / brand (extraDetails) / description.
  const filtered = useMemo(() => {
    if (!term) return items;
    return items.filter((ci) =>
      (ci.name || '').toLowerCase().includes(term)
      || (ci.sku || '').toLowerCase().includes(term)
      || (ci.itemID || '').toLowerCase().includes(term)
      || (ci.extraDetails || '').toLowerCase().includes(term)
      || (ci.description || '').toLowerCase().includes(term));
  }, [items, term]);
  useEffect(() => { setVisible(INIT); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [term, items.length]);
  const exitSelect = () => { setSelectMode(false); setSel(new Set()); lastIdx.current = null; };
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
      setVisible((c) => (c < filtered.length ? Math.min(filtered.length, c + CHUNK) : c));
    }
  };
  const shown = filtered.slice(0, visible);
  const atEnd = visible >= filtered.length;
  // Click in select mode: shift extends a range (over the shown order); plain
  // click toggles one. Out of select mode: open the item.
  const onCardClick = (ci, idx, e) => {
    if (!selectMode) { onOpen(ci); return; }
    setSel((prev) => {
      const next = new Set(prev);
      if (e && e.shiftKey && lastIdx.current != null) {
        const [a, b] = [lastIdx.current, idx].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) { const it = shown[i]; if (it) next.add(it.id); }
      } else {
        if (next.has(ci.id)) next.delete(ci.id); else next.add(ci.id);
        lastIdx.current = idx;
      }
      return next;
    });
  };
  const bulkDelete = () => { const ids = [...sel]; if (!ids.length) return; Promise.resolve(onDeleteMany(ids)).finally(exitSelect); };
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I.sparkle size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Custom Items</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, fontWeight: 500 }}>
            {selectMode ? `${nfmt(sel.size)} selected · click to pick, shift-click for a range`
              : term ? `${nfmt(filtered.length)} of ${nfmt(items.length)} match`
              : `${nfmt(items.length)} item${items.length === 1 ? '' : 's'} — add them to a proposal like any product`}
          </div>
        </div>
        {selectMode ? (
          <IconBtn size="sm" variant="ghost" title="Cancel selection" icon={<I.close />} onClick={exitSelect} />
        ) : (
          items.length > 0 && <IconBtn size="sm" variant="secondary" title="Select items" icon={<I.check />} onClick={() => setSelectMode(true)} />
        )}
        {!selectMode && <IconBtn size="sm" variant="secondary" title="Import from a repo" icon={<I.download size={14} />} onClick={() => setRepoOpen(true)} />}
        <Btn variant="primary" size="sm" icon={<I.plus />} onClick={onNew}>Add custom item</Btn>
      </div>
      <AnimatePresence>
        {repoOpen && <RepoImportModal key="repo-import" onClose={() => setRepoOpen(false)} onImported={onRepoImported} />}
      </AnimatePresence>
      <div ref={scrollRef} onScroll={onScroll} className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)', textAlign: 'center', padding: 24 }}>
            <div style={{ width: 46, height: 46, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.sparkle size={20} /></div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{term ? 'No custom items match' : 'No custom items yet'}</div>
            {!term && <Btn variant="primary" size="sm" icon={<I.plus />} onClick={onNew}>Add custom item</Btn>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: compact ? 10 : 12 }}>
              {shown.map((ci, idx) => {
                const p = customItemToProduct(ci);
                const picked = sel.has(ci.id);
                return (
                  <div key={ci.id} style={{ position: 'relative', borderRadius: 'var(--gb-r-lg)', outline: picked ? '2px solid var(--gb-brand-label)' : 'none', outlineOffset: 2 }}>
                    <ProductCard p={p} compact={compact} showRating={false}
                      inProposal={inProposal(p.id)} onAdd={() => onAdd(ci)} onClick={(e) => onCardClick(ci, idx, e)} />
                    {/* Select-mode check — a rounded square (not a circle), filled when picked. */}
                    {selectMode && (
                      <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: picked ? 'var(--gb-brand-label)' : 'var(--gb-surface-modal)', border: '1px solid ' + (picked ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.12)', pointerEvents: 'none' }}>
                        {picked && <I.check size={13} strokeWidth={3} />}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Add tile sits at the end only when the whole (unfiltered) list fits. */}
              {!selectMode && !term && atEnd && <CustomAddTile onNew={onNew} minH={minH} />}
            </div>
            {!atEnd && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 0 6px', color: 'var(--gb-text-ghost)' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} />
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: .3 }}>Showing {nfmt(visible)} of {nfmt(filtered.length)}</span>
              </div>
            )}
          </>
        )}
      </div>
      {/* Bulk-delete — floats bottom-right while selecting. */}
      <AnimatePresence>
        {selectMode && sel.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: .16 }}
            style={{ position: 'absolute', right: 18, bottom: 18, zIndex: 6 }}>
            {/* variant=primary so its hover is a brightness filter (keeps the solid
                fill) — the `danger` variant's hover animates backgroundColor to a
                tint, which made the button go transparent on hover. */}
            <Btn variant="primary" size="md" icon={<I.trash />} onClick={bulkDelete}
              style={{ background: 'var(--gb-danger, #e5484d)', color: '#fff', border: '1px solid var(--gb-danger, #e5484d)', boxShadow: '0 6px 18px -6px rgba(0,0,0,.45)' }}>Delete {nfmt(sel.size)}</Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Labeled field row for the custom-item form. Module-level so it keeps a stable
   component identity across renders (an inner component would remount the input
   on every keystroke and steal focus). */
function CIField({ label, full, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

/* Custom-item create/edit form — overlays the modal body. Fields mirror the
   golfballs.com cart "custom item" form (name/style/extraDetails/itemID/price/
   setup/weight/qty/thumbnail/dropship + optional description). */
function CustomItemForm({ initial, onCancel, onSave, onDelete }) {
  const isEdit = !!(initial && initial.id);
  const s = (v) => (v == null ? '' : String(v));
  // Seed style options + price ladder from the spec shape, migrating the legacy
  // flat shape ({style, price, qty}) so old items open correctly.
  const seedStyles = () => {
    if (Array.isArray(initial.styleOptions) && initial.styleOptions.length) return initial.styleOptions.slice();
    if (initial.style) return [String(initial.style)];
    return [''];
  };
  const seedBreaks = () => {
    if (Array.isArray(initial.breaks) && initial.breaks.length) return initial.breaks.map((b) => ({ q: s(b.q), p: s(b.p) }));
    if (initial.price != null || initial.qty != null) return [{ q: s(initial.qty || 1), p: s(initial.price != null ? initial.price : '') }];
    return [{ q: '', p: '' }];
  };
  const [f, setF] = useState({
    id: initial.id, name: s(initial.name), extraDetails: s(initial.extraDetails),
    itemID: s(initial.itemID), thumbnail: s(initial.thumbnail), description: s(initial.description),
    cost: initial.cost != null ? String(initial.cost) : '', setup: initial.setup != null ? String(initial.setup) : '',
    weight: initial.weight != null ? String(initial.weight) : '', dropship: !!initial.dropship,
    styleOptions: seedStyles(), breaks: seedBreaks(),
  });
  // Style-option list editors
  const setStyleAt = (i, v) => setF((prev) => { const a = prev.styleOptions.slice(); a[i] = v; return { ...prev, styleOptions: a }; });
  const addStyle = () => setF((prev) => ({ ...prev, styleOptions: [...prev.styleOptions, ''] }));
  const removeStyle = (i) => setF((prev) => { const a = prev.styleOptions.filter((_, j) => j !== i); return { ...prev, styleOptions: a.length ? a : [''] }; });
  // Price-ladder editors
  const setBreakAt = (i, k, v) => setF((prev) => { const a = prev.breaks.map((b) => ({ ...b })); a[i][k] = v; return { ...prev, breaks: a }; });
  const addBreak = () => setF((prev) => ({ ...prev, breaks: [...prev.breaks, { q: '', p: '' }] }));
  const removeBreak = (i) => setF((prev) => { const a = prev.breaks.filter((_, j) => j !== i); return { ...prev, breaks: a.length ? a : [{ q: '', p: '' }] }; });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                       // allow re-picking the same file
    if (!file) return;
    setUploadErr('');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setF((prev) => ({ ...prev, thumbnail: dataUrl }));   // instant local preview
      setUploading(true);
      uploadCustomItemImage(dataUrl, file.name || 'custom-item.png')
        .then((url) => setF((prev) => ({ ...prev, thumbnail: url })))
        .catch((err) => { setUploadErr((err && err.message) || 'upload failed'); })
        .finally(() => setUploading(false));
    };
    reader.onerror = () => setUploadErr('could not read file');
    reader.readAsDataURL(file);
  };
  // A pasted external link → download + re-host on S3 (so it persists and loads
  // in the cart). Runs on blur of the URL field for instant feedback.
  const ingestUrl = (url) => {
    if (!needsIngest(url)) return;
    setUploadErr('');
    setUploading(true);
    ingestImageUrl(url)
      .then((s3) => setF((prev) => (prev.thumbnail === url ? { ...prev, thumbnail: s3 } : prev)))
      .catch((err) => setUploadErr((err && err.message) || 'couldn’t fetch that link'))
      .finally(() => setUploading(false));
  };
  const canSave = !!f.name.trim() && !saving && !uploading;
  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let rec = f;
      // Safety net: if a link is still un-hosted at save time, ingest it first.
      if (needsIngest(f.thumbnail)) {
        const s3 = await ingestImageUrl(f.thumbnail);
        rec = { ...f, thumbnail: s3 };
        setF(rec);
      }
      await onSave(rec);
    } catch (e) { setUploadErr((e && e.message) || 'couldn’t save'); setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14 }}
      style={{ position: 'absolute', inset: 0, zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.32)', padding: 18 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <motion.div initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} transition={{ duration: .18, ease: [0.32, 0.72, 0, 1] }}
        style={{ width: 440, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-inverse-strong)', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I.sparkle size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{isEdit ? 'Edit custom item' : 'New custom item'}</div>
          <IconBtn size="sm" icon={<I.close />} onClick={onCancel} />
        </div>
        <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CIField label="Brand / Product" full><Input size="sm" value={f.name} onChange={set('name')} placeholder="e.g. GB44 | Golf Ball Mint Container" /></CIField>
          <CIField label="ItemID"><Input size="sm" value={f.itemID} onChange={set('itemID')} placeholder="00000" /></CIField>
          <CIField label="Extra Details"><Input size="sm" value={f.extraDetails} onChange={set('extraDetails')} placeholder="" /></CIField>
          <CIField label="Cost / unit"><Input size="sm" type="number" value={f.cost} onChange={set('cost')} leading={<span style={{ fontSize: 12 }}>$</span>} placeholder="0.00" /></CIField>
          <CIField label="Setup"><Input size="sm" type="number" value={f.setup} onChange={set('setup')} leading={<span style={{ fontSize: 12 }}>$</span>} placeholder="0.00" /></CIField>
          <CIField label="Weight"><Input size="sm" type="number" value={f.weight} onChange={set('weight')} placeholder="0" /></CIField>
          <CIField label="Thumbnail Image" full>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-subtle)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {f.thumbnail
                  ? <img src={f.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <I.sparkle size={18} style={{ color: 'var(--gb-text-ghost)' }} />}
                {uploading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.35)' }}><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'gb-spin .7s linear infinite' }} /></div>}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Input size="sm" value={f.thumbnail.startsWith('data:') ? '' : f.thumbnail} onChange={set('thumbnail')} onBlur={() => ingestUrl(f.thumbnail)} placeholder="Paste a link (auto-uploads) or upload a file" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Btn variant="secondary" size="sm" icon={<I.plus />} state={uploading ? 'loading' : 'idle'} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? 'Uploading…' : 'Upload image'}</Btn>
                  {uploadErr && <span style={{ fontSize: 10.5, color: 'var(--gb-danger, #e5484d)', fontWeight: 600 }}>{uploadErr}</span>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
              </div>
            </div>
          </CIField>
          {/* Style options — selectable choices; the rep picks one when adding. */}
          <CIField label="Style options" full>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {f.styleOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Input size="sm" value={opt} onChange={(v) => setStyleAt(i, v)} placeholder={i === 0 ? 'e.g. White' : 'Another option'} style={{ flex: 1 }} />
                  <IconBtn size="sm" variant="ghost" icon={<I.close size={13} />} title="Remove option" onClick={() => removeStyle(i)} />
                </div>
              ))}
              <button type="button" onClick={addStyle} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-brand-label)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', padding: '2px 0' }}><I.plus size={12} /> Add style option</button>
            </div>
          </CIField>
          {/* Price ladder — qty tier → unit price. First tier sets the min qty. */}
          <CIField label="Price ladder" full>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, fontSize: 8.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', paddingLeft: 2 }}>
                <span style={{ flex: 1 }}>Qty (min)</span><span style={{ flex: 1 }}>Unit price</span><span style={{ width: 28 }} />
              </div>
              {f.breaks.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Input size="sm" type="number" value={b.q} onChange={(v) => setBreakAt(i, 'q', v)} placeholder="1" style={{ flex: 1 }} />
                  <Input size="sm" type="number" value={b.p} onChange={(v) => setBreakAt(i, 'p', v)} leading={<span style={{ fontSize: 12 }}>$</span>} placeholder="0.00" style={{ flex: 1 }} />
                  <IconBtn size="sm" variant="ghost" icon={<I.close size={13} />} title="Remove tier" onClick={() => removeBreak(i)} />
                </div>
              ))}
              <button type="button" onClick={addBreak} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-brand-label)', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', padding: '2px 0' }}><I.plus size={12} /> Add tier</button>
            </div>
          </CIField>
          <CIField label="Description" full><Input size="sm" value={f.description} onChange={set('description')} placeholder="Optional" /></CIField>
          <div style={{ gridColumn: '1 / -1', paddingTop: 2 }}>
            <Checkbox checked={f.dropship} onChange={(v) => setF((prev) => ({ ...prev, dropship: typeof v === 'boolean' ? v : !prev.dropship }))} label="Dropship" />
          </div>
        </div>
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-inverse-strong)', flexShrink: 0 }}>
          {/* Delete lives here now (moved off the card) — edit an item to remove it. */}
          {isEdit && onDelete && <IconBtn size="md" variant="ghost" danger title="Delete this custom item" icon={<I.trash />} onClick={() => { Promise.resolve(onDelete(initial.id)).then(() => onCancel()); }} />}
          <Btn variant="ghost" size="md" style={{ flex: 1 }} onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" size="md" icon={<I.check />} style={{ flex: 1.4 }} state={saving ? 'loading' : 'idle'} disabled={!canSave} onClick={submit}>{isEdit ? 'Save changes' : 'Save custom item'}</Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function GiftCatalog({ onClose, density = 'comfortable', showRating = true, priceFocus = 'retail', pageContext = {} }) {
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
  // Whether the active department scope came from a "/category" command rather
  // than a sidebar click. A plain-text search spans the WHOLE catalog and ignores
  // a sidebar-selected department, but still respects a /category scope.
  const [selFromCmd, setSelFromCmd] = useState(false);
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
  // The working proposal persists across closes/sessions: hydrate from storage on
  // mount, then mirror every change back. `propHydrated` gates the save so the
  // initial empty state can't clobber a stored draft before the load resolves.
  const propHydrated = useRef(false);
  useEffect(() => {
    let alive = true;
    loadCurrentProposal().then((saved) => {
      if (alive && Array.isArray(saved) && saved.length) setProposal(saved);
      propHydrated.current = true;
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!propHydrated.current) return;
    saveCurrentProposal(proposal);
  }, [proposal]);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [detail, setDetail] = useState(null);   // proposal-breakdown drill-in: { kind:'saved'|'current', item? }
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
  const [view, setView] = useState('catalog');        // 'catalog' | 'proposals' | 'custom'
  useEffect(() => { if (view !== 'proposals') setDetail(null); }, [view]);  // close breakdown on view change
  const [savedProposals, setSavedProposals] = useState([]);
  const [loadedId, setLoadedId] = useState(null);
  // Custom items (SERVICEITEM) — rep-defined products in chrome.storage; editingCustom
  // holds the record being created/edited in the form ({} = new, null = closed).
  const [customItems, setCustomItems] = useState([]);
  const [editingCustom, setEditingCustom] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSavedProposals().then((l) => { if (alive) setSavedProposals(l); });
    loadCustomItems().then((l) => { if (alive) setCustomItems(l); });
    primeCostCache().catch(() => {});      // hydrate per-SKU inventory costs for margin math
    const onCh = (changes) => {
      if (changes && changes.gbSavedProposals) setSavedProposals(changes.gbSavedProposals.newValue || []);
      if (changes && changes.gbCustomItems) setCustomItems(changes.gbCustomItems.newValue || []);
    };
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

  // Save-to-account (publish) — push the current proposal to a CRM opportunity.
  // Resolves so the panel can drive its success flash; surfaces failures as a
  // toast (errors-only). `accountSaveSeq` bumps to tell ProposalPanel to open its
  // account form (used by the draft "Save to account" shortcut).
  const [accountSaveSeq, setAccountSaveSeq] = useState(0);
  const saveToAccount = (opts) => {
    if (!proposal.length) return Promise.reject(new Error('Proposal is empty'));
    return saveProposalToOpportunity(proposal, opts)
      .then((r) => {
        toast?.success?.(`Saved “${opts.name}” to opportunity ${opts.opportunityID}`);
        return r;
      })
      .catch((e) => { toast?.error?.('Couldn’t save to account — ' + ((e && e.message) || 'unknown error')); throw e; });
  };
  // Draft → account: load the draft into the proposal, open it, and pop the
  // account form so the rep can edit then publish.
  const loadSavedToAccount = (entry) => { loadSaved(entry); setAccountSaveSeq((n) => n + 1); };
  // New-opportunity (future) — the "+" beside the opportunity dropdown. Fields TBD;
  // stub for now so the button is in place to wire once the create form is defined.
  const addOpportunity = (accountId) => { /* TODO: open new-opportunity form (fields pending) */ };

  // ── Custom items ──────────────────────────────────────────────────────────
  // Save (create/edit) → storage; the onChanged listener refreshes the grid.
  const saveCustom = (rec) => saveCustomItem(rec)
    .then((r) => { setCustomItems(r.list); setEditingCustom(null); toast?.success?.(`Saved “${r.entry.name || 'custom item'}”`); })
    .catch((e) => { toast?.error?.('Couldn’t save custom item — ' + ((e && e.message) || 'unknown error')); throw e; });
  const deleteCustom = (id) => removeCustomItem(id).then((next) => setCustomItems(next));
  // Add a custom item to the live proposal (as a synthetic product) + open it.
  const addCustomToProposal = (ci) => { addToProposal(customItemToProduct(ci)); setProposalOpen(true); };
  // Bulk-delete custom items by id (select mode).
  const deleteCustomMany = (ids) => removeCustomItems(ids).then((next) => setCustomItems(next));

  // Generate proposal HTML — maps proposal lines → the email composer's source
  // (one row per split) and opens the HTML modal (which hides the catalog).
  const [emailSource, setEmailSource] = useState(null);
  // Describe a line's imprint(s) for the email "Imprint preview" card — type
  // label, color (name + swatch), and a short per-pole detail line. Dual-pole
  // lines describe BOTH poles (Front: … / Back: …) and surface text/monogram on
  // the opposite pole; logo file names are truncated so a line never wraps.
  const _imprintLabel = (c) => !c ? '' : (c.kind === 'monogram' ? 'Monogram' : c.kind === 'text' ? 'Personalized' : 'Custom Logo');
  const _truncName = (s, n = 26) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; };
  const _chipDesc = (c) => {
    if (!c) return '';
    if (c.kind === 'text') { const t = (c.lines || []).map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(' / '); return t ? `“${t}”` : 'Personalized text'; }
    if (c.kind === 'monogram') { return c.text ? `Monogram “${String(c.text).toUpperCase()}”` : 'Monogram'; }
    return _truncName(c.fileName || (c.icon ? ('Icon · ' + c.icon) : 'Custom logo'));
  };
  const lineImprint = (deco) => {
    if (!deco || !deco.engine || deco.engine === 'none') return null;
    const chips = decoImprints(deco);
    if (!chips.length) return null;
    const front = chips.find((c) => c.slot === 'front') || chips[0];
    const second = chips.find((c) => c.slot === 'second') || null;
    const frontLabel = _imprintLabel(front);
    let typeLabel = frontLabel, detailLines;
    if (second) {
      const secondLabel = _imprintLabel(second);
      typeLabel = frontLabel === secondLabel ? frontLabel : `${frontLabel} + ${secondLabel}`;
      detailLines = [`Front: ${_chipDesc(front)}`, `Back: ${_chipDesc(second)}`];
    } else {
      detailLines = [_chipDesc(front)];
    }
    // Color swatch only for single-color imprints (text / monogram) on the front.
    const colorHex = (front.kind === 'text' || front.kind === 'monogram') ? (front.color || '') : '';
    const color = colorHex ? (colorNameOf(colorHex) || '') : '';
    // First text line (front) drives the synthetic-chip label fallback.
    const text = front.kind === 'text' ? ((front.lines || []).filter(Boolean).join(' / ') || null)
      : front.kind === 'monogram' ? (front.text || null) : null;
    // `frontLabel` = the front imprint's type alone (templates that show only the
    // first personalization, e.g. Quote, use this instead of the combined label).
    return { type: deco.engine, typeLabel, frontLabel, color, colorHex: colorHex || null, detailLines, text };
  };
  const proposalToEmailSource = (lines, name) => {
    const rows = []; let total = 0;
    for (const l of (lines || [])) {
      const p = l.product || {};
      const gs = l.decoration && l.decoration.giftSet;
      // A gift-set line is identified by the SET (name + size + the ball it wraps)
      // and shows the boxed gift-set render — not the bare ball.
      const title = gs ? (gs.name || 'Gift set') : (p.title || '');
      const subtitle = gs ? [giftSetSizeLabel(gs), p.title].filter(Boolean).join(' · ') : ((l.variant && l.variant.values && l.variant.values.style) || '');
      const img = (gs ? lineGiftImg(l) : null) || p.img || '';
      const imprint = lineImprint(l.decoration);
      for (const s of (l.splits || [])) {
        const qty = s.qty || 0, unitPrice = s.price || 0, lineTotal = Math.round(qty * unitPrice * 100) / 100;
        total += lineTotal;
        // `lineId` lets the email composer attach 3D snapshot previews back to the
        // right rows (one line can span multiple split rows). `imprint` drives the
        // preview card's spec line.
        rows.push({ lineId: l.id, brand: (p.brand && p.brand !== 'Custom') ? p.brand : '', title, subtitle, img, qty, unitPrice, lineTotal, imprint });
      }
    }
    // `rawLines` carries the product + decoration so the composer can render the
    // personalization snapshots; `lines` stays the flat display rows.
    return { groupName: 'Your Custom Order', optionName: name || 'Option 1', lines: rows, rawLines: lines || [], total: Math.round(total * 100) / 100 };
  };
  const openProposalEmail = (lines, name) => { if (lines && lines.length) setEmailSource(proposalToEmailSource(lines, name)); };

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

  // ── Bulk cost sync ────────────────────────────────────────────────────────
  // Pulls per-unit cost (from the gbcadmin Inventory endpoint) for every catalog
  // SKU into a persistent map so the margin breakdown uses real cost instead of
  // the 40% placeholder. One command, runs in the page (golfballs.com) context
  // so the gbcadmin session cookie flows. Progress + cancel; skips already-known
  // SKUs (cost doesn't change), so re-running only fills gaps.
  const [costSync, setCostSync] = useState(null);   // { done, total, found } while running
  const costAbortRef = useRef(null);
  const syncCosts = async () => {
    if (costSync) { try { costAbortRef.current && costAbortRef.current.abort(); } catch {} return; }
    // Unique inventory SKUs across the loaded catalog (parentCode is the base
    // product code the endpoint keys on; fall back to sku).
    const skus = Array.from(new Set(catalog.map((p) => p.parentCode || p.sku).filter(Boolean)));
    if (!skus.length) { toast && toast.error && toast.error('No catalog SKUs to sync yet — let the index load first.'); return; }
    const ctrl = new AbortController();
    costAbortRef.current = ctrl;
    setCostSync({ done: 0, total: skus.length, found: 0 });
    try {
      await importCosts(skus, {
        signal: ctrl.signal,
        onProgress: (p) => { if (aliveRef.current) setCostSync(p); },
      });
      if (aliveRef.current) {
        await primeCostCache();
        setProposal((pr) => pr.slice());   // re-render margins with the fresh costs
      }
    } catch (e) {
      // Errors only (auth / embedding failures) — success stays silent; the
      // button's progress already conveys completion.
      if (aliveRef.current) toast && toast.error && toast.error('Cost sync failed: ' + (e.message || e));
    } finally {
      if (aliveRef.current) setCostSync(null);
      costAbortRef.current = null;
    }
  };
  const costPct = costSync && costSync.total ? Math.round((costSync.done / costSync.total) * 100) : 0;

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
    if (c.type === 'cat') { setSel(c.id); setSelFromCmd(true); }
    else if (c.type === 'brand') toggleBrand(c.id);
    else if (c.type === 'special') setSpecial((cur) => (cur === c.id ? null : c.id));
    setQuery('');
  };
  const filtersActive = sel !== 'all' || selBrands.size > 0 || !!special || !!query;
  const clearAll = () => { setSel('all'); setSelFromCmd(false); setSelBrands(new Set()); setSpecial(null); setQuery(''); };

  // A plain-text search spans every item in the catalog UNLESS the scope was set
  // by a /category command — sidebar department selection is for browsing only.
  const searchingAll = !!(query.trim() && !query.startsWith('/') && !selFromCmd);
  const results = useMemo(() => {
    let r = searchingAll ? catalog : inCat;
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
  }, [inCat, catalog, searchingAll, selBrands, query, sort, special]);

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
    <>
    {/* Proposal-HTML composer — animates in over the catalog (opaque backdrop
        hides it), animates out on close. */}
    <AnimatePresence>
      {emailSource && <ProposalEmailModal key="email" source={emailSource} scale={scale} onClose={() => setEmailSource(null)} />}
    </AnimatePresence>
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
          <IconBtn
            size="md"
            title={costSync ? `Syncing costs — ${costSync.done}/${costSync.total} (click to cancel)` : 'Sync costs for margin (from gbcadmin)'}
            icon={costSync
              ? <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15 }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} />
                  <span style={{ position: 'absolute', fontSize: 7, fontWeight: 700, color: 'var(--gb-text-muted)' }}>{costPct}</span>
                </span>
              : <I.calc />}
            onClick={syncCosts} />
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
          <CategoryRail sel={sel} onSelect={(s) => { setView('catalog'); setSelFromCmd(false); setSel((cur) => (cur === s ? 'all' : s)); }} total={catalog.length}
            depts={depts} deptCounts={deptCounts}
            view={view} onSetView={setView} savedCount={savedProposals.length} customCount={customItems.length}
            dock={proposal.length > 0 && !proposalOpen ? <ProposalDock key="dock" count={proposal.length} total={propTotal} active={proposalOpen} onOpen={() => setProposalOpen(true)} /> : null} />
          <AnimatePresence mode="wait" initial={false}>
          {view === 'proposals' ? (
            <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <SavedGallery items={savedProposals} loadedId={loadedId}
              current={proposal} onOpen={(item) => setDetail({ kind: 'saved', item })} onOpenCurrent={() => setDetail({ kind: 'current' })}
              onLoad={loadSaved} onCopy={copySaved} onDelete={deleteSaved} onSaveToAccount={loadSavedToAccount}
              onEmail={(entry) => openProposalEmail(linesFromSaved(entry, rid), entry.name)} />
          </motion.div>
          ) : view === 'custom' ? (
            <motion.div key="custom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            <CustomItemsGallery items={customItems} compact={compact} colMin={colMin} search={query}
              inProposal={inProposal} onAdd={addCustomToProposal} onReload={() => loadCustomItems().then(setCustomItems)}
              onNew={() => setEditingCustom({})} onOpen={(ci) => setSelected(customItemToProduct(ci))} onDelete={deleteCustom} onDeleteMany={deleteCustomMany} />
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

          {/* Proposal breakdown drill-in — margin + order items. Overlays the
              gallery when a saved card or the current-proposal card is clicked. */}
          <AnimatePresence>
            {view === 'proposals' && detail && (() => {
              const close = () => setDetail(null);
              if (detail.kind === 'current') {
                return (
                  <SavedDetail key="bd-current" current title="Current proposal" subtitle="Live working set · unsaved"
                    badge={<Tag tone="brand" size="sm" icon={<Dot tone="brand" size={5} />}>Unsaved</Tag>}
                    entries={proposal} onClose={close}
                    buildEmailSource={() => proposalToEmailSource(proposal, '')}
                    onOpenProposal={() => { close(); setProposalOpen(true); }} />
                );
              }
              const it = detail.item; const r = resolveSavedEntry(it);
              return (
                <SavedDetail key={'bd-' + it.id} title={it.name} subtitle={`${fmtSavedDate(it.date)} · ${r.units} units`}
                  badge={<Tag tone="neutral" size="sm" icon={<I.bookmark size={9} />}>Draft</Tag>}
                  entries={r.entries} loaded={loadedId === it.id} onClose={close}
                  buildEmailSource={() => proposalToEmailSource(linesFromSaved(it, rid), it.name)}
                  onCopy={() => copySaved(it)} onSaveToAccount={() => { close(); loadSavedToAccount(it); }}
                  onLoad={() => { close(); loadSaved(it); }} />
              );
            })()}
          </AnimatePresence>

          {/* Item details stay an overlay INSIDE the catalog card, so they
              coexist with the proposal side card (both visible at once). */}
          <AnimatePresence>
            {selected && view !== 'proposals' && (
              <DetailPanel key="detail" p={selected} inProposal={inProposal(selected.id)} onAdd={addToProposal}
                onOpenProposal={() => { setSelected(null); setProposalOpen(true); }} onClose={() => setSelected(null)}
                onEdit={(ci) => { setSelected(null); setEditingCustom(ci); }} />
            )}
          </AnimatePresence>

          {/* Custom-item create/edit form — overlays the body. */}
          <AnimatePresence>
            {editingCustom && (
              <CustomItemForm key="custom-form" initial={editingCustom}
                onCancel={() => setEditingCustom(null)} onSave={saveCustom} onDelete={deleteCustom} />
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <Layers size={13} style={{ color: 'var(--gb-text-muted)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', fontWeight: 500 }}>
            Showing <b style={{ color: 'var(--gb-text-primary)' }}>{nfmt(results.length)}</b> of {nfmt(catalog.length)}
            {!searchingAll && selLabel && <> in <b style={{ color: 'var(--gb-text-secondary)' }}>{selLabel}</b></>}
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
              pageContext={pageContext} onSaveToAccount={saveToAccount} onAddOpportunity={addOpportunity} accountSaveSeq={accountSaveSeq}
              onEmail={() => openProposalEmail(proposal, '')}
              onClear={() => { setProposal([]); setProposalOpen(false); }} />
          </div>
        </div>
        </div>{/* /flex row */}
      </div>
      </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
