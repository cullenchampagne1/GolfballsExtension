import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Btn, IconBtn, Tag, Dot } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { loadCatalog, GIFT_CATALOG_SEED, CATEGORY_ORDER, BRAND_ORDER } from '../lib/giftCatalog.js';
import { loadDevSettings, STORAGE_KEY as DEV_STORAGE_KEY } from '../lib/devSettings.js';

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
    @keyframes pp-rise { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
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

/* Highest custom-logo per-unit price (the smallest-qty tier) — shown
   on the card by default ("from" pricing), before volume discounts. */
const topPrice = (p) => (p.breaks && p.breaks.length ? Math.max(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));
const lowPrice = (p) => (p.breaks && p.breaks.length ? Math.min(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));

/* "/" quick-filters beyond category + brand. */
const SPECIAL_CMDS = [
  { type: 'special', id: 'sale', label: 'On sale / promo', match: (p) => isDeal(p) },
  { type: 'special', id: 'logo', label: 'Custom-logo ready', match: (p) => !!p.logo },
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
function CatGlyph({ id, size = 15, color = 'currentColor' }) {
  const Ico = (id === 'all' ? AllItemsIcon : CAT_ICON[id]) || AllItemsIcon;
  return <Ico size={size} style={{ color, flexShrink: 0 }} />;
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
                ? <CatGlyph id={c.id} size={14} color={i === hi ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)'} />
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

function ProductImage({ src, alt, pad = 16, radius = 'var(--gb-r-md)' }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#f4f4f1', borderRadius: radius, overflow: 'hidden', border: '1px solid var(--gb-border-subtle)' }}>
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #d8d8d2', borderTopColor: '#a8a89e', animation: 'gb-spin .8s linear infinite' }} />
        </div>
      )}
      <img src={src} alt={alt} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: pad, boxSizing: 'border-box', opacity: loaded ? 1 : 0, transition: 'opacity .3s ease' }} />
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

