import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Btn, IconBtn, Tag, Dot, Input, Dropdown } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { loadCatalog, clearCatalogCache, readCatalogCache, GIFT_CATALOG_SEED, CATEGORY_ORDER, DEPT_ORDER, BRAND_ORDER } from '../lib/giftCatalog.js';
import { loadDevSettings, useDevSetting, STORAGE_KEY as DEV_STORAGE_KEY } from '../lib/devSettings.js';
import { loadScales } from '../lib/scales.js';
import { CustomizeBlock, ProductOptions, colorNameOf, ImageAlignModal } from './giftCustomize.jsx';
import { buildProposalDraft, copyToClipboard, loadSavedProposals, saveProposalDraft, removeSavedProposal, updateSavedProposal, linesFromSaved, fetchRawProduct, saveProposalToOpportunity, fetchOpportunitiesForAccount, loadCurrentProposal, saveCurrentProposal, validatePromo, fetchActiveProposalEntries, proposalCartUrl, loadKnownPromos, addKnownPromo, submitProposalEmail, createProposalStore, importProposalStore, buildProposalStoreFile, importProposalStoreFile } from '../lib/saveProposal.js';
import { promoDiscount, freeLinesFromPromo } from '../lib/cartSerializer.js';
import { usd, onSale, hasPromo, isDeal, money, rid, nfmt, relTime, priceAtQty, isTierPrice, SECOND_POLE_FEE, lineHasImprint, lineSecondPoleFee, linePriceAt, lineIsTierPrice, priceAtBreaks, topPrice, lowPrice, saleCut, netP, netTop, netLow } from '../lib/giftCatalogMath.js';
import { loadCustomItems, saveCustomItem, removeCustomItem, removeCustomItems, customItemToProduct, uploadCustomItemImage, ingestImageUrl, needsIngest, costAtQty, repoOf, REPOS, createProductStore, importProductStore, buildProductStoreFile, importProductStoreFile } from '../lib/customItems.js';
import { CATALOG_FAVORITES_STORAGE_KEY, loadCatalogFavorites, setCatalogFavorite } from '../lib/catalogFavorites.js';
// The built-in supplier ingesters are admin-only and loaded lazily (see REPO_RUN
// below) so the served build never bundles them.
import { getInventory, peekInventory, cachedCostForSku, primeCostCache, importCosts } from '../lib/inventory.js';
import { bundleSingle, setBundleCatalog } from '../lib/bundleCost.js';
import { ProposalEmailModal, ProposalEmailComposer } from './ProposalEmail.jsx';
import { CheckoutComposer } from './ProposalCheckout.jsx';
import { Checkbox } from '../ui/components/Checkbox.jsx';
import { ballish, supportsLogo, decoImprints, canApplyImprint, mergeImprint } from '../lib/giftImprints.js';
import { decoratedPricingForLine, giftSetPreviewUrl } from '../lib/cartSerializer.js';
import { giftSetLadder, giftSetSizeLabel } from '../lib/giftSets.js';
import {
  CATALOG_ACCOUNT_CONTEXT_NOTICE,
  CATALOG_CARD_HEIGHT,
  CATALOG_CARD_WIDTH,
  CATALOG_PROPOSAL_WIDTH,
  catalogDealBadge,
  catalogSidebarLabel,
  fitCatalogScale,
  normalizeCatalogScale,
  CATALOG_SCALE_DEFAULT,
  computeMasonry,
  catalogRowHeight,
  CARD_METRICS,
} from '../lib/catalogPresentation.js';

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

/* Pure pricing/format helpers (usd, money, priceAtQty, linePriceAt, priceAtBreaks,
   topPrice/netTop, …) now live in ../lib/giftCatalogMath.js — imported above. */

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


/* "/" quick-filters beyond category + brand. */
const SPECIAL_CMDS = [
  { type: 'special', id: 'sale', label: 'On sale / promo', match: (p) => isDeal(p) },
  // Commissionable = custom-logo products (the ones that carry the commission
  // badge). Replaces the old Custom Logo rail group as the way to scope to them.
  { type: 'special', id: 'commission', label: 'Commissionable only', match: (p) => !!p.customLogo },
];

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
      border: '1px solid var(--gb-success-fg)',
      color: 'var(--gb-success-fg)',
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

function ProductCard({ p, compact, showRating, active, inProposal, favorite = false, onToggleFavorite, onAdd, onClick }) {
  const [hover, setHover] = useState(false);
  const dealBadge = catalogDealBadge(p);
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
        {dealBadge && (
          <span title={dealBadge.label} style={{ position: 'absolute', top: 7, left: 7, zIndex: 2, display: 'inline-flex', alignItems: 'center', minHeight: 22, maxWidth: onToggleFavorite ? 'calc(100% - 48px)' : 'calc(100% - 14px)', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: dealBadge.kind === 'promo' ? .3 : .5, textTransform: 'uppercase', color: '#fff', background: dealBadge.kind === 'promo' ? 'var(--gb-success-solid, #2e9e5b)' : 'var(--gb-error-fg, var(--gb-error))', boxShadow: '0 1px 3px rgba(0,0,0,.14)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {dealBadge.label}
          </span>
        )}
        {onToggleFavorite && (
          <button type="button" title={favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={favorite ? `Remove ${p.title} from favorites` : `Add ${p.title} to favorites`}
            aria-pressed={favorite}
            onClick={(event) => { event.stopPropagation(); onToggleFavorite(p); }}
            style={{ position: 'absolute', top: 7, right: 7, zIndex: 3, width: 22, height: 22, borderRadius: '50%', padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: favorite ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
              background: 'color-mix(in srgb, var(--gb-surface-modal) 88%, transparent)',
              border: '1px solid var(--gb-border-default)',
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              transition: 'color var(--gb-anim), background-color var(--gb-anim), border-color var(--gb-anim)' }}>
            <Icon size={11.5} fill={favorite ? 'currentColor' : 'none'} strokeWidth={2}><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.05 1.1-6.47-4.7-4.58 6.5-.95z"/></Icon>
          </button>
        )}
        {p.customLogo && <CommissionDollar size={compact ? 14 : 16} />}
      </div>
      <div style={{ paddingTop: compact ? 8 : 10, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 5, flex: 1 }}>
        {/* Fixed integer height, like the title box: the brand/rating row's
            natural height comes from font metrics (9.5px text vs a 10px Rating)
            which differ per platform/DPI, and any fraction here mis-rounds under
            the mount's `zoom`. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: compact ? CARD_METRICS.compact.brand : CARD_METRICS.normal.brand, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brand}</span>
            {p.repoTag && (
              <span style={{ flexShrink: 0, padding: '0 4px', borderRadius: 3, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', fontSize: 7.5, fontWeight: 800, letterSpacing: .3, textTransform: 'uppercase', color: 'var(--gb-text-tertiary)' }}>{p.repoTag}</span>
            )}
          </span>
          {showRating && p.rating && <Rating value={p.rating} count={p.reviews} size={10} />}
        </div>
        {/* Fixed 2-line INTEGER-px title box in BOTH modes. An `em` min-height
            (and letting compact titles size to 1–2 lines) gave cards fractional
            and uneven heights; under the catalog's magnifying `transform: scale`
            those fractional row heights accumulate and the next row creeps up
            into this one. A fixed integer height makes every card — and every
            grid row — identical, so rows can't overlap. */}
        <div style={{ fontSize: compact ? 12 : 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.32, letterSpacing: -.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: compact ? 32 : 34, flexShrink: 0 }}>{p.title}</div>
        {p.sku && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, height: compact ? CARD_METRICS.compact.sku : CARD_METRICS.normal.sku, flexShrink: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', flexShrink: 0 }}>SKU</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              {/* Any logo-capable product headlines the custom-logo "from"
                  (first-ladder) imprint price by default; everything else headlines
                  retail. The PROPOSAL re-prices each line accurately (retail when no
                  imprint, ladder + 2nd-pole when added). netTop falls back to retail
                  when a product has no custom-logo ladder, so this is safe. */}
              <span style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.5, fontFamily: 'var(--gb-font-mono)' }}>{usd(supportsLogo(p) ? netTop(p) : p.price)}</span>
              {onSale(p) && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: 'var(--gb-font-mono)' }}>{usd(supportsLogo(p) ? topPrice(p) : p.orig)}</span>}
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
  // Show last-known inventory instantly on open (cache-first), then auto-fetch
  // when there's no cache yet — no manual "Check inventory" press needed. The
  // refresh button re-pulls; a never-reachable SKU surfaces an error+retry.
  useEffect(() => {
    let alive = true;
    setState('loading'); setData(null); setErr('');
    peekInventory(sku).then((d) => {
      if (!alive) return;
      if (d) { setData(d); setState('done'); }       // cached → show instantly
      else load(false);                               // first time → fetch automatically
    });
    return () => { alive = false; };
  }, [sku]);
  const COLS = [['available', 'Avail'], ['onHand', 'OnHand'], ['alloc', 'Alloc'], ['onOrder', 'OnOrdr']];
  const numCell = (v, k) => <td key={k} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>{(v || 0).toLocaleString('en-US')}</td>;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Layers size={12} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-secondary)' }}>Inventory</span>
        {data && data.stale && state === 'done' && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gb-text-ghost)', letterSpacing: .3 }}>· cached</span>}
        <div style={{ flex: 1 }} />
        {(state === 'done' || state === 'error') && <button type="button" onClick={() => load(true)} title="Refresh inventory" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}><I.refresh size={12} /></button>}
      </div>
      {state === 'idle' && <Btn variant="secondary" size="sm" icon={<Layers size={13} />} onClick={() => load(false)}>Check inventory</Btn>}
      {state === 'loading' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 11.5, padding: '6px 0' }}><span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} /> Loading inventory…</div>}
      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-error-tint-soft)', border: '1px solid var(--gb-error-tint-border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: 'var(--gb-text-secondary)', fontWeight: 500, lineHeight: 1.4 }}>
            <I.alert size={13} style={{ color: 'var(--gb-error-fg, var(--gb-error))', flexShrink: 0, marginTop: 1 }} />
            <span>{err}</span>
          </div>
          <Btn variant="secondary" size="sm" icon={<I.refresh size={13} />} onClick={() => load(true)} style={{ alignSelf: 'flex-start' }}>Retry</Btn>
        </div>
      )}
      {state === 'done' && data && (data.notFound ? (
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>No Dynamics inventory record for this SKU.</div>
      ) : data.rows.length ? (
        <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: 'var(--gb-fill-inverse-strong)' }}>
                {COLS.map(([, h]) => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 8.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                // Zebra striping — every other row gets a faint fill so the
                // variant rows read as distinct lines instead of one grey block.
                <tr key={i} title={[r.itemNumber, r.description].filter(Boolean).join(' — ')}
                  style={{ background: i % 2 === 1 ? 'var(--gb-fill-faint)' : 'transparent' }}>
                  {COLS.map(([k]) => numCell(r[k], k))}
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
            {onSale(p) && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 'var(--gb-r-pill)', fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-error-fg, var(--gb-error))' }}>Sale −{usd(p.orig - p.price)}</span>}
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
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
              <TagI size={14} style={{ color: 'var(--gb-success-fg)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500 }}>
                <b style={{ color: 'var(--gb-success-fg)' }}>{p.promo.label}</b> · code <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{p.promo.code}</span>
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
          {/* Synced per-unit cost (from the gbcadmin inventory sync) shown the
              same way custom items show theirs — text under the pricing chart. */}
          {!p.isCustom && (() => { const c = cachedCostForSku(invSkuOf(p)); return c != null && c > 0 ? (
            <div style={{ marginTop: 16, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Cost <b style={{ color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)' }}>{usd(c)}</b>/unit · used for margin</div>
          ) : null; })()}
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
          {!p.isCustom && p.sku && <InventoryPanel sku={invSkuOf(p)} />}
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

function CategoryRail({ sel, onSelect, depts, deptCounts, total, favoriteCount, dock, view, onSetView, savedCount, customCount, currentCount }) {
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', padding: '5px 12px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '0 10px 3px', flexShrink: 0 }}>Browse</div>
      {/* Capped, scrollable list with a soft fade at the top/bottom edges. */}
      <div className="gb-gc-norail" style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 8px, #000 calc(100% - 14px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 8px, #000 calc(100% - 14px), transparent 100%)' }}>
        {/* No "All Items" row — the catalog defaults to the full golfballs.com
            set, and a plain search spans everything. Pick a department to browse
            one (click it again to clear); /category scopes a search. ── */}
        {/* ── Departments — custom-logo items are folded into their depts; use
            the /Commissionable filter to scope to commissionable products. ── */}
        {depts.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '2px 11px 4px', flexShrink: 0 }}>Departments</div>
            {depts.map((d) => (
              <CatRow key={'dept:' + d} glyph={d} label={catalogSidebarLabel(d)} count={deptCounts[d] || 0}
                active={view === 'catalog' && sel === 'dept:' + d} onClick={() => onSelect('dept:' + d)} />
            ))}
          </>
        )}

        {/* Custom items — rep-defined products. Rendered inline right after the
            departments (no divider) so it reads as just another category. */}
        <SavedNavRow label="Custom Items" icon={<I.sparkle size={14} />} count={customCount}
          active={view === 'custom'} onClick={() => onSetView('custom')} />

        {/* ── Saved — lives inside the scroll list, anchored to the categories
            so it never shifts when the proposal dock animates in/out below. ── */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '12px 11px 4px', flexShrink: 0 }}>Saved</div>
        <SavedNavRow label="Favorites" icon={<StarI size={13} />} count={favoriteCount || 0}
          active={view === 'catalog' && sel === 'favorites'} onClick={() => onSelect('favorites')} />
        <SavedNavRow label="Saved Proposals" icon={<I.bookmark size={14} />} count={savedCount}
          active={view === 'proposals'} onClick={() => onSetView('proposals')} />
        {/* Live proposals already attached to the account's opportunities (pulled
            from the CRM), distinct from local saved drafts. */}
        <SavedNavRow label="Current Proposals" icon={<I.card size={14} />} count={currentCount || 0}
          active={view === 'current'} onClick={() => onSetView('current')} />
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
                  background: second ? 'var(--gb-success-tint-soft)' : 'var(--gb-brand-tint-soft)',
                  border: '1px solid ' + (second ? 'var(--gb-success-tint-border)' : 'var(--gb-brand-tint-border)'),
                  color: second ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)',
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
  // srcIndex = position in the stored `entry.lines` (kept so a price edited in the
  // breakdown can be written back to the right line even though product-less
  // lines are filtered out here).
  const entries = [];
  (entry.lines || []).forEach((l, srcIndex) => {
    if (l && l.product) entries.push({ product: l.product, decoration: l.decoration, splits: l.splits || [], free: !!l.free, srcIndex });
  });
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
/* The SKU the Dynamics inventory endpoint keys on = the human parentSku
   (customData.parentSku, e.g. "B3273") — NOT parentCode_s, which is an internal
   product code ("P00G6B") the endpoint 404s on. Prefer sku, fall back to code. */
const invSkuOf = (p) => (p && (p.sku || p.parentCode)) || '';
/* The SKU whose synced cost actually prices this line. For a "Double Dozen"
   (and other ball multipacks) that's its single sibling's SKU — the bundle's
   own SKU carries no inventory cost (see bundleCost.js); everything else uses
   its own SKU. Drives both the proactive cost fetch and the "couldn't price"
   asterisk so both follow the SKU we really read the cost from. */
const costSkuOf = (p) => { const b = bundleSingle(p); return b ? b.sku : invSkuOf(p); };
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
    // Ball multipack → single dozen's cost × the pack count (a double dozen = 2×).
    const b = bundleSingle(p);
    if (b) { const c = cachedCostForSku(b.sku); if (c != null && c > 0) return Math.round(c * b.multiple * 100) / 100; }
    const c = cachedCostForSku(invSkuOf(p));
    if (c != null && c > 0) return Math.round(c * 100) / 100;
  }
  return Math.round((unitPrice || 0) * COST_RATIO * 100) / 100;
};
/* True when we have a real (synced / custom) cost for this product — i.e. the
   margin isn't the 40% placeholder. Drives the breakdown's "actual vs assumed". */
const hasRealCost = (product) => {
  const p = product || {};
  if (p.isCustom) {
    const cb = p.costBreaks || (p.custom && p.custom.costBreaks);
    if (cb && cb.length) return true;
    const c = p.cost != null ? p.cost : (p.custom && p.custom.cost);
    return c != null && c > 0;
  }
  const c = cachedCostForSku(costSkuOf(p));   // bundle → single's cost
  return c != null && c > 0;
};

/* Per-line + blended margin for resolved entries
   ([{ product, decoration, splits:[{qty,price}] }]). Setup/decoration fees fold
   in here later (they're already in each split's price for the cart). */
function marginReport(entries) {
  let rev = 0, cost = 0, units = 0, real = 0, paidCount = 0;
  const lines = (entries || []).map((e) => {
    const isFree = !!e.free;
    let lr = 0, lc = 0, u = 0;
    (e.splits || []).forEach((s) => { const q = s.qty || 0, p = s.price || 0; lr += q * p; if (!isFree) lc += q * unitCostOf(e.product, p, q); u += q; });
    units += u;
    // Free promotional giveaways don't count toward revenue, cost, or margin —
    // they're a promo, not a 0%-margin sale. They still show as a line.
    if (isFree) return { ...e, units: u, lineRev: 0, lineCost: 0, profit: 0, margin: null, free: true, costKnown: true };
    rev += lr; cost += lc; paidCount++;
    const known = hasRealCost(e.product);
    if (known) real++;
    return { ...e, units: u, lineRev: lr, lineCost: lc, profit: lr - lc, margin: lr ? (lr - lc) / lr : 0, costKnown: known };
  });
  // How the cost figure was sourced — over PAID lines only.
  const costBasis = paidCount === 0 ? 'assumed' : real === paidCount ? 'actual' : real === 0 ? 'assumed' : 'mixed';
  return { lines, units, count: lines.length, rev, cost, profit: rev - cost, margin: rev ? (rev - cost) / rev : 0, costBasis, realCount: real, paidCount };
}

const marginTone = (m) => (m >= 0.45 ? 'success' : m >= 0.32 ? 'warning' : 'error');
// Use the real design-system tokens (color-mix off the theme's status color) —
// NOT bare rgba, which renders muddy/dark on the dark themes.
const TONE_FG = { success: 'var(--gb-success-fg)', warning: 'var(--gb-warning-fg)', error: 'var(--gb-error-fg, var(--gb-error))' };
const TONE_BG = { success: 'var(--gb-success-tint-medium)', warning: 'var(--gb-warning-tint-medium)', error: 'var(--gb-error-tint-medium)' };
const TONE_BD = { success: 'var(--gb-success-tint-border)', warning: 'var(--gb-warning-tint-border)', error: 'var(--gb-error-tint-border)' };
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

/* Inline-editable unit price. Click the price → type → Enter/blur commits;
   Escape cancels. Renders as a quiet, dashed-underline value so it reads as
   editable without shouting. */
function EditablePrice({ value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const start = () => { setDraft(value != null ? String(value) : ''); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const n = parseFloat(String(draft).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0 && Math.abs(n - (value || 0)) > 0.005) onCommit(Math.round(n * 100) / 100);
  };
  if (editing) {
    return (
      <input
        autoFocus type="text" inputMode="decimal" value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } else if (ev.key === 'Escape') { ev.preventDefault(); setEditing(false); } }}
        onClick={(ev) => ev.stopPropagation()}
        style={{ width: 58, textAlign: 'right', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-primary)', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-brand-border)', borderRadius: 'var(--gb-r-sm)', padding: '1px 4px', outline: 'none', WebkitTapHighlightColor: 'transparent' }} />
    );
  }
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); start(); }} title="Edit price"
      style={{ border: 'none', background: 'transparent', cursor: 'text', font: 'inherit', fontFamily: 'var(--gb-font-mono)', color: 'inherit', padding: 0, outline: 'none', WebkitTapHighlightColor: 'transparent', borderBottom: '1px dashed var(--gb-border-strong, var(--gb-border-default))' }}>
      {usd(value)}
    </button>
  );
}

/* One product row in the line-items + margin table. When `onEditPrice` is
   provided, each split's unit price is inline-editable (writes back to the
   proposal). */