function ProductCard({ p, compact, showRating, active, inProposal, onClick }) {
  const [hover, setHover] = useState(false);
  const ring = active ? '0 0 0 1px var(--gb-brand-label), 0 2px 8px rgba(0,0,0,.09)' : hover ? '0 2px 7px rgba(0,0,0,.07)' : '';
  // Added-to-proposal reads as an internal brand glow (no add button/check).
  const glow = inProposal ? 'inset 0 0 0 1.5px var(--gb-brand-label), inset 0 0 22px -6px var(--gb-brand-label)' : '';
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', cursor: 'pointer', background: 'var(--gb-surface-1)',
        border: '1px solid ' + (active || inProposal ? 'var(--gb-brand-label)' : hover ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-lg)', padding: compact ? 9 : 11,
        boxShadow: [ring, glow].filter(Boolean).join(', ') || 'none',
        transform: hover && !active ? 'translateY(-1px)' : 'none',
        transition: 'transform var(--gb-anim), border-color var(--gb-anim), box-shadow var(--gb-anim)',
      }}>
      <div style={{ position: 'relative' }}>
        <ProductImage src={p.img} alt={p.title} pad={compact ? 12 : 16} />
        {hasPromo(p) && (
          <span style={{ position: 'absolute', top: 7, left: 7, display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: .3, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-success-solid, #2e9e5b)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>{p.promo.label}</span>
        )}
        {onSale(p) && (
          <span style={{ position: 'absolute', top: 7, right: 7, display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-danger, #e5484d)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>Sale</span>
        )}
      </div>
      <div style={{ paddingTop: compact ? 8 : 10, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 5, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brand}</span>
          {showRating && p.rating && <Rating value={p.rating} count={p.reviews} size={10} />}
        </div>
        <div style={{ fontSize: compact ? 12 : 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.32, letterSpacing: -.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: compact ? undefined : '2.6em' }}>{p.title}</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.5, fontFamily: 'var(--gb-font-mono)' }}>{usd(topPrice(p))}</span>
            {onSale(p) && p.orig && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: 'var(--gb-font-mono)' }}>{usd(p.orig)}</span>}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>each</span>
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
  const openProduct = () => {
    if (!p.url) return;
    try { window.open('https://www.golfballs.com' + p.url + '.htm', '_blank', 'noopener'); } catch { /* ignore */ }
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <ProductImage src={p.img} alt={p.title} pad={26} radius="var(--gb-r-lg)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</span>
            <Tag tone="neutral" size="sm" icon={<CatGlyph id={p.cat} size={12} />}>{p.cat}</Tag>
            {onSale(p) && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 'var(--gb-r-pill)', fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#fff', background: 'var(--gb-danger, #e5484d)' }}>Sale −{usd(p.orig - p.price)}</span>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.25, letterSpacing: -.2 }}>{p.title}</div>
          <div style={{ marginTop: 8 }}><Rating value={p.rating} count={p.reviews} size={12} /></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <PriceStat label="Per unit" value={usd(topPrice(p))} accent was={onSale(p) ? usd(p.orig) : null} />
            {lowPrice(p) < topPrice(p) && <PriceStat label="Volume price" value={usd(lowPrice(p))} />}
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
                      <span style={{ fontSize: 13, fontWeight: 800, color: best ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', minWidth: 58, textAlign: 'right' }}>{usd(b.p)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.4 }}>Per-unit price drops with order volume — quote the tier that matches the gift run.</div>
            </div>
          )}
          {p.mods > 0 && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
              <TagI size={14} style={{ color: 'var(--gb-text-tertiary)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500 }}>
                <b style={{ color: 'var(--gb-text-primary)' }}>{p.mods}</b> personalization {p.mods === 1 ? 'option' : 'options'} available
              </span>
            </div>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', gap: 8, flexShrink: 0, background: 'var(--gb-fill-inverse-strong)' }}>
          <Btn variant="secondary" size="md" icon={<I.eye />} style={{ flex: 1 }} onClick={openProduct}>View product</Btn>
          {inProposal ? (
            <Btn variant="secondary" size="md" icon={<I.check />} style={{ flex: 1.2 }} onClick={onOpenProposal}>In proposal</Btn>
          ) : (
            <Btn variant="primary" size="md" icon={<I.plus />} style={{ flex: 1.2 }} onClick={() => onAdd && onAdd(p)}>Add to proposal</Btn>
          )}
        </div>
      </motion.div>
    </>
  );
}

function CatRow({ id, label, count, value, onChange }) {
  const on = value === id;
  const [hover, setHover] = useState(false);
  const col = on ? 'var(--gb-brand-label)' : hover ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)';
  return (
    <div onClick={() => onChange(id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', flexShrink: 0, transition: 'all var(--gb-anim)', background: on ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'transparent') }}>
      <CatGlyph id={id} size={15} color={col} />
      <span style={{ flex: 1, fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{count}</span>
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

function CategoryRail({ cats, value, onChange, counts, total, dock }) {
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 10px 8px', flexShrink: 0 }}>Categories</div>
      {/* Capped, scrollable list with a soft fade at the top/bottom edges. */}
      <div className="gb-gc-norail" style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)' }}>
        <CatRow id="all" label="All Items" count={total} value={value} onChange={onChange} />
        {cats.map((c) => <CatRow key={c} id={c} label={c} count={counts[c] || 0} value={value} onChange={onChange} />)}
      </div>
      <div style={{ flexShrink: 0, marginTop: 4 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '8px 10px 6px' }}>Saved</div>
        <SavedStub label="Previous orders" icon={<I.refresh size={14} />} />
        <SavedStub label="Preset proposals" icon={<I.card size={14} />} />
      </div>
      {dock && <div style={{ flexShrink: 0, marginTop: 8 }}>{dock}</div>}
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
  const p = line.product;
  const onQty = (q) => {
    const followTier = isTierPrice(p, split.qty, split.price);
    onChange({ qty: q, price: followTier ? priceAtQty(p, q) : split.price });
  };
  const tier = priceAtQty(p, split.qty);
  const custom = !isTierPrice(p, split.qty, split.price);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 0' }}>
      <QtyStepper value={split.qty} onChange={onQty} />
      <span style={{ fontSize: 11, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>×</span>
      <PriceField value={split.price} onChange={(pr) => onChange({ price: pr })} />
      {custom && p.breaks && (
        <span onClick={() => onChange({ price: tier })} title={`Reset to tier ${usd(tier)}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 600, color: 'var(--gb-brand-label)', cursor: 'pointer', fontFamily: 'var(--gb-font-mono)', flexShrink: 0, whiteSpace: 'nowrap' }}>↺ {usd(tier)}</span>
      )}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)', minWidth: 58, textAlign: 'right', flexShrink: 0 }}>{money(split.qty * split.price)}</span>
      <span onClick={canRemove ? onRemove : undefined} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: canRemove ? 'var(--gb-text-muted)' : 'var(--gb-text-ghost)', cursor: canRemove ? 'pointer' : 'default', opacity: canRemove ? 1 : .35 }}><I.close size={11} /></span>
    </div>
  );
}

function ProposalLine({ line, onPatchSplit, onAddSplit, onRemoveSplit, onRemove }) {
  const p = line.product;
  const lineTot = line.splits.reduce((s, x) => s + x.qty * x.price, 0);
  const lineUnits = line.splits.reduce((s, x) => s + x.qty, 0);
  return (
    <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', padding: 12 }}>
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
      <div style={{ marginTop: 8, borderTop: '1px solid var(--gb-border-subtle)' }}>
        {line.splits.map((s) => (
          <SplitRow key={s.id} line={line} split={s} canRemove={line.splits.length > 1} onChange={(patch) => onPatchSplit(s.id, patch)} onRemove={() => onRemoveSplit(s.id)} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
        <button onClick={onAddSplit} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-soft)', color: 'var(--gb-brand-label)', border: '1px dashed var(--gb-brand-tint-border)', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <I.plus size={10} /> Split tier
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{lineUnits} units</span>
      </div>
    </div>
  );
}

/* Compact dock pinned to the bottom of the left rail — spans the
   sidebar width (220px rail − 12px gutters = 196). */
function ProposalDock({ count, total, active, onOpen }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: '100%', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 13, padding: '7px 9px',
        background: (h || active) ? 'var(--gb-brand-tint-strong)' : 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)', transition: 'background var(--gb-anim)',
        animation: 'pp-rise .24s cubic-bezier(.34,1.5,.64,1)',
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
    </div>
  );
}

function ProposalPanel({ proposal, onClose, onPatchSplit, onAddSplit, onRemoveSplit, onRemoveLine, onClear }) {
  const total = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const units = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty, 0), 0);
  return (
    <>
      <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}
        style={{ position: 'absolute', inset: 0, background: 'var(--gb-backdrop)', zIndex: 30 }} />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 460, damping: 40 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(440px, 90%)', zIndex: 31, background: 'var(--gb-surface-modal)', borderLeft: '1px solid var(--gb-border-default)', boxShadow: '-10px 0 28px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {proposal.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--gb-text-muted)', textAlign: 'center', padding: 24 }}>
              <div style={{ width: 46, height: 46, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.card size={20} /></div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No products yet</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 220 }}>Open a product and hit <b style={{ color: 'var(--gb-brand-label)' }}>Add to proposal</b> — then set quantities, prices, and split tiers here.</div>
            </div>
          ) : proposal.map((line) => (
            <ProposalLine key={line.id} line={line}
              onPatchSplit={(sid, patch) => onPatchSplit(line.id, sid, patch)}
              onAddSplit={() => onAddSplit(line.id)}
              onRemoveSplit={(sid) => onRemoveSplit(line.id, sid)}
              onRemove={() => onRemoveLine(line.id)} />
          ))}
        </div>
        {proposal.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-inverse-strong)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Estimated total</span>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)' }}>{units} units</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.6 }}>{money(total)}</span>
            </div>
            <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
              <Btn variant="secondary" size="md" icon={<I.copy />} style={{ flex: 1 }}>Save draft</Btn>
              <Btn variant="primary" size="md" icon={<I.send />} style={{ flex: 1.4 }}>Send proposal</Btn>
            </div>
          </div>
        )}
      </motion.div>
    </>
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
  const [catalog, setCatalog] = useState(GIFT_CATALOG_SEED);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selBrands, setSelBrands] = useState(() => new Set()); // empty = all brands
  const toggleBrand = (b) => setSelBrands((s) => { const n = new Set(s); n.has(b) ? n.delete(b) : n.add(b); return n; });
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('popular');
  const [selected, setSelected] = useState(null);
  const [special, setSpecial] = useState(null); // 'sale' | 'logo' | null
  const [proposal, setProposal] = useState([]);
  const [proposalOpen, setProposalOpen] = useState(false);

  const compact = density === 'compact';

  const inProposal = (id) => proposal.some((l) => l.id === id);
  const propTotal = proposal.reduce((s, l) => s + l.splits.reduce((a, x) => a + x.qty * x.price, 0), 0);
  const addToProposal = (p) => setProposal((prev) => {
    if (prev.some((l) => l.id === p.id)) return prev;
    // Default to the smallest tier so the line starts at the highest price.
    const qty = p.minQty || 1;
    return [...prev, { id: p.id, product: p, splits: [{ id: rid(), qty, price: priceAtQty(p, qty) }] }];
  });
  const patchSplit = (lineId, splitId, patch) => setProposal((prev) => prev.map((l) => l.id === lineId ? { ...l, splits: l.splits.map((s) => s.id === splitId ? { ...s, ...patch } : s) } : l));
  const addSplit = (lineId) => setProposal((prev) => prev.map((l) => { if (l.id !== lineId) return l; const last = l.splits[l.splits.length - 1]; return { ...l, splits: [...l.splits, { id: rid(), qty: last.qty, price: last.price }] }; }));
  const removeSplit = (lineId, splitId) => setProposal((prev) => prev.flatMap((l) => { if (l.id !== lineId) return [l]; const splits = l.splits.filter((s) => s.id !== splitId); return splits.length ? [{ ...l, splits }] : []; }));
  const removeLine = (lineId) => setProposal((prev) => prev.filter((l) => l.id !== lineId));

  // Seed paints instantly; the live pull replaces it when it lands.
  useEffect(() => {
    let live = true;
    loadCatalog().then((c) => { if (live) { if (c && c.length) setCatalog(c); setLoading(false); } });
    return () => { live = false; };
  }, []);

  // Manual re-index: force a fresh crawl past the 24h cache for new
  // prices/deals, then re-cache.
  const refresh = () => {
    if (loading) return;
    setLoading(true);
    loadCatalog({ force: true }).then((c) => { if (c && c.length) setCatalog(c); setLoading(false); });
  };

  const catCounts = useMemo(() => { const m = {}; catalog.forEach((p) => { m[p.cat] = (m[p.cat] || 0) + 1; }); return m; }, [catalog]);
  // Canonical "Shop by Type" order; only categories with products show.
  const cats = useMemo(() => {
    const present = new Set(catalog.map((p) => p.cat));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extra];
  }, [catalog]);

  const inCat = useMemo(() => (cat === 'all' ? catalog : catalog.filter((p) => p.cat === cat)), [cat, catalog]);
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
    const catCmds = cats.map((c) => ({ type: 'cat', id: c, label: c, count: catCounts[c] || 0 }));
    const rank = (b) => { const i = BRAND_ORDER.indexOf(b); return i === -1 ? BRAND_ORDER.length : i; };
    const brandCmds = Object.keys(brandCounts)
      .sort((a, b) => (rank(a) - rank(b)) || (brandCounts[b] - brandCounts[a]))
      .map((b) => ({ type: 'brand', id: b, label: b, count: brandCounts[b] }));
    return [...specCmds, ...catCmds, ...brandCmds];
  }, [cats, catCounts, brandCounts, catalog]);
  // Commands stack + combine: a brand toggles into the multi-select,
  // category replaces, special toggles — so "/titleist /callaway /sale"
  // narrows to both brands on sale.
  const onPickCommand = (c) => {
    if (!c) return;
    if (c.type === 'cat') setCat(c.id);
    else if (c.type === 'brand') toggleBrand(c.id);
    else if (c.type === 'special') setSpecial((cur) => (cur === c.id ? null : c.id));
    setQuery('');
  };
  const filtersActive = cat !== 'all' || selBrands.size > 0 || !!special || !!query;
  const clearAll = () => { setCat('all'); setSelBrands(new Set()); setSpecial(null); setQuery(''); };

  const results = useMemo(() => {
    let r = inCat;
    if (selBrands.size > 0) r = r.filter((p) => selBrands.has(p.brand));
    if (special) { const sc = SPECIAL_CMDS.find((s) => s.id === special); if (sc) r = r.filter(sc.match); }
    if (query.trim() && !query.startsWith('/')) {
      const q = query.toLowerCase();
      r = r.filter((p) => p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q));
    }
    r = [...r];
    if (sort === 'popular') r.sort((a, b) => b.reviews - a.reviews);
    else if (sort === 'priceLow') r.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'priceHigh') r.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title));
    return r;
  }, [inCat, selBrands, query, sort, special]);

  const colMin = compact ? 150 : 188;

  // Hold the first paint until the scale is known (avoids a size snap).
  if (scale == null) return null;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 999990, padding: 24, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', overflow: 'auto' }}>
      <div style={{ margin: 'auto', flexShrink: 0, zoom: `${scale}` }}>
        <div style={{ width: CARD_W, height: CARD_H, position: 'relative', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', flexDirection: 'column', animation: 'gc-pop .3s cubic-bezier(.34,1.56,.64,1)' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gift size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Corporate Gifting Catalog</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {catalog.length} products · custom-logo imprint pricing
              {loading && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite', display: 'inline-block' }} />}
            </div>
          </div>
          <SearchBox value={query} onChange={setQuery} commands={commands} onPick={onPickCommand} filtersActive={filtersActive} onClearAll={clearAll} />
          <SortSelect value={sort} onChange={setSort} />
          <IconBtn size="md" title="Rebuild catalog index" icon={<I.refresh style={{ animation: loading ? 'gb-spin .8s linear infinite' : 'none' }} />} onClick={refresh} />
          <IconBtn size="md" icon={<I.close />} onClick={onClose} />
        </div>

        {/* Body — also the positioning context for the slide-over panels,
            so they span the sidebar's height (header + footer stay visible). */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <CategoryRail cats={cats} value={cat} onChange={setCat} counts={catCounts} total={catalog.length}
            dock={proposal.length > 0 ? <ProposalDock count={proposal.length} total={propTotal} active={proposalOpen} onOpen={() => setProposalOpen(true)} /> : null} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="gb-gc-norail" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--gb-border-subtle)', overflowX: 'auto', flexShrink: 0, WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)', maskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0, marginRight: 2 }}>Brand</span>
              <BrandChip label="All" count={inCat.length} on={selBrands.size === 0} onClick={() => setSelBrands(new Set())} />
              {brands.map(([b, n]) => <BrandChip key={b} label={b} count={n} on={selBrands.has(b)} onClick={() => toggleBrand(b)} />)}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {results.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I.search size={20} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No products match</div>
                  <Btn variant="secondary" size="sm" onClick={clearAll}>Clear filters</Btn>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: compact ? 10 : 12 }}>
                  {results.map((p) => (
                    <ProductCard key={p.id} p={p} compact={compact} showRating={showRating}
                      active={selected && selected.id === p.id} inProposal={inProposal(p.id)} onClick={() => setSelected(p)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {selected && (
              <DetailPanel key="detail" p={selected} inProposal={inProposal(selected.id)} onAdd={addToProposal}
                onOpenProposal={() => { setSelected(null); setProposalOpen(true); }} onClose={() => setSelected(null)} />
            )}
            {proposalOpen && (
              <ProposalPanel key="proposal" proposal={proposal} onClose={() => setProposalOpen(false)}
                onPatchSplit={patchSplit} onAddSplit={addSplit} onRemoveSplit={removeSplit}
                onRemoveLine={removeLine} onClear={() => { setProposal([]); setProposalOpen(false); }} />
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <Layers size={13} style={{ color: 'var(--gb-text-muted)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', fontWeight: 500 }}>
            Showing <b style={{ color: 'var(--gb-text-primary)' }}>{results.length}</b> of {catalog.length}
            {cat !== 'all' && <> in <b style={{ color: 'var(--gb-text-secondary)' }}>{cat}</b></>}
            {selBrands.size > 0 && <> · <b style={{ color: 'var(--gb-text-secondary)' }}>{[...selBrands].join(', ')}</b></>}
            {special && <> · <b style={{ color: 'var(--gb-success-fg, #2e9e5b)' }}>{(SPECIAL_CMDS.find((s) => s.id === special) || {}).label}</b></>}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dot tone="brand" size={5} /> Logo imprint available
          </span>
        </div>

        </div>
      </div>
    </div>
  );
}