function MarginLineRow({ e, first, onEditPrice, estimated }) {
  const chips = decoImprints(e.decoration);
  const editable = typeof onEditPrice === 'function' && !e.free;   // free giveaway lines aren't editable
  const star = estimated ? <sup title="No cost on file — estimated" style={{ color: 'var(--gb-warning-fg, #b6830a)', fontWeight: 800, marginLeft: 1 }}>*</sup> : null;
  return (
    <div style={{ padding: '9px 12px', borderTop: first ? 'none' : '1px solid var(--gb-border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MiniThumb src={lineGiftImg(e) || e.product.img} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{e.product.brand}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lineGiftTitle(e) || e.product.title}</span>
            {e.free && <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-success-fg)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)', borderRadius: 'var(--gb-r-pill)', padding: '1px 6px' }}>Free</span>}
          </div>
        </div>
        <span style={{ width: 50, textAlign: 'right', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{e.units}</span>
        <span style={{ width: 80, textAlign: 'right', fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{money(e.lineRev)}</span>
        <span style={{ width: 74, textAlign: 'right', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{e.free ? '—' : money(e.lineCost)}{star}</span>
        <span style={{ width: 56, display: 'flex', justifyContent: 'flex-end' }}>{e.free
          ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: .3, textTransform: 'uppercase', color: 'var(--gb-success-fg)', fontFamily: 'var(--gb-font-mono)' }}>Promo</span>
          : <MarginBadge m={e.margin} />}</span>
      </div>
      {/* Per-split detail — always shown when editable (so every price can be
          edited) or when there are multiple splits / imprints. */}
      {(editable || e.splits.length > 1 || chips.length > 0) && (
        <div style={{ marginTop: 7, paddingLeft: 46, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(editable || e.splits.length > 1) && e.splits.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)' }}>
              <span>{s.qty} × </span>
              {editable
                ? <EditablePrice value={s.price} onCommit={(v) => onEditPrice(i, v)} />
                : <span>{usd(s.price)}</span>}
              {s.priceEdited && <span title="Price edited" style={{ color: 'var(--gb-brand-label)', marginLeft: 4, fontSize: 9 }}>✎</span>}
              <span style={{ color: 'var(--gb-text-ghost)', margin: '0 7px' }}>·</span>
              <span style={{ color: 'var(--gb-text-muted)' }}>cost {usd(unitCostOf(e.product, s.price, s.qty))}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{money((s.qty || 0) * (s.price || 0))}</span>
            </div>
          ))}
          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: (editable || e.splits.length > 1) ? 3 : 0 }}>
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
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: chip.slot === 'second' ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)', background: chip.slot === 'second' ? 'var(--gb-success-tint-soft)' : 'var(--gb-brand-tint-soft)', border: '1px solid ' + (chip.slot === 'second' ? 'var(--gb-success-tint-border)' : 'var(--gb-brand-tint-border)'), borderRadius: 'var(--gb-r-pill)', padding: '1px 6px' }}>{slotLabel} pole</span>
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
/* Promo-code block in the breakdown — apply/clear a coupon against the proposal.
   Applying validates live via the icustomize promotion engine (same call the cart
   page makes); the resolved promo is stored on the proposal + flows into the
   saved/loaded cart so the discount is real. */
function PromoBlock({ promo, onApply, onClear, onCheck }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');         // code currently being applied
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);      // browse-codes panel
  const [known, setKnown] = useState([]);
  const [checks, setChecks] = useState({});     // CODE -> { state:'checking'|'ok'|'no', disc, freeQty, desc }
  const applied = promo && promo.promotion;
  const disc = applied ? promoDiscount(promo.promotion) : 0;
  const freeQty = applied && promo.promotion.promoType === 'FREE_QUANTITY'
    ? (promo.promotion.freeItems || []).reduce((a, f) => a + (f.amount || 0), 0) : 0;
  const unmet = (applied && (promo.promotion.unmetRequirements || []).length) ? promo.promotion.unmetRequirements : null;

  // When the picker opens, load the rep's known codes and test each against the
  // current cart so we can show which actually apply (and their value).
  useEffect(() => {
    if (!open || !onCheck) return undefined;
    let alive = true;
    loadKnownPromos().then((list) => {
      if (!alive) return;
      setKnown(list);
      list.forEach((c) => {
        setChecks((s) => (s[c] && s[c].state !== 'no' ? s : { ...s, [c]: { state: 'checking' } }));
        onCheck(c)
          .then((pr) => {
            if (!alive) return;
            const ok = pr && pr.promo && !((pr.unmetRequirements || []).length);
            const entry = ok
              ? { state: 'ok', disc: promoDiscount(pr), freeQty: pr.promoType === 'FREE_QUANTITY' ? (pr.freeItems || []).reduce((a, f) => a + (f.amount || 0), 0) : 0, desc: pr.promoDescription }
              : { state: 'no' };
            setChecks((s) => ({ ...s, [c]: entry }));
          })
          .catch(() => { if (alive) setChecks((s) => ({ ...s, [c]: { state: 'no' } })); });
      });
    });
    return () => { alive = false; };
  }, [open, onCheck]);

  const apply = async (c) => {
    const v = (c || '').trim(); if (!v || busy) return;
    setBusy(v); setErr('');
    try { await onApply(v); setCode(''); setOpen(false); }
    catch (e) { setErr((e && e.message) || 'Invalid code'); }
    finally { setBusy(''); }
  };

  return (
    <div>
      <SectionTitle icon={<I.bolt />}>Promotion</SectionTitle>
      {applied ? (
        <div style={{ borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-brand-tint-border)', background: 'var(--gb-brand-tint-soft)', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 800, letterSpacing: .5, color: 'var(--gb-brand-label)', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-sm)', padding: '2px 8px' }}>{promo.code}</span>
            {disc > 0 && <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-success-fg)' }}>−{usd(disc)}</span>}
            {freeQty > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-success-fg)' }}>+{freeQty} dozen free</span>}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClear} title="Remove promo" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}><I.close size={13} /></button>
          </div>
          {promo.promotion.promoDescription && <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.4 }}>{promo.promotion.promoDescription}</div>}
          {unmet && <div style={{ fontSize: 10.5, color: 'var(--gb-warning-fg, #b6830a)', lineHeight: 1.4 }}>⚠ Requirements not yet met — the discount applies once the cart qualifies.</div>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 7 }}>
            <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter or pick a promo code"
                onKeyDown={(e) => { if (e.key === 'Enter') apply(code); }}
                style={{ flex: 1, height: 28, fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-primary)', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', padding: '0 32px 0 11px', outline: 'none', WebkitTapHighlightColor: 'transparent', width: '100%', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setOpen((o) => !o)} title="Browse codes that apply"
                style={{ position: 'absolute', right: 4, top: 0, bottom: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', padding: '0 5px', outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <I.chevd size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
            </div>
            <Btn variant="secondary" size="sm" icon={busy === code && code ? <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'gb-spin .7s linear infinite' }} /> : <I.check size={13} />} onClick={() => apply(code)}>Apply</Btn>
          </div>

          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .16 }} style={{ overflow: 'hidden' }}>
                {(() => {
                  // Only codes that apply to THIS cart (hide N/A); keep ones still
                  // checking so the list fills in rather than flashing empty.
                  const shown = known.filter((c) => { const st = checks[c]; return !st || st.state === 'checking' || st.state === 'ok'; });
                  const anyChecking = shown.some((c) => !checks[c] || checks[c].state === 'checking');
                  return (
                    <>
                      <div style={{ marginTop: 8, border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
                        {shown.length === 0 ? (
                          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', padding: '10px 12px' }}>{known.length ? 'No saved codes apply to this cart.' : 'No saved codes yet — type one above to apply & remember it.'}</div>
                        ) : shown.map((c, i) => {
                          const st = checks[c] || { state: 'checking' };
                          const ok = st.state === 'ok';
                          return (
                            <button key={c} type="button" disabled={!ok || !!busy} onClick={() => apply(c)}
                              style={{ width: '100%', textAlign: 'left', border: 'none', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none', background: 'transparent', cursor: ok ? 'pointer' : 'default', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9, outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                              <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, fontWeight: 800, letterSpacing: .4, color: ok ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{c}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {ok && st.desc && <div style={{ fontSize: 10, color: 'var(--gb-text-tertiary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.desc}</div>}
                              </div>
                              {ok ? <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-success-fg)', flexShrink: 0 }}>{st.disc > 0 ? '−' + usd(st.disc) : st.freeQty > 0 ? '+' + st.freeQty + ' dz' : 'Applies'}</span>
                                : <span style={{ width: 11, height: 11, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite', flexShrink: 0 }} />}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 5, lineHeight: 1.4 }}>{anyChecking ? 'Checking which codes apply…' : 'Showing only codes that apply to this proposal.'}</div>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {err && <div style={{ fontSize: 10.5, color: 'var(--gb-error-fg, var(--gb-error))', marginTop: 6, lineHeight: 1.4 }}>{err}</div>}
    </div>
  );
}

function SavedDetail({ title, subtitle, badge, entries, current, loaded, onClose, onLoad, onOpenProposal, onCopy, onSaveToAccount, buildEmailSource, buildCheckoutSource, onPatchSplit, promo, onApplyPromo, onClearPromo, onCheckPromo }) {
  // Proactively fetch a cost for any catalog line that has none yet, so the
  // breakdown fills in real numbers on open. `costTick` re-renders once the cost
  // map updates; `costFailed` records SKUs we tried and couldn't price (→ they
  // get an asterisk and keep the 40% assumption). Custom items can't be fetched.
  const [costTick, setCostTick] = useState(0);
  const [costFailed, setCostFailed] = useState(() => new Set());
  const toFetch = Array.from(new Set(
    (entries || [])
      .filter((e) => e && e.product && !e.product.isCustom && !hasRealCost(e.product))
      .map((e) => costSkuOf(e.product))   // bundle lines fetch their single sibling's SKU
      .filter((s) => s && !costFailed.has(s))
  )).sort();
  const fetchKey = toFetch.join(',');
  useEffect(() => {
    if (!fetchKey) return undefined;
    const skus = fetchKey.split(',');
    let alive = true;
    importCosts(skus, {})
      .then(() => { if (!alive) return; setCostTick((t) => t + 1); setCostFailed((prev) => { const n = new Set(prev); skus.forEach((s) => { if (!(cachedCostForSku(s) > 0)) n.add(s); }); return n; }); })
      .catch(() => { if (!alive) return; setCostFailed((prev) => { const n = new Set(prev); skus.forEach((s) => n.add(s)); return n; }); });
    return () => { alive = false; };
  }, [fetchKey]);
  // A line gets a "couldn't price" asterisk when it has no real cost and either
  // it's a custom item (nothing to fetch) or the fetch failed.
  const starLine = (e) => !!e && !hasRealCost(e.product) && (!!(e.product && e.product.isCustom) || costFailed.has(costSkuOf(e.product)));
  const M = useMemo(() => marginReport(entries), [entries, costTick]);
  // Order-level promo discount (if a coupon is applied) → nets revenue/profit/margin.
  const _promoDisc = (promo && promo.promotion) ? promoDiscount(promo.promotion) : 0;
  const _netRev = M.rev - _promoDisc;
  const _netMargin = _netRev > 0 ? (_netRev - M.cost) / _netRev : 0;
  const decorated = M.lines.filter((l) => decoImprints(l.decoration).length > 0 || (l.decoration && l.decoration.giftSet));
  // Email composer lives INLINE here (replacing the breakdown) rather than in a
  // separate modal — a smoother single-surface flow. The source is captured ONCE
  // when entering email mode (state, not useMemo): `buildEmailSource` is an
  // inline arrow recreated on every parent render, so memoizing on its identity
  // rebuilt the source each render — which churned source.rawLines and cancelled
  // the in-flight 3D preview generation (the "Imprint previews" toggle hung).
  const [emailSource, setEmailSource] = useState(null);
  const emailMode = !!emailSource;
  const setEmailMode = (on) => setEmailSource(on && buildEmailSource ? buildEmailSource() : null);
  const canEmail = !!buildEmailSource && M.count > 0;
  // Checkout sub-panel — single-proposal only (buildCheckoutSource is omitted for
  // the multi-proposal overview).
  const [checkoutSrc, setCheckoutSrc] = useState(null);
  const checkoutMode = !!checkoutSrc;
  const setCheckoutMode = (on) => setCheckoutSrc(on && buildCheckoutSource ? buildCheckoutSource() : null);
  const canCheckout = !!buildCheckoutSource && M.count > 0;
  const inSub = emailMode || checkoutMode;
  const exitSub = () => { setEmailMode(false); setCheckoutMode(false); };
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
        <IconBtn size="sm" variant="ghost" icon={<ArrowL />} onClick={inSub ? exitSub : onClose} />
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: inSub ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (inSub ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), color: inSub ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background var(--gb-anim), border-color var(--gb-anim), color var(--gb-anim)' }}>
          {checkoutMode ? <I.card size={16} /> : emailMode ? <I.mail size={16} /> : current ? <I.card size={16} /> : <I.bookmark size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{checkoutMode ? `Checkout · ${M.count} ${M.count === 1 ? 'item' : 'items'} · ${M.units} units` : emailMode ? `Compose proposal email · ${M.count} ${M.count === 1 ? 'item' : 'items'}` : subtitle}</div>
        </div>
        {!inSub && badge}
        <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {checkoutMode && checkoutSrc ? (
      <motion.div key="checkout" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }} transition={{ duration: .2 }}>
        <CheckoutComposer source={checkoutSrc} onBack={() => setCheckoutMode(false)} />
      </motion.div>
      ) : emailMode && emailSource ? (
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
        <StatTile label={M.costBasis === 'actual' ? 'Cost' : 'Est. cost'} value={money(M.cost)} sub={M.costBasis === 'actual' ? 'actual' : M.costBasis === 'mixed' ? 'part actual' : 'assumed'} />
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
              {M.lines.map((e, i) => <MarginLineRow key={e.id || i} e={e} first={i === 0} estimated={starLine(e)}
                onEditPrice={onPatchSplit ? (splitIndex, price) => onPatchSplit(i, e.srcIndex, splitIndex, price) : undefined} />)}
            </div>
          )}
          {M.lines.some(starLine) && (
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              <span style={{ color: 'var(--gb-warning-fg, #b6830a)', fontWeight: 800 }}>*</span> no cost on file — couldn’t load one, using a {pctOf(ASSUMED_MARGIN)} margin estimate.
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

        {onApplyPromo && <PromoBlock promo={promo} onApply={onApplyPromo} onClear={onClearPromo} onCheck={onCheckPromo} />}

        <div>
          <SectionTitle icon={<Layers />}>Margin summary</SectionTitle>
          <div style={{ borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-subtle)', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SummaryRow label={`Revenue · ${M.units} units`} value={money(M.rev)} />
            <SummaryRow label={M.costBasis === 'actual' ? 'Cost · actual' : M.costBasis === 'mixed' ? `Cost · ${M.realCount}/${M.paidCount} actual, rest ${pctOf(COST_RATIO)} of sell` : `Est. cost · ${pctOf(COST_RATIO)} of sell`} value={'−' + money(M.cost)} tone="var(--gb-text-muted)" />
            {_promoDisc > 0 && <SummaryRow label={`Promotion · ${promo.code}`} value={'−' + money(_promoDisc)} tone="var(--gb-success-fg)" />}
            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '7px 0' }} />
            <SummaryRow label={_promoDisc > 0 ? 'Gross profit (after promo)' : 'Gross profit'} value={money(M.profit - _promoDisc)} strong tone="var(--gb-brand-label)" />
            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '7px 0' }} />
            <SummaryRow label="Blended margin" strong badge={<MarginBadge m={_netMargin} lg />} />
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <I.alert size={12} /> {M.costBasis === 'actual'
            ? 'Costs from synced inventory; prices editable. Click a price to override.'
            : M.costBasis === 'mixed'
              ? `${M.realCount}/${M.paidCount} use synced cost; the rest assume ${pctOf(ASSUMED_MARGIN)} margin. Click a price to override.`
              : `Costs assume ${pctOf(ASSUMED_MARGIN)} margin (no synced cost). Click a price to override.`}
        </span>
        <div style={{ flex: 1 }} />
        {current ? (
          <>
            <Btn variant="ghost" size="md" icon={<I.card />} onClick={onOpenProposal}>Open proposal</Btn>
            {canEmail && <Btn variant={canCheckout ? 'secondary' : 'primary'} size="md" icon={<I.mail />} onClick={() => setEmailMode(true)}>Generate email</Btn>}
            {canCheckout && <Btn variant="primary" size="md" icon={<I.card />} onClick={() => setCheckoutMode(true)}>Checkout</Btn>}
          </>
        ) : (
          <>
            {onLoad && <Btn variant="secondary" size="md" icon={loaded ? <I.check /> : <I.plus />} onClick={onLoad}>{loaded ? 'Loaded' : 'Load'}</Btn>}
            {canEmail && <Btn variant={canCheckout ? 'secondary' : 'primary'} size="md" icon={<I.mail />} onClick={() => setEmailMode(true)}>Generate email</Btn>}
            {canCheckout && <Btn variant="primary" size="md" icon={<I.card />} onClick={() => setCheckoutMode(true)}>Checkout</Btn>}
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

function SavedCard({ item, loaded, pos, colW, onMeasure, onOpen, onLoad, onDelete, moveAnim, readOnly, subtitle, selected, onToggleSelect }) {
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
        {readOnly ? (
          /* Live CRM proposal — a static "Current" tag (no delete). */
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: .2, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)' }}>
            <I.card size={9} /> Current
          </span>
        ) : (
        /* The "Draft" tag IS the delete control — hovering it turns it red and
            clicking removes the draft (keeps the card otherwise button-free). */
        <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          onMouseEnter={() => setTagHover(true)} onMouseLeave={() => setTagHover(false)}
          title={tagHover ? 'Delete this draft' : 'Saved draft'}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 20, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: .2, overflow: 'hidden',
            background: tagHover ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-subtle)',
            border: '1px solid ' + (tagHover ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'),
            color: tagHover ? 'var(--gb-error-fg, var(--gb-error))' : 'var(--gb-text-tertiary)',
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
        )}
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        {subtitle && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
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
        {/* Multi-select — selecting 1+ proposals reveals an "Open" action to
            view/email them together. */}
        {onToggleSelect && (
          <span onClick={(e) => e.stopPropagation()} title={selected ? 'Selected — click to deselect' : 'Select for a combined view / email'}
            style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <Checkbox checked={selected} onChange={() => onToggleSelect(item)} />
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); onLoad(item); }} title={loaded ? 'Added to proposal' : 'Load these items into the proposal'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, flexShrink: 0, background: loaded ? 'var(--gb-brand-label)' : 'var(--gb-brand-tint-medium)', color: loaded ? 'var(--gb-surface-deep)' : 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)', transition: 'all var(--gb-anim)' }}>
          {loaded ? <><I.check size={12} strokeWidth={3} /> Added</> : <><I.plus size={12} /> Load</>}
        </button>
      </div>
    </motion.div>
  );
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

function GalleryNotice({ icon, title, message }) {
  return (
    <div style={{ minHeight: 150, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 12px' }}>
      <div role="status" style={{
        width: '100%', maxWidth: 430, display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px', borderRadius: 'var(--gb-r-lg)',
        background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.035)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--gb-r-md)', flex: '0 0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)',
        }}>
          {icon || <I.alert size={15} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.25, fontWeight: 700, letterSpacing: -.08, color: 'var(--gb-text-primary)' }}>{title}</div>
          <div style={{ marginTop: 3, fontSize: 11.25, lineHeight: 1.45, fontWeight: 500, color: 'var(--gb-text-muted)' }}>{message}</div>
        </div>
      </div>
    </div>
  );
}

function SavedGallery({ items, loadedId, current, onOpen, onOpenCurrent, onLoad, onCopy, onDelete, onSaveToAccount, onEmail,
  title = 'Saved Proposals', subtitleText, headerIcon, hideCurrent, readOnly, loading, notice, error, onRefresh, emptyTitle, emptyText, subtitleOf,
  selectedIds, onToggleSelect, onOpenMulti, onClearSelection, headerAction }) {
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
    /* minHeight:0 lets this flex child shrink below its content so the inner
       scroll area (overflowY:auto) actually scrolls instead of the whole
       gallery growing past the modal — the Current Proposals "can't scroll" bug. */
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {headerIcon || <I.bookmark size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitleText || <>Click any card to view its margin breakdown &amp; order items{items.length ? ' · or load / copy a draft' : ''}</>}</div>
        </div>
        {headerAction}
        {onRefresh && <IconBtn size="md" title="Refresh" icon={<I.refresh style={{ animation: loading ? 'gb-spin .8s linear infinite' : 'none' }} />} onClick={onRefresh} />}
      </div>
      <div ref={scrollRef} className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!hideCurrent && current && current.length > 0 && <CurrentProposalCard entries={current} onOpen={onOpenCurrent} />}
        {loading && items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: 'var(--gb-text-muted)', fontSize: 12, padding: '48px 0' }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} /> Loading proposals…
          </div>
        ) : notice ? (
          <GalleryNotice icon={notice.icon} title={notice.title} message={notice.message} />
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 16px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', textAlign: 'center' }}><I.alert size={14} style={{ color: 'var(--gb-error-fg, var(--gb-error))', verticalAlign: 'middle', marginRight: 6 }} />{error}</div>
            {onRefresh && <Btn variant="secondary" size="sm" icon={<I.refresh size={13} />} onClick={onRefresh}>Retry</Btn>}
          </div>
        ) : items.length === 0 ? (
          (!hideCurrent && current && current.length > 0) ? (
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', padding: '18px 0', lineHeight: 1.5 }}>Saved drafts appear here — hit “Save draft” to keep one.</div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {headerIcon || <I.bookmark size={20} />}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{emptyTitle || 'No saved proposals yet'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>{emptyText || 'Build a proposal and hit “Save draft” to keep it here for later.'}</div>
            </div>
          )
        ) : (
          <div style={{ position: 'relative', width: '100%', height }}>
            <AnimatePresence>
              {items.map((it) => (
                <SavedCard key={it.id} item={it} loaded={loadedId === it.id}
                  pos={positions[it.id] || { x: 0, y: 0 }} colW={colW} onMeasure={setHeight} moveAnim={moveAnim}
                  readOnly={readOnly} subtitle={subtitleOf ? subtitleOf(it) : undefined}
                  selected={selectedIds ? selectedIds.has(it.id) : false} onToggleSelect={onToggleSelect}
                  onOpen={onOpen} onLoad={onLoad} onDelete={onDelete} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      {/* Floating action bar — appears once 1+ proposals are checked; opens the
          combined overview + multi-proposal email. */}
      <AnimatePresence>
        {selectedIds && selectedIds.size > 0 && (
          <motion.div key="multibar" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ duration: .22, ease: [.34, 1.4, .64, 1] }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
            <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px 7px 10px', borderRadius: 999, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', boxShadow: '0 8px 28px -6px rgba(0,0,0,.4)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999, background: 'var(--gb-brand-label)', color: 'var(--gb-surface-deep)', fontSize: 11.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', lineHeight: 1 }}>{selectedIds.size}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>selected</span>
              <button onClick={() => onClearSelection && onClearSelection()} title="Clear selection"
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px' }}>Clear</button>
              <Btn size="sm" variant="tinted" status="brand" icon={<I.eye size={12} />} style={{ borderRadius: 999, paddingLeft: 14, paddingRight: 16 }} onClick={() => onOpenMulti && onOpenMulti()}>Open</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProposalPanel({ proposal, onClose, onPatchSplit, onAddSplit, onRemoveSplit, onRemoveLine, onClear, onSaveDraft, onMergeImprint, onApplyLogoToAll, onRemoveFront, onRemoveSecond, pageContext = {}, onSaveToAccount, onAddOpportunity, accountSaveSeq = 0, onEmail, promo, onApplyPromo, onClearPromo, onCheckPromo }) {
  const total = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const promoDisc = (promo && promo.promotion) ? promoDiscount(promo.promotion) : 0;
  // Free giveaway lines a FREE_QUANTITY coupon grants (shown read-only, $0).
  const freeLines = (promo && promo.promotion) ? freeLinesFromPromo(promo.promotion, proposal) : [];
  const units = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty, 0), 0);
  // Drag-to-copy imprints between lines. `drag` holds the in-flight source so
  // every line can light up (or stay dim) based on whether it can take it.
  const [drag, setDrag] = useState(null);              // { fromLineId, slot, imprint }
  const startDrag = (line, chip) => setDrag({ fromLineId: line.id, slot: chip.slot, imprint: chip });
  const endDrag = () => setDrag(null);
  const dropDeco = (toLineId) => { if (drag) onMergeImprint(drag.fromLineId, toLineId, drag.imprint); setDrag(null); };
  const canCopy = proposal.length >= 2 && proposal.some((l) => decoImprints(l.decoration).length > 0);
  // Drag an image FILE onto the sidebar → align/scale it → apply to every blank
  // custom-logo line at once. `blankLogos` counts the lines that would receive it.
  const blankLogos = proposal.filter((l) => { const d = l.decoration; return d && (d.engine === 'ballLogo' || d.engine === 'logoOverlay') && !(d._localImageDataUrl || (d.logo && d.logo.filePath)); }).length;
  const [fileOver, setFileOver] = useState(false);
  const [pendingLogo, setPendingLogo] = useState(null);   // { url, name } awaiting alignment
  const fileDragDepth = useRef(0);
  const hasFile = (e) => { try { return Array.from(e.dataTransfer.types || []).includes('Files'); } catch { return false; } };
  const onFileDragEnter = (e) => { if (!hasFile(e) || !onApplyLogoToAll) return; fileDragDepth.current += 1; setFileOver(true); };
  const onFileDragOver = (e) => { if (!hasFile(e) || !onApplyLogoToAll) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const onFileDragLeave = (e) => { if (!hasFile(e)) return; fileDragDepth.current = Math.max(0, fileDragDepth.current - 1); if (fileDragDepth.current === 0) setFileOver(false); };
  const onFileDrop = (e) => {
    if (!hasFile(e) || !onApplyLogoToAll) return;
    e.preventDefault(); fileDragDepth.current = 0; setFileOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => setPendingLogo({ url: r.result, name: f.name || 'logo.png' });
    r.readAsDataURL(f);
  };
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
    <div
      onDragEnter={onFileDragEnter} onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onFileDrop}
      style={{
      width: '100%', height: '100%', position: 'relative',
      background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)',
      display: 'flex', flexDirection: 'column',
    }}>
        {/* Drop-a-logo overlay — appears while dragging an image file over the
            sidebar; dropping opens the align/scale flow then fills every blank
            custom-logo line. */}
        {fileOver && onApplyLogoToAll && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: 24,
            background: 'var(--gb-brand-tint-soft)', border: '2px dashed var(--gb-brand-label)', borderRadius: 'var(--gb-r-xl)', pointerEvents: 'none' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.upload size={20} /></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Drop logo to apply</div>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', maxWidth: 230, lineHeight: 1.5 }}>{blankLogos ? `Fills the ${blankLogos} blank custom-logo item${blankLogos === 1 ? '' : 's'} after you align it.` : 'No blank custom-logo items to fill yet.'}</div>
          </div>
        )}
        {pendingLogo && (
          <ImageAlignModal image={pendingLogo.url}
            onCancel={() => setPendingLogo(null)}
            onApply={(composited) => { onApplyLogoToAll(composited, pendingLogo.name); setPendingLogo(null); }} />
        )}
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
              {onApplyLogoToAll && blankLogos > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px dashed var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', fontSize: 10, fontWeight: 600 }}>
                  <I.upload size={11} style={{ flexShrink: 0 }} />
                  Drag a logo image here to fill {blankLogos} blank custom-logo item{blankLogos === 1 ? '' : 's'}.
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
              {/* Free giveaway lines from a FREE_QUANTITY coupon — read-only, $0. */}
              {freeLines.map((fl) => (
                <div key={fl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                  <MiniThumb src={lineGiftImg(fl) || (fl.product && fl.product.img)} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(fl.product && fl.product.title) || 'Item'}</span>
                      <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-success-fg)', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-success-tint-border)', borderRadius: 'var(--gb-r-pill)', padding: '1px 6px' }}>Free</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--gb-text-tertiary)', marginTop: 1, fontFamily: 'var(--gb-font-mono)' }}>{fl.splits[0].qty} × $0.00 · promo</div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-success-fg)', flexShrink: 0 }}>FREE</span>
                </div>
              ))}
            </>
          )}
        </div>
        {proposal.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-inverse-strong)' }}>
            {/* Promo code — same type-or-select picker as the breakdown. */}
            {onApplyPromo && (
              <div style={{ padding: '11px 16px 2px' }}>
                <PromoBlock promo={promo} onApply={onApplyPromo} onClear={onClearPromo} onCheck={onCheckPromo} />
              </div>
            )}
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Estimated total</span>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)' }}>{units} units</span>
              <div style={{ flex: 1 }} />
              {promoDisc > 0 && <span style={{ fontSize: 12, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', textDecoration: 'line-through' }}>{money(total)}</span>}
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.6 }}>{money(total - promoDisc)}</span>
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
                <div style={{ height: 32, borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--gb-success-tint-medium)', border: '1px solid var(--gb-success-tint-border)', color: 'var(--gb-success-fg)', fontSize: 12.5, fontWeight: 700 }}>
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
/* The catalog cannot take the shared Modals `zoom` — Chrome accumulates
   sub-pixel rounding on grid ROW positions under a fractional zoom, so the
   product rows creep into each other (see the overlay comment below). It still
   has to OBEY that setting though, so the Modals scale is multiplied into the
   catalog's own `giftCatalog.scale` and applied through the same transform.
   Both sliders therefore compose: Modals is the global preference and
   giftCatalog.scale is a per-surface adjustment on top of it. */
function useCatalogScale() {
  const [scale, setScale] = useState(_catalogScale);
  useEffect(() => {
    let alive = true;
    // The catalog's own band is a MAGNIFICATION (1–3, default 1.8), not the
    // 0.5–1.5 multiplier the Modals slider uses. Defaulting an unset
    // giftCatalog.scale to 1 rather than its real default collapsed the whole
    // surface to a third of its intended size.
    let own = CATALOG_SCALE_DEFAULT;
    let modals = 1;
    let ownLoaded = false;
    let modalsLoaded = false;
    const push = () => {
      // Wait for BOTH inputs before touching the scale: publishing an
      // intermediate value re-lays out the masonry mid-measurement.
      if (!ownLoaded || !modalsLoaded) return;
      const next = normalizeCatalogScale(own * modals);
      _catalogScale = next;
      if (alive) setScale(next);
    };
    const readOwn = (bag) => {
      const raw = Number((bag || {})['giftCatalog.scale']);
      own = Number.isFinite(raw) && raw > 0 ? raw : CATALOG_SCALE_DEFAULT;
      ownLoaded = true;
    };
    loadDevSettings().then((d) => { readOwn(d); push(); });
    loadScales().then((all) => {
      modals = Number(all?.modals) || 1;
      modalsLoaded = true;
      push();
    });
    const onCh = (changes) => {
      if (!changes) return;
      if (changes[DEV_STORAGE_KEY]) {
        readOwn(changes[DEV_STORAGE_KEY].newValue);
        push();
      }
      if (changes.uiScales) {
        modals = Number((changes.uiScales.newValue || {}).modals) || 1;
        modalsLoaded = true;
        push();
      }
    };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* no storage */ }
    return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);
  return scale;
}

/* Hidden tabs can briefly report stale/zero visualViewport dimensions while
   Chrome throttles and restores them. Ignore those measurements and refresh
   once the tab is visible so returning to the catalog cannot inflate it. */
function useCatalogViewport() {
  const readNow = () => ({
    width: typeof window === 'undefined' ? 0 : (window.visualViewport?.width || window.innerWidth),
    height: typeof window === 'undefined' ? 0 : (window.visualViewport?.height || window.innerHeight),
  });
  const [viewport, setViewport] = useState(readNow);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const next = readNow();
      if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return;
      setViewport((current) => (
        Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5
          ? current
          : next
      ));
    };
    const readAfterVisibility = () => {
      if (document.hidden) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    document.addEventListener('visibilitychange', readAfterVisibility);
    window.addEventListener('pageshow', readAfterVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
      document.removeEventListener('visibilitychange', readAfterVisibility);
      window.removeEventListener('pageshow', readAfterVisibility);
    };
  }, []);
  return viewport;
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

// Admin-only: the built-in supplier ingesters ship only in the admin build.
// Lazy dynamic imports inside the `__ADMIN__` branch mean the served build
// (__ADMIN__ === false → `{}`) never references hpgImport/snugzImport, so esbuild
// leaves them out entirely. Consumers get custom items from shared store links.
const REPO_RUN = __ADMIN__ ? {
  hpg: (opts) => import('../lib/hpgImport.js').then((m) => m.importHpgCatalog(opts)),
  snugz: (opts) => import('../lib/snugzImport.js').then((m) => m.importSnugzCatalog(opts)),
} : {};

/* Repo import modal — pick a supplier "repo" and pull its customizable catalog in
   as custom items. A link input is stubbed for a future per-URL import. Running
   shows a live progress animation that can be cancelled mid-flight. */
function RepoImportModal({ onClose, onImported }) {
  const [repo, setRepo] = useState('hpg');
  const [mode, setMode] = useState(__ADMIN__ ? 'builtin' : 'link');   // 'builtin' = brand catalog | 'link' = shared store link
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);   // { label, count, total }
  const signalRef = useRef(null);
  const repoOptions = Object.keys(REPOS).map((id) => ({ id, label: REPOS[id].name }));

  // Import a curated store someone shared. The waiting happens on the backend
  // fetch; there is no cancellable per-product loop, so the progress UI just
  // spins. Reuses onImported so the gallery reloads and toasts identically.
  const runLink = () => {
    const val = link.trim();
    if (!val || busy) return;
    setBusy(true);
    setProg({ label: 'Loading store…' });
    importProductStore(val)
      .then((res) => onImported('link', res))
      .catch((e) => {
        try { window.__gbToast && window.__gbToast.error && window.__gbToast.error((e && e.message) || 'Import failed', { duration: 4500 }); } catch { /* */ }
        setBusy(false);
      });
  };

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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{mode === 'link' ? 'Importing store' : `Importing ${REPOS[repo].name}`}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>{(prog && prog.label) || 'Working…'}</div>
            </div>
            <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'var(--gb-fill-subtle)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'var(--gb-brand-label)', width: pct != null ? `${pct}%` : '30%', animation: pct != null ? 'none' : 'gb-pulse 1s ease-in-out infinite', transition: 'width .35s ease' }} />
            </div>
            <Btn variant="secondary" size="md" icon={<I.close />} onClick={close} style={{ width: '100%' }}>Cancel import</Btn>
          </div>
        ) : (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Two mutually-exclusive sources — a built-in brand catalog OR a
                shared store link — behind a segmented toggle so neither reads as
                half-configured. Built-in brand import is admin-only, so the
                served build shows just the "From a link" path (no toggle). */}
            {__ADMIN__ && (
              <div role="tablist" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
                {[{ id: 'builtin', label: 'Built-in brands' }, { id: 'link', label: 'From a link' }].map((opt) => (
                  <button key={opt.id} type="button" role="tab" aria-selected={mode === opt.id} onClick={() => setMode(opt.id)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: .2,
                      background: mode === opt.id ? 'var(--gb-surface-modal)' : 'transparent',
                      color: mode === opt.id ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
                      boxShadow: mode === opt.id ? '0 1px 2px rgba(0,0,0,.10)' : 'none' }}>{opt.label}</button>
                ))}
              </div>
            )}

            {(__ADMIN__ && mode === 'builtin') ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Brand catalog</label>
                <Dropdown size="sm" value={repo} onChange={setRepo} options={repoOptions} />
                <span style={{ fontSize: 10, color: 'var(--gb-text-ghost)' }}>Pulls {REPOS[repo]?.name || 'the supplier'}’s full customizable catalog into your custom items.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Store link</label>
                <Input size="sm" value={link} onChange={setLink} placeholder="Paste a shared store link…" onKeyDown={(e) => { if (e.key === 'Enter') runLink(); }} />
                <span style={{ fontSize: 10, color: 'var(--gb-text-ghost)' }}>Import a curated set of products someone shared with you.</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
              {(__ADMIN__ && mode === 'builtin')
                ? <Btn variant="primary" size="md" icon={<I.download />} onClick={run}>Import</Btn>
                : <Btn variant="primary" size="md" icon={<I.download />} onClick={runLink} disabled={!link.trim()}>Import</Btn>}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* Store transfer (share via revocable backend link, or a durable versioned JSON
   file) lives inside the owning view instead of hiding the catalog behind
   another modal. Parametrized by `api` (create / importLink / importFile /
   buildFile) and `labels` so the SAME panel serves custom items and saved
   proposals — the two share the identical workflow and backend endpoint. */
function StoreTransferPanel({ mode, items, onMode, onClose, onImported, onShared, api, labels = {} }) {
  const L = {
    defaultName: 'My store', title: 'Move items',
    subtitle: 'Share with a revocable link or a durable JSON file.',
    linkPlaceholder: 'Paste a store link…', filenameBase: 'golfballs-store',
    ...labels,
  };
  const [name, setName] = useState(L.defaultName);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);
  const toast = useToast();
  const count = items.length;

  const safeFilename = (value) => {
    const base = String(value || L.filenameBase).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return `${base || L.filenameBase}.json`;
  };
  const downloadFile = () => {
    try {
      const file = api.buildFile(name, items);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeFilename(name);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    } catch (error) {
      toast?.error?.(error?.message || 'Could not export the product store');
      return false;
    }
  };
  const create = async () => {
    if (!name.trim() || !count || busy) return;
    setBusy(true);
    try {
      const store = await api.create(name, items);
      setCreated(store);
      onShared?.();
    } catch (error) {
      if (downloadFile()) {
        toast?.success?.('Server unavailable — downloaded a JSON store instead');
        onShared?.();
      } else {
        toast?.error?.(error?.message || 'Could not create the product store');
      }
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!created?.url) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      toast?.success?.('Store link copied');
    } catch { toast?.error?.('Could not copy the store link'); }
  };
  const importLink = async () => {
    if (!link.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api.importLink(link);
      onImported?.(result);
      setLink('');
    } catch (error) {
      toast?.error?.(error?.message || 'Could not import the store');
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    try {
      const result = await api.importFile(await file.text());
      onImported?.(result);
    } catch (error) {
      toast?.error?.(error?.message || 'Could not import the JSON store');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: 'auto', opacity: 1, y: 0 }}
      exit={{ height: 0, opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      style={{ flexShrink: 0, overflow: 'hidden', borderBottom: '1px solid var(--gb-border-subtle)', background: 'linear-gradient(135deg, var(--gb-brand-tint-soft), var(--gb-surface-1) 42%, var(--gb-fill-inverse-strong))' }}>
      <div style={{ margin: '12px 16px 14px', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', background: 'color-mix(in srgb, var(--gb-surface-modal) 92%, transparent)', boxShadow: '0 8px 24px -18px rgba(0,0,0,.42)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ width: 29, height: 29, borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)' }}>
            {mode === 'share' ? <I.link size={15} /> : <I.download size={15} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--gb-text-primary)' }}>{L.title}</div>
            <div style={{ marginTop: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{L.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
            {[['share', 'Share'], ['import', 'Import']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => onMode(id)} disabled={id === 'share' && !count}
                style={{ minWidth: 66, padding: '5px 10px', border: 0, borderRadius: 6, cursor: id === 'share' && !count ? 'not-allowed' : 'pointer', font: 'inherit', fontSize: 10.5, fontWeight: 750,
                  opacity: id === 'share' && !count ? .42 : 1, color: mode === id ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
                  background: mode === id ? 'var(--gb-surface-modal)' : 'transparent', boxShadow: mode === id ? '0 1px 3px rgba(0,0,0,.12)' : 'none', transition: 'all var(--gb-anim)' }}>{label}</button>
            ))}
          </div>
          <IconBtn size="sm" variant="ghost" icon={<I.close />} onClick={onClose} title="Close transfer panel" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {mode === 'share' ? (
            <motion.div key="share" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: .16 }}
              style={{ padding: 12, display: 'grid', gridTemplateColumns: created ? 'minmax(220px, .8fr) minmax(320px, 1.2fr)' : 'minmax(240px, 1fr) auto', gap: 12, alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Store name · {count} selected</label>
                <Input size="sm" value={name} onChange={setName} placeholder="e.g. Fall gift picks" />
              </div>
              {created ? (
                <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                  <Input size="sm" value={created.url} onChange={() => {}} readOnly onFocus={(event) => event.target.select()} style={{ flex: 1 }} />
                  <Btn variant="primary" size="sm" icon={copied ? <I.check /> : <I.copy />} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Btn>
                  <Btn variant="secondary" size="sm" icon={<I.download />} onClick={downloadFile}>JSON</Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                  <Btn variant="secondary" size="sm" icon={<I.download />} onClick={downloadFile} disabled={!name.trim() || !count}>Download JSON</Btn>
                  <Btn variant="primary" size="sm" icon={<I.link />} onClick={create} disabled={!name.trim() || !count || busy}>{busy ? 'Creating…' : 'Create link'}</Btn>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="import" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .16 }}
              style={{ padding: 12, display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: 10, alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Shared store link</label>
                <Input size="sm" value={link} onChange={setLink} placeholder={L.linkPlaceholder} onKeyDown={(event) => { if (event.key === 'Enter') importLink(); }} />
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: 'none' }} />
                <Btn variant="secondary" size="sm" icon={<I.upload />} onClick={() => fileRef.current?.click()} disabled={busy}>Import JSON</Btn>
                <Btn variant="primary" size="sm" icon={<I.download />} onClick={importLink} disabled={!link.trim() || busy}>{busy ? 'Importing…' : 'Import link'}</Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
  const [transfer, setTransfer] = useState(null); // { mode: share|import, items }
  const toast = useToast();
  const lastIdx = useRef(null);
  const scrollRef = useRef(null);
  const onRepoImported = (repoId, res) => {
    setRepoOpen(false);
    if (onReload) onReload();
    const label = (res && res.name) || REPOS[repoId]?.name || repoId;
    toast?.success?.(`Imported ${res.added} new + ${res.updated} updated from ${label}`, { duration: 4000 });
  };
  const onTransferImported = (res) => {
    if (onReload) onReload();
    toast?.success?.(`Imported ${res.added} new + ${res.updated} updated from ${res.name || 'product store'}`, { duration: 4000 });
    setTransfer(null);
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
        {!selectMode && __ADMIN__ && <IconBtn size="sm" variant="secondary" title="Import a supplier catalog" icon={<I.cube size={14} />} onClick={() => setRepoOpen(true)} />}
        {!selectMode && <IconBtn size="sm" variant="secondary" title="Import or share custom items" icon={<I.upload size={14} />} onClick={() => setTransfer((current) => current ? null : { mode: 'import', items: [] })} />}
        <Btn variant="primary" size="sm" icon={<I.plus />} onClick={onNew}>Add custom item</Btn>
      </div>
      <AnimatePresence initial={false}>
        {transfer && (
          <StoreTransferPanel key="custom-items-transfer" mode={transfer.mode} items={transfer.items}
            api={{ create: createProductStore, importLink: importProductStore, importFile: importProductStoreFile, buildFile: buildProductStoreFile }}
            labels={{ defaultName: 'My custom item store', title: 'Move custom items', subtitle: 'Share with a revocable link or a durable JSON file.', linkPlaceholder: 'Paste a product-store link…', filenameBase: 'golfballs-product-store' }}
            onMode={(mode) => setTransfer((current) => ({ mode, items: current?.items || [] }))}
            onClose={() => setTransfer(null)} onImported={onTransferImported}
            onShared={() => { if (selectMode) exitSelect(); }} />
        )}
      </AnimatePresence>
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
            {/* gridAutoRows pins every row to an exact integer height. Under the
                mount root's CSS `zoom`, content-sized tracks pick up fractional
                heights that mis-round, so a card renders a hair taller than its
                track and the next row creeps up into it. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gridAutoRows: `${catalogRowHeight(compact)}px`, gap: compact ? 10 : 12 }}>
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
      {/* Select-mode actions — float bottom-right: share the picks as a store, or delete them. */}
      <AnimatePresence>
        {selectMode && sel.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: .16 }}
            style={{ position: 'absolute', right: 18, bottom: 18, zIndex: 6, display: 'flex', gap: 8 }}>
            <Btn variant="primary" size="md" icon={<I.link />} onClick={() => { const recs = items.filter((ci) => sel.has(ci.id)); if (recs.length) setTransfer({ mode: 'share', items: recs }); }}
              style={{ boxShadow: '0 6px 18px -6px rgba(0,0,0,.45)' }}>Share {nfmt(sel.size)}</Btn>
            {/* variant=primary so its hover is a brightness filter (keeps the solid
                fill) — the `danger` variant's hover animates backgroundColor to a
                tint, which made the button go transparent on hover. */}
            <Btn variant="primary" size="md" icon={<I.trash />} onClick={bulkDelete}
              style={{ background: 'var(--gb-error-fg, var(--gb-error))', color: '#fff', border: '1px solid var(--gb-error-fg, var(--gb-error))', boxShadow: '0 6px 18px -6px rgba(0,0,0,.45)' }}>Delete {nfmt(sel.size)}</Btn>
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
        try {
          const s3 = await ingestImageUrl(f.thumbnail);
          rec = { ...f, thumbnail: s3 };
          setF(rec);
        } catch (e) {
          // Re-hosting failed (CORS-less host, S3 hiccup) — save with the
          // external link rather than refusing the save. The catalog renders
          // it fine; only proposal emails need the hosted copy, and editing
          // the item later retries the ingest.
        }
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
                  {uploadErr && <span style={{ fontSize: 10.5, color: 'var(--gb-error-fg, var(--gb-error))', fontWeight: 600 }}>{uploadErr}</span>}
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
  const preferredScale = useCatalogScale(); // loaded before first paint to avoid a resize snap
  const viewport = useCatalogViewport();
  const toast = useToast();
  const [catalog, setCatalog] = useState(GIFT_CATALOG_SEED);
  // Index the catalog for bundle-cost resolution (Double Dozen → single dozen's
  // cost × 2) whenever it changes, so the margin breakdown can price multipacks.
  useEffect(() => { setBundleCatalog(catalog); }, [catalog]);
  const [loading, setLoading] = useState(true);        // first paint pending (no data yet)
  const [refreshing, setRefreshing] = useState(false); // a live pull is in flight
  const [progress, setProgress] = useState(null);      // { loaded, total } during a pull, else null
  const [updatedTs, setUpdatedTs] = useState(0);       // when the shown catalog was last indexed
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const [query, setQuery] = useState('');
  const [selBrands, setSelBrands] = useState(() => new Set()); // empty = all brands
  const toggleBrand = (b) => setSelBrands((s) => { const n = new Set(s); n.has(b) ? n.delete(b) : n.add(b); return n; });
  // Sidebar selection: 'all' | 'favorites' | 'dept:<department>'.
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
  // Promo code applied to the current proposal — { code, promotion } (the resolved
  // /user/promotion result). Persisted to its own key so the coupon survives a
  // close like the working proposal does.
  const [proposalPromo, setProposalPromo] = useState(null);
  const promoHydrated = useRef(false);
  useEffect(() => {
    let alive = true;
    try { chrome.storage.local.get('gbCurrentPromo', (d) => { if (alive) { if (d && d.gbCurrentPromo) setProposalPromo(d.gbCurrentPromo); promoHydrated.current = true; } }); }
    catch { promoHydrated.current = true; }
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!promoHydrated.current) return;
    try { chrome.storage.local.set({ gbCurrentPromo: proposalPromo || null }); } catch { /* */ }
  }, [proposalPromo]);
  // Promos are cart-dependent (free quantities, spend thresholds), so a coupon
  // applied earlier goes stale as lines are added/removed/re-priced — it would
  // keep granting free giveaways for items no longer in the cart. Re-validate
  // (debounced) whenever the proposal changes and refresh the stored promotion,
  // so freeLinesFromPromo always reflects the CURRENT cart. A transient network
  // failure keeps the last good result rather than dropping a valid coupon.
  // Reads proposalPromo via closure (not a dep) so refreshing it can't loop.
  useEffect(() => {
    if (!proposalPromo || !proposalPromo.code || !proposal.length) return undefined;
    let alive = true;
    const code = proposalPromo.code;
    const t = setTimeout(() => {
      validatePromo(proposal, code)
        .then((promotion) => { if (alive) setProposalPromo((p) => (p && p.code === code) ? { ...p, promotion } : p); })
        .catch(() => { /* transient — keep the last validated promotion */ });
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [proposal]); // eslint-disable-line react-hooks/exhaustive-deps
  // Validate + apply a promo against the current proposal (throws on invalid; the
  // PromoBlock surfaces the error). The resolved promo is stored and flows into
  // the saved/loaded cart; the site recomputes the exact discount on cart load.
  const applyPromo = async (code) => {
    const promotion = await validatePromo(proposal, code);
    setProposalPromo({ code: code.trim().toUpperCase(), promotion });
    addKnownPromo(code).catch(() => {});            // remember codes the rep uses
    return promotion;
  };
  const clearPromo = () => { setProposalPromo(null); setLoadedFree([]); };
  // Validate a code against the current cart WITHOUT applying it — drives the
  // picker's "which codes apply" check.
  const checkPromo = (code) => validatePromo(proposal, code);
  // Free dozens snapshotted from a loaded saved proposal. The live promo engine
  // only grants free items for IMPRINTED balls that still qualify, so a re-derive
  // on load can legitimately come back empty (or lag the 500ms re-validate) — the
  // snapshot guarantees the free lines stay visible exactly as saved. Cleared
  // once the live derive succeeds (it supersedes) or the promo/cart is cleared.
  const [loadedFree, setLoadedFree] = useState([]);
  // $0 "free" lines a FREE_QUANTITY coupon grants on the working proposal (cloned
  // from the matching line) — shown in the breakdown/email like the site's cart.
  const proposalFreeLines = useMemo(
    () => (proposalPromo && proposalPromo.promotion) ? freeLinesFromPromo(proposalPromo.promotion, proposal) : [],
    [proposalPromo, proposal]);
  // Live-derived free lines win; the loaded snapshot is the fallback until/unless
  // the derive produces its own (so loading and applying look identical).
  const effectiveFreeLines = proposalFreeLines.length ? proposalFreeLines : loadedFree;
  // Once the live derive yields free lines, drop the snapshot so they can't double.
  useEffect(() => { if (proposalFreeLines.length && loadedFree.length) setLoadedFree([]); }, [proposalFreeLines.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const proposalWithFree = effectiveFreeLines.length ? [...proposal, ...effectiveFreeLines] : proposal;
  const [proposalOpen, setProposalOpen] = useState(false);
  const catalogWidth = CATALOG_CARD_WIDTH + (proposalOpen ? CATALOG_PROPOSAL_WIDTH : 0);
  const scale = preferredScale == null
    ? null
    : fitCatalogScale(preferredScale, viewport.width, viewport.height, catalogWidth);
  const [detail, setDetail] = useState(null);   // proposal-breakdown drill-in: { kind:'saved'|'current'|'crm'|'multi', item? items? }
  // Multi-select across the Saved / Current galleries → a combined overview + one
  // email with every proposal stacked.
  const [selProps, setSelProps] = useState([]);
  const selPropIds = useMemo(() => new Set(selProps.map((p) => p.id)), [selProps]);
  const toggleSelProp = useCallback((item) => setSelProps((prev) => prev.some((p) => p.id === item.id) ? prev.filter((p) => p.id !== item.id) : [...prev, item]), []);
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
          if (s.priceEdited) return s;                 // respect a hand-edited price
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
  const [view, setView] = useState('catalog');        // 'catalog' | 'proposals' | 'custom' | 'current'
  useEffect(() => { if (view !== 'proposals' && view !== 'current') setDetail(null); setSelProps([]); }, [view]);  // close breakdown + clear multi-select on view change
  const [savedProposals, setSavedProposals] = useState([]);
  const [loadedId, setLoadedId] = useState(null);
  // Share/import saved proposals via the backend (same workflow as custom
  // items). null = panel closed; { mode: 'share' | 'import' } = open.
  const [savedTransfer, setSavedTransfer] = useState(null);
  // Current Proposals — live, pulled from the CRM for the account in context.
  // Lazy: fetched the first time the view opens (and re-fetchable).
  const [currentProposals, setCurrentProposals] = useState([]);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentLoaded, setCurrentLoaded] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const loadCurrentProposals = useCallback(() => {
    setCurrentLoading(true); setCurrentError(''); setCurrentLoaded(true);
    fetchActiveProposalEntries({ accountId: pageContext.accountId, opportunities: pageContext.opportunities })
      .then((list) => { if (aliveRef.current) setCurrentProposals(list); })
      .catch((e) => { if (aliveRef.current) setCurrentError((e && e.message) || 'Could not load proposals'); })
      .finally(() => { if (aliveRef.current) setCurrentLoading(false); });
  }, [pageContext.accountId, pageContext.opportunities]);
  useEffect(() => { if (view === 'current' && !currentLoaded) loadCurrentProposals(); }, [view, currentLoaded, loadCurrentProposals]);
  // Custom items (SERVICEITEM) — rep-defined products in chrome.storage; editingCustom
  // holds the record being created/edited in the form ({} = new, null = closed).
  const [customItems, setCustomItems] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [editingCustom, setEditingCustom] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSavedProposals().then((l) => { if (alive) setSavedProposals(l); });
    loadCustomItems().then((l) => { if (alive) setCustomItems(l); });
    loadCatalogFavorites().then((ids) => { if (alive) setFavoriteIds(ids); });
    primeCostCache().catch(() => {});      // hydrate per-SKU inventory costs for margin math
    const onCh = (changes) => {
      if (changes && changes.gbSavedProposals) setSavedProposals(changes.gbSavedProposals.newValue || []);
      if (changes && changes.gbCustomItems) setCustomItems(changes.gbCustomItems.newValue || []);
      if (changes && changes[CATALOG_FAVORITES_STORAGE_KEY]) setFavoriteIds(changes[CATALOG_FAVORITES_STORAGE_KEY].newValue || []);
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
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const toggleFavorite = useCallback((product) => {
    const id = product?.id == null ? '' : String(product.id);
    if (!id) return;
    setFavoriteIds((current) => {
      const next = new Set(current);
      const shouldFavorite = !next.has(id);
      if (shouldFavorite) next.add(id); else next.delete(id);
      setCatalogFavorite(current, id, shouldFavorite);
      return [...next];
    });
  }, []);

  // `productId` (not the line id) drives the "added" hint on cards, since a
  // product can now appear on multiple lines (e.g. different customizations).
  const inProposal = (id) => proposal.some((l) => l.productId === id);
  const propTotal = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const addToProposal = (p, decoration = null, variant = null) => setProposal((prev) => {
    // Always add a NEW line (unique id) — the same product can be added more
    // than once so the rep can quote different customizations/quantities. The
    // decoration descriptor (from the detail panel's CustomizeBlock) and the
    // selected base variant (e.g. Tee Count → its price) ride along so Save
    // draft serializes the real imprint + price.
    // Quick-add (no explicit decoration) DEFAULTS a logo-capable product to a
    // blank custom-logo imprint (ballLogo/logoOverlay, no art yet) instead of
    // stock — the rep's common case. Drop a logo onto the sidebar later to fill
    // the art for every blank custom-logo line at once.
    let deco = decoration || null;
    if (!deco && supportsLogo(p)) {
      deco = { engine: ballish(p) ? 'ballLogo' : 'logoOverlay', baseColor: '#FFFFFF',
        finish: { MFS: '279', SecondMFS: '279' }, dualPole: false, pole2: null, logo: null, _localImageDataUrl: null };
    }
    const qty = p.minQty || 1;
    // Accurate per-unit price: retail when no imprint, custom-logo ladder when
    // imprinted, a chosen variant's price, + the second-pole upcharge if dual.
    const startPrice = linePriceAt({ product: p, decoration: deco, variant }, qty);
    return [...prev, { id: rid(), productId: p.id, product: p, decoration: deco, variant: variant || null, splits: [{ id: rid(), qty, price: startPrice }] }];
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

  // Drop a logo image (from the sidebar drag-drop) onto EVERY blank custom-logo
  // line at once: a line whose decoration is a logo engine (ballLogo/logoOverlay)
  // with no art yet. The image is the aligned/scaled composite from the align
  // flow, so the scale is baked into the pixels. Lines that already carry art are
  // left untouched. Returns the count applied (for the sidebar toast/flash).
  const applyLogoToAllEmpty = (imageDataUrl, fileName = 'logo.png') => {
    let n = 0;
    setProposal((prev) => prev.map((l) => {
      const d = l.decoration;
      const isLogoEngine = d && (d.engine === 'ballLogo' || d.engine === 'logoOverlay');
      const hasArt = d && (d._localImageDataUrl || (d.logo && d.logo.filePath));
      if (!isLogoEngine || hasArt) return l;
      n += 1;
      const next = { ...d, _localImageDataUrl: imageDataUrl, logo: { filePath: '', fileName, cropFilePath: '' } };
      return { ...l, decoration: next, splits: l.splits.map((s) => ({ ...s, price: linePriceAt({ product: l.product, decoration: next, variant: l.variant }, s.qty) })) };
    }));
    if (n) toast?.success?.(`Applied logo to ${n} item${n === 1 ? '' : 's'}`);
    else toast?.error?.('No blank custom-logo items to apply the logo to');
    return n;
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
    // Snapshot the free giveaway lines ALONGSIDE the paid ones: the promotion's
    // freeItems key off split ids that don't survive a reload, so the only way
    // the saved overview can show the free dozens is to persist them (flagged
    // `free`). The cart-load path filters them back out and lets the site
    // re-grant them from the promotion (see copySaved).
    return saveProposalDraft(name, [...proposal, ...proposalFreeLines], proposalPromo && proposalPromo.promotion)
      .then((r) => { setSavedProposals(r.list); toast?.success?.(`Saved “${r.entry.name}” to Saved Proposals`); })
      .catch((e) => { toast?.error?.('Couldn’t save — ' + ((e && e.message) || 'unknown error')); throw e; });
  };

  // Load a saved draft's lines into the live proposal (merging by product so
  // re-loading the same draft doesn't duplicate lines). Stay on the gallery and
  // just open the proposal panel beside it, so the load is visible in place
  // rather than dumping the user back into the All Items grid.
  const loadSaved = (entry) => {
    // Only the PAID lines enter the live working set. The free dozens are DERIVED
    // from the promo (proposalFreeLines), the same as when a coupon is applied
    // live — so they render identically (the "Free" badge, not an editable $0
    // line) whether loaded or freshly applied, and they don't pollute the promo
    // re-validation. Setting proposalPromo below makes the [proposal] effect
    // re-resolve the coupon against the loaded cart, regenerating the free lines
    // with fresh ids. (The stored free lines are kept only for the static saved-
    // proposal overview, which renders them directly.)
    const all = linesFromSaved(entry, rid);
    const incoming = all.filter((l) => !l.free);
    setProposal((prev) => {
      const have = new Set(prev.map((l) => l.productId));
      return [...prev, ...incoming.filter((l) => !have.has(l.productId))];
    });
    // Keep the saved free dozens visible (as proper free items) regardless of
    // whether the live re-validate re-grants them — see loadedFree.
    setLoadedFree(all.filter((l) => l.free));
    setLoadedId(entry.id);
    // Carry the loaded proposal's coupon into the working set (or clear a stale
    // one) — otherwise a previously-applied code persists and shows "requirements
    // not met" against the newly-loaded cart.
    setProposalPromo((entry.promotion && entry.promotion.promo)
      ? { code: entry.promotion.promo, promotion: entry.promotion } : null);
    setProposalOpen(true);
  };

  // Copy a saved draft as a paste-and-run console command (loads it into the
  // golfballs.com cart). This is the "copy as a command" action on each card.
  const copySaved = (entry) => buildProposalDraft(
      // Cart = PAID lines + the promotion; the site re-grants the free dozens on
      // load (they're stored only for the overview, so drop them here). Carry the
      // coupon through so the loaded cart actually applies it — without this the
      // proposal loaded as PromotionEmpty and lost its free items.
      linesFromSaved(entry, rid).filter((l) => !l.free),
      { promotion: (entry.promotion && entry.promotion.promo) ? entry.promotion : null })
    .then((r) => copyToClipboard(r.command).then(() => {
      const skip = r.skipped && r.skipped.length ? ` · ${r.skipped.length} skipped` : '';
      toast?.success?.(`“${entry.name}” copied — paste in the golfballs.com console to load ${r.itemCount} item${r.itemCount > 1 ? 's' : ''}${skip}`);
    }))
    .catch((e) => { toast?.error?.('Couldn’t build the command — ' + ((e && e.message) || 'unknown error')); throw e; });

  const deleteSaved = (id) => removeSavedProposal(id).then((next) => setSavedProposals(next));

  // Hand-edit a split's unit price inside a SAVED draft's breakdown → persist back
  // to storage and re-render the open breakdown with the new numbers.
  const editSavedSplitPrice = (entry, srcIndex, splitIndex, price) => {
    const nextLines = (entry.lines || []).map((l, li) => li !== srcIndex ? l
      : { ...l, splits: (l.splits || []).map((s, si) => si !== splitIndex ? s : { ...s, price, priceEdited: true }) });
    const nextItem = { ...entry, lines: nextLines };
    setSavedProposals((prev) => prev.map((p) => (p.id === nextItem.id ? nextItem : p)));
    setDetail((d) => (d && d.kind === 'saved' && d.item && d.item.id === nextItem.id) ? { ...d, item: nextItem } : d);
    updateSavedProposal(nextItem).catch((e) => toast?.error?.('Couldn’t save price — ' + ((e && e.message) || 'unknown error')));
  };

  // Save-to-account (publish) — push the current proposal to a CRM opportunity.
  // Resolves so the panel can drive its success flash; surfaces failures as a
  // toast (errors-only). `accountSaveSeq` bumps to tell ProposalPanel to open its
  // account form (used by the draft "Save to account" shortcut).
  const [accountSaveSeq, setAccountSaveSeq] = useState(0);
  const saveToAccount = (opts) => {
    if (!proposal.length) return Promise.reject(new Error('Proposal is empty'));
    return saveProposalToOpportunity(proposal, { ...opts, promotion: proposalPromo && proposalPromo.promotion })
      .then((r) => {
        toast?.success?.(`Saved “${opts.name}” to opportunity ${opts.opportunityID}`);
        return r;
      })
      .catch((e) => { toast?.error?.('Couldn’t save to account — ' + ((e && e.message) || 'unknown error')); throw e; });
  };
  // Draft → account: load the draft into the proposal, open it, and pop the
  // account form so the rep can edit then publish.
  const loadSavedToAccount = (entry) => { loadSaved(entry); setAccountSaveSeq((n) => n + 1); };
  // New-opportunity (future) — the "+" beside the opportunity dropdown. Creating
  // an opportunity from here isn't built yet (fields TBD), so give honest
  // feedback instead of a silent no-op; pick an existing opportunity or create
  // it in the CRM for now.
  const addOpportunity = (_accountId) => {
    window.__gbToast?.info?.("Creating a new opportunity isn't available here yet — pick an existing one or add it in the CRM.", { duration: 3200 });
  };

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
  const proposalToEmailSource = (lines, name, opts = {}) => {
    const rows = []; let total = 0; let freeTotal = 0;
    for (const l of (lines || [])) {
      const p = l.product || {};
      const gs = l.decoration && l.decoration.giftSet;
      // A gift-set line is identified by the SET (name + size + the ball it wraps)
      // and shows the boxed gift-set render — not the bare ball.
      const title = gs ? (gs.name || 'Gift set') : (p.title || '');
      const subtitle = gs ? [giftSetSizeLabel(gs), p.title].filter(Boolean).join(' · ') : ((l.variant && l.variant.values && l.variant.values.style) || '');
      const img = (gs ? lineGiftImg(l) : null) || p.img || '';
      const imprint = lineImprint(l.decoration);
      const isFree = !!l.free;
      // Retail/"was" unit = the higher of MSRP, the 1-qty ladder price, and the
      // base price — used to show a red strike when the quoted price is below it
      // (a sale or a volume break).
      const brks = p.breaks || [];
      const retailUnit = Math.max(Number(p.orig) || 0, (brks[0] && Number(brks[0].p)) || 0, Number(p.price) || 0);
      for (const s of (l.splits || [])) {
        const qty = s.qty || 0;
        // HAR layout: a FREE line is shown at its FULL price (so the subtotal
        // includes it) and the promotion nets it off at the bottom. Unit comes
        // from the promotion's authoritative per-item value when present, else
        // the ladder price at that qty, else the retail unit.
        let unitPrice;
        if (isFree) {
          const fullVal = Number(l.freeValue) || 0;
          unitPrice = (qty > 0 && fullVal > 0) ? Math.round((fullVal / qty) * 100) / 100
            : (priceAtBreaks(brks, qty) ?? retailUnit ?? 0);
        } else {
          unitPrice = s.price || 0;
        }
        const lineTotal = Math.round(qty * unitPrice * 100) / 100;
        total += lineTotal;
        if (isFree) freeTotal += lineTotal;
        const origUnit = (!isFree && retailUnit > unitPrice + 0.005) ? Math.round(retailUnit * 100) / 100 : null;
        // `lineId` lets the email composer attach 3D snapshot previews back to the
        // right rows (one line can span multiple split rows). `parentLineId` ties
        // a free row to the line that earned it (Separated-theme grouping).
        // `imprint` drives the preview card's spec line.
        rows.push({ lineId: l.id, parentLineId: l.parentLineId || null, brand: (p.brand && p.brand !== 'Custom') ? p.brand : '', title, subtitle, img, qty, unitPrice, lineTotal,
          origUnit, origTotal: origUnit != null ? Math.round(qty * origUnit * 100) / 100 : null, free: isFree, imprint });
      }
    }
    const promotion = opts.promotion || null;
    const freePromo = !!(promotion && promotion.promoType === 'FREE_QUANTITY');
    const savings = promotion ? promoDiscount(promotion) : 0;
    // HAR totals: Subtotal (incl. free lines at full price) → −Promotion →
    // Total. For FREE_QUANTITY the discount = OUR summed free-line value (+ any
    // order-level $ off) so Subtotal − Promotion lands exactly on the paid sum
    // even when a ladder fallback stood in for the site's number; a monetary
    // promo keeps the site's discount as before.
    const orderOff = freePromo ? (Number(promotion.orderLevelDiscount) || 0) : 0;
    const discount = freePromo ? Math.round((freeTotal + orderOff) * 100) / 100 : savings;
    // `rawLines` carries the product + decoration so the composer can render the
    // personalization snapshots; `lines` stays the flat display rows.
    return { groupName: 'Your Custom Order', optionName: name || 'Option 1', lines: rows, rawLines: lines || [],
      total: Math.round(total * 100) / 100, discount, savings, freePromo, promoCode: (promotion && promotion.promo) || '', cartLink: opts.cartLink || null, onSubmit: opts.onSubmit || null };
  };
  const openProposalEmail = (lines, name, opts) => { if (lines && lines.length) setEmailSource(proposalToEmailSource(lines, name, opts)); };
  // Combined email source for several proposals at once: one `section` per
  // proposal (each rendered with the chosen template, stacked + divided), plus a
  // merged rawLines so the 3D-preview generator covers every line.
  const cartLinkOf = (it) => it.cartID ? `https://www.golfballs.com/cart?cartID=${it.cartID}&utm_medium=Proposal&utm_source=Proposal-${it.cartID}` : null;
  // A render-ready imprint chip → the {label, detail, colorHex} shape the
  // checkout's ImprintList consumes (replaces the generic "send artwork" note).
  const imprintRow = (chip) => {
    if (chip.kind === 'text') {
      const detail = (chip.lines || []).filter((l) => l != null && String(l).trim() !== '').join(' / ');
      return { label: 'Personalized text', detail, colorHex: chip.color };
    }
    if (chip.kind === 'monogram') {
      return { label: 'Monogram', detail: String(chip.text || '').toUpperCase(), colorHex: chip.color };
    }
    // logo / icon
    return { label: chip.icon ? `Icon · ${chip.iconName}` : 'Custom logo', detail: chip.fileName || '' };
  };

  // Checkout source model from resolved proposal entries → priced rows the
  // CheckoutComposer consumes. Single proposal only.
  const checkoutSourceFromEntries = (entries, name, company) => {
    const lines = (entries || []).filter((e) => !e.free && e.product).map((e, i) => {
      const qty = (e.splits || []).reduce((a, x) => a + (x.qty || 0), 0);
      const goods = (e.splits || []).reduce((a, x) => a + (x.qty || 0) * (x.price || 0), 0);
      const chips = decoImprints(e.decoration);
      return { id: (e.product.id || 'p') + '-' + i, product: e.product, qty, unitPrice: qty ? goods / qty : 0, setup: 0, goods, lineTotal: goods, decorated: chips.length > 0, imprints: chips.map(imprintRow) };
    });
    return { name: name || 'Proposal', company: company || '', lines, subtotal: lines.reduce((a, l) => a + l.goods, 0), setupTotal: 0, units: lines.reduce((a, l) => a + l.qty, 0) };
  };
  const buildMultiEmailSource = (items) => {
    const sections = (items || []).map((it) => proposalToEmailSource(linesFromSaved(it, rid), it.name, { promotion: it.promotion, cartLink: cartLinkOf(it) }));
    return {
      sections,
      rawLines: sections.flatMap((s) => s.rawLines || []),
      lines: [],
      total: Math.round(sections.reduce((a, s) => a + (s.total || 0), 0) * 100) / 100,
      groupName: 'Your Custom Order', optionName: `${sections.length} proposals`,
    };
  };

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

  // Per-line cost auto-loads on demand (the margin breakdown fetches the SKUs it
  // needs from the gbcadmin Inventory endpoint), so there's no manual bulk sync.

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
  const favoriteCount = useMemo(() => catalog.reduce((count, product) => count + (favoriteSet.has(String(product.id)) ? 1 : 0), 0), [catalog, favoriteSet]);

  // Readable label for the current selection (footer + "in <x>" text).
  const selLabel = sel === 'all' ? '' : sel === 'favorites' ? 'Favorites' : sel.startsWith('dept:') ? sel.slice(5) : sel;

  // Products in the current sidebar selection.
  const inCat = useMemo(() => {
    if (sel === 'all') return catalog;
    if (sel === 'favorites') return catalog.filter((product) => favoriteSet.has(String(product.id)));
    if (sel.startsWith('dept:')) { const d = sel.slice(5); return catalog.filter((p) => p.dept === d); }
    return catalog;
  }, [sel, catalog, favoriteSet]);
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
  const searchingAll = !!(query.trim() && !query.startsWith('/') && !selFromCmd && sel !== 'favorites');
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
      <div style={{ margin: 'auto', flexShrink: 0, transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform .28s cubic-bezier(.4,0,.2,1)' }}>
        {/* Flex row: catalog card + proposal side column. The row WIDENS when
            the proposal opens, so the centered catalog
            slides left and the proposal emerges beside it — both visible. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: CATALOG_CARD_HEIGHT, width: catalogWidth, transition: 'width .42s cubic-bezier(.4,0,.2,1)' }}>
        <motion.div
          initial={{ opacity: 0, scale: .96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          style={{ width: CATALOG_CARD_WIDTH, height: '100%', flex: '0 0 auto', zIndex: 2, position: 'relative', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', flexDirection: 'column' }}>
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
          {refreshing ? (
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: progress && progress.total ? `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%` : '35%',
              background: 'var(--gb-brand-label)', borderRadius: 2,
              transition: 'width .35s ease',
              animation: progress && progress.total ? 'none' : 'gc-indef 1.1s ease-in-out infinite',
            }} />
          ) : null}
        </div>

        {/* Body — also the positioning context for the slide-over panels,
            so they span the sidebar's height (header + footer stay visible). */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 7px 7px -7px rgba(0,0,0,.16), inset 0 -7px 7px -7px rgba(0,0,0,.16)' }}>
          <CategoryRail sel={sel} onSelect={(s) => { const alreadyBrowsing = view === 'catalog'; setView('catalog'); setSelFromCmd(false); setSel((cur) => (alreadyBrowsing && cur === s ? 'all' : s)); }} total={catalog.length}
            depts={depts} deptCounts={deptCounts} favoriteCount={favoriteCount}
            view={view} onSetView={setView} savedCount={savedProposals.length} customCount={customItems.length} currentCount={currentProposals.length}
            dock={proposal.length > 0 && !proposalOpen ? <ProposalDock key="dock" count={proposal.length} total={propTotal} active={proposalOpen} onOpen={() => setProposalOpen(true)} /> : null} />
          <AnimatePresence mode="wait" initial={false}>
          {view === 'proposals' ? (
            <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <AnimatePresence initial={false}>
              {savedTransfer && (
                <StoreTransferPanel key="proposal-transfer" mode={savedTransfer.mode} items={savedProposals}
                  api={{ create: createProposalStore, importLink: importProposalStore, importFile: importProposalStoreFile, buildFile: buildProposalStoreFile }}
                  labels={{ defaultName: 'My proposal set', title: 'Share saved proposals', subtitle: 'Share with a revocable link or a durable JSON file.', linkPlaceholder: 'Paste a proposal-store link…', filenameBase: 'golfballs-proposal-store' }}
                  onMode={(mode) => setSavedTransfer({ mode })}
                  onClose={() => setSavedTransfer(null)}
                  onImported={(res) => { toast?.success?.(`Imported ${res.added} new + ${res.updated} updated${res.name ? ` from ${res.name}` : ''}`, { duration: 4000 }); setSavedTransfer(null); }}
                  onShared={() => {}} />
              )}
            </AnimatePresence>
            <SavedGallery items={savedProposals} loadedId={loadedId}
              current={proposal} onOpen={(item) => setDetail({ kind: 'saved', item })} onOpenCurrent={() => setDetail({ kind: 'current' })}
              onLoad={loadSaved} onCopy={copySaved} onDelete={deleteSaved} onSaveToAccount={loadSavedToAccount}
              onEmail={(entry) => openProposalEmail(linesFromSaved(entry, rid), entry.name)}
              headerAction={(
                <IconBtn size="md" title="Share or import saved proposals"
                  icon={<I.link />}
                  onClick={() => setSavedTransfer((cur) => (cur ? null : { mode: savedProposals.length ? 'share' : 'import' }))} />
              )}
              selectedIds={selPropIds} onToggleSelect={toggleSelProp} onClearSelection={() => setSelProps([])}
              onOpenMulti={() => { if (selProps.length) setDetail({ kind: 'multi', items: selProps }); }} />
          </motion.div>
          ) : view === 'current' ? (
            <motion.div key="current" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            <SavedGallery items={currentProposals} loadedId={loadedId} hideCurrent readOnly
              title="Current Proposals" headerIcon={<I.card size={16} />}
              subtitleText={pageContext.accountId ? <>Live from the CRM{pageContext.accountName ? ` · ${pageContext.accountName}` : ''} · click a card for its breakdown</> : 'Open from a CRM account to see its proposals'}
              loading={currentLoading}
              notice={!pageContext.accountId ? { ...CATALOG_ACCOUNT_CONTEXT_NOTICE, icon: <I.user size={15} /> } : undefined}
              error={pageContext.accountId ? currentError : undefined}
              onRefresh={pageContext.accountId ? loadCurrentProposals : undefined}
              emptyTitle="No active proposals" emptyText="This account’s open opportunities have no saved proposals yet."
              subtitleOf={(it) => it.opportunitySubject || (it.contactName) || ''}
              onOpen={(item) => setDetail({ kind: 'crm', item })} onLoad={loadSaved}
              selectedIds={selPropIds} onToggleSelect={toggleSelProp} onClearSelection={() => setSelProps([])}
              onOpenMulti={() => { if (selProps.length) setDetail({ kind: 'multi', items: selProps }); }} />
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
                {/* gridAutoRows pins every row to an exact integer height. Under the
                mount root's CSS `zoom`, content-sized tracks pick up fractional
                heights that mis-round, so a card renders a hair taller than its
                track and the next row creeps up into it. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gridAutoRows: `${catalogRowHeight(compact)}px`, gap: compact ? 10 : 12 }}>
                  {/* Small sets animate per-card; large sets render a windowed
                      slice (grown on scroll by onGridScroll) so the DOM never
                      holds all ~3,100 cards and the open animation stays smooth. */}
                  {animateCards ? (
                    <AnimatePresence>
                      {shown.map((p) => (
                        <motion.div key={p.id} initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }} transition={{ duration: .17, ease: [0.32, 0.72, 0, 1] }}>
                          <ProductCard p={p} compact={compact} showRating={showRating}
                            active={selected && selected.id === p.id} inProposal={inProposal(p.id)}
                            favorite={favoriteSet.has(String(p.id))} onToggleFavorite={toggleFavorite}
                            onAdd={addToProposal} onClick={() => setSelected(p)} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  ) : (
                    shown.map((p) => (
                      <ProductCard key={p.id} p={p} compact={compact} showRating={showRating}
                        active={selected && selected.id === p.id} inProposal={inProposal(p.id)}
                        favorite={favoriteSet.has(String(p.id))} onToggleFavorite={toggleFavorite}
                        onAdd={addToProposal} onClick={() => setSelected(p)} />
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
            {(view === 'proposals' || view === 'current') && detail && (() => {
              const close = () => setDetail(null);
              if (detail.kind === 'multi') {
                const its = detail.items || [];
                const entries = its.flatMap((it) => resolveSavedEntry(it).entries);
                const units = entries.reduce((s, e) => s + e.splits.reduce((a, x) => a + (x.qty || 0), 0), 0);
                return (
                  <SavedDetail key="bd-multi" title={`${its.length} proposals`} subtitle={`Combined · ${units} units · ${entries.length} lines`}
                    badge={<Tag tone="brand" size="sm" icon={<I.bookmark size={9} />}>{its.length} selected</Tag>}
                    entries={entries} onClose={close}
                    buildEmailSource={() => buildMultiEmailSource(its)} />
                );
              }
              if (detail.kind === 'crm') {
                const it = detail.item; const r = resolveSavedEntry(it);
                return (
                  <SavedDetail key={'bd-' + it.id} title={it.name}
                    subtitle={`${it.opportunitySubject || 'Opportunity ' + it.opportunityID} · ${r.units} units`}
                    badge={<Tag tone="brand" size="sm" icon={<I.card size={9} />}>Current</Tag>}
                    entries={r.entries} loaded={loadedId === it.id} onClose={close}
                    promo={it.promotion && it.promotion.promo ? { code: it.promotion.promo, promotion: it.promotion } : null}
                    buildEmailSource={() => proposalToEmailSource(linesFromSaved(it, rid), it.name, {
                      promotion: it.promotion,
                      cartLink: it.cartID ? `https://www.golfballs.com/cart?cartID=${it.cartID}&utm_medium=Proposal&utm_source=Proposal-${it.cartID}` : null,
                      onSubmit: async ({ message, expiration } = {}) => {
                        try {
                          await submitProposalEmail({ opportunityID: it.opportunityID, cartID: it.cartID, name: it.name, expiration: expiration || it.expiration, total: r.total, adminId: it.adminId, contactId: it.contactId, subject: it.opportunitySubject, message });
                          toast?.success?.('Proposal tracked to opportunity ' + it.opportunityID);
                        } catch (e) { toast?.error?.('Couldn’t track proposal — ' + ((e && e.message) || 'unknown error')); throw e; }
                      },
                    })}
                    buildCheckoutSource={() => checkoutSourceFromEntries(r.entries, it.name, it.opportunitySubject || it.contactName || '')}
                    onLoad={() => { close(); loadSaved(it); }} />
                );
              }
              if (detail.kind === 'current') {
                return (
                  <SavedDetail key="bd-current" current title="Current proposal" subtitle="Live working set · unsaved"
                    badge={<Tag tone="brand" size="sm" icon={<Dot tone="brand" size={5} />}>Unsaved</Tag>}
                    entries={proposalWithFree} onClose={close}
                    promo={proposalPromo} onApplyPromo={applyPromo} onClearPromo={clearPromo} onCheckPromo={checkPromo}
                    onPatchSplit={(entryIndex, _src, splitIndex, price) => setProposal((prev) => prev.map((pl, li) => li !== entryIndex ? pl
                      : { ...pl, splits: pl.splits.map((s, si) => si !== splitIndex ? s : { ...s, price, priceEdited: true }) }))}
                    buildEmailSource={() => proposalToEmailSource(proposalWithFree, '', { promotion: proposalPromo && proposalPromo.promotion })}
                    buildCheckoutSource={() => checkoutSourceFromEntries(proposalWithFree, 'Current proposal', '')}
                    onOpenProposal={() => { close(); setProposalOpen(true); }} />
                );
              }
              const it = detail.item; const r = resolveSavedEntry(it);
              return (
                <SavedDetail key={'bd-' + it.id} title={it.name} subtitle={`${fmtSavedDate(it.date)} · ${r.units} units`}
                  badge={<Tag tone="neutral" size="sm" icon={<I.bookmark size={9} />}>Draft</Tag>}
                  entries={r.entries} loaded={loadedId === it.id} onClose={close}
                  promo={it.promotion && it.promotion.promo ? { code: it.promotion.promo, promotion: it.promotion } : null}
                  onPatchSplit={(_entryIndex, srcIndex, splitIndex, price) => editSavedSplitPrice(it, srcIndex, splitIndex, price)}
                  buildEmailSource={() => proposalToEmailSource(linesFromSaved(it, rid), it.name, { promotion: it.promotion })}
                  buildCheckoutSource={() => checkoutSourceFromEntries(r.entries, it.name, it.company || '')}
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
            {special && <> · <b style={{ color: 'var(--gb-success-fg)' }}>{(SPECIAL_CMDS.find((s) => s.id === special) || {}).label}</b></>}
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
        <div style={{ flex: proposalOpen ? `0 0 ${CATALOG_PROPOSAL_WIDTH}px` : '0 0 0px', height: '100%', position: 'relative', overflow: 'visible', transition: 'flex-basis .42s cubic-bezier(.4,0,.2,1)' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 400, opacity: proposalOpen ? 1 : 0, pointerEvents: proposalOpen ? 'auto' : 'none', transition: 'opacity .24s ease' }}>
            <ProposalPanel proposal={proposal} onClose={() => setProposalOpen(false)}
              onPatchSplit={patchSplit} onAddSplit={addSplit} onRemoveSplit={removeSplit}
              onRemoveLine={removeLine} onSaveDraft={saveDraft} onMergeImprint={mergeImprintOnLine}
              onApplyLogoToAll={applyLogoToAllEmpty}
              onRemoveFront={removeFrontImprint} onRemoveSecond={removeSecondPole}
              pageContext={pageContext} onSaveToAccount={saveToAccount} onAddOpportunity={addOpportunity} accountSaveSeq={accountSaveSeq}
              onEmail={() => openProposalEmail(proposalWithFree, '', { promotion: proposalPromo && proposalPromo.promotion })}
              promo={proposalPromo} onApplyPromo={applyPromo} onClearPromo={clearPromo} onCheckPromo={checkPromo}
              onClear={() => { setProposal([]); setLoadedFree([]); setProposalOpen(false); }} />
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
