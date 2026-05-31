import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Btn, IconBtn, Tag, Dot } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { loadCatalog, GIFT_CATALOG_SEED } from '../lib/giftCatalog.js';

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
    @keyframes gb-spin { to { transform: rotate(360deg); } }`;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Local icons (not in the shared library) ───────────────── */
const Gift  = (p) => <Icon {...p}><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12h18M12 8v13M12 8S10.5 3.5 8 4.2C6 4.8 6.6 8 8.5 8M12 8s1.5-4.5 4-3.8C18 4.8 17.4 8 15.5 8"/></Icon>;
const StarI = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.05 1.1-6.47-4.7-4.58 6.5-.95z"/></Icon>;
const Layers= (p) => <Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></Icon>;
const ArrowL= (p) => <Icon {...p} strokeWidth={2.2}><path d="M19 12H5M12 19l-7-7 7-7"/></Icon>;
const TagI  = (p) => <Icon {...p}><path d="M20.6 13.4L13 21a1.7 1.7 0 01-2.4 0L3 13.4A1.7 1.7 0 012.5 12V4.5A1.5 1.5 0 014 3h7.5a1.7 1.7 0 011.2.5l7.9 7.9a1.7 1.7 0 010 2.4z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></Icon>;

const usd = (n) => (n == null ? '—' : '$' + Number(n).toFixed(2));

const CAT_TONE = {
  'Golf Balls': 'brand', 'Towels': 'info', 'Tees': 'success',
  'Gloves': 'warning', 'Divot Tools': 'brand', 'Poker Chips': 'info',
  'Ball Markers': 'success', 'Hat Clips': 'warning', 'Packaging': 'brand',
};

function SearchBox({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      flex: 1, minWidth: 0, height: 34, display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 11px', borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-fill-inverse-medium)',
      border: '1px solid ' + (focused ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
      boxShadow: focused ? 'var(--gb-focus-ring)' : 'none',
      transition: 'all var(--gb-anim)',
    }}>
      <I.search size={14} style={{ color: focused ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', flexShrink: 0 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="Search products or brands…"
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5, fontWeight: 500 }}
      />
      {value && (
        <span onClick={() => onChange('')} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}>
          <I.close size={13} />
        </span>
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

function ProductCard({ p, compact, showRating, priceFocus, active, onClick }) {
  const [hover, setHover] = useState(false);
  const logoFocus = priceFocus === 'logo' && p.logo;
  const heroPrice = logoFocus ? p.logo : p.price;
  const heroLabel = logoFocus ? 'logo imprint' : 'each';
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', cursor: 'pointer', background: 'var(--gb-surface-1)',
        border: '1px solid ' + (active ? 'var(--gb-brand-label)' : hover ? 'var(--gb-border-strong)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-lg)', padding: compact ? 9 : 11,
        boxShadow: active ? '0 0 0 1px var(--gb-brand-label), var(--gb-shadow-popover)' : hover ? 'var(--gb-shadow-popover)' : 'none',
        transform: hover && !active ? 'translateY(-2px)' : 'none',
        transition: 'transform var(--gb-anim), border-color var(--gb-anim), box-shadow var(--gb-anim)',
      }}>
      <div style={{ position: 'relative' }}>
        <ProductImage src={p.img} alt={p.title} pad={compact ? 12 : 16} />
        {p.logo && (
          <span style={{ position: 'absolute', top: 7, left: 7, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-strong)', border: '1px solid var(--gb-brand-tint-border)', backdropFilter: 'blur(4px)' }}>
            <Gift size={9} /> Logo
          </span>
        )}
      </div>
      <div style={{ paddingTop: compact ? 8 : 10, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 5, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brand}</span>
          {showRating && p.rating && <Rating value={p.rating} count={p.reviews} size={10} />}
        </div>
        <div style={{ fontSize: compact ? 12 : 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.32, letterSpacing: -.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: compact ? undefined : '2.6em' }}>{p.title}</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.5, fontFamily: 'var(--gb-font-mono)' }}>{usd(heroPrice)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{heroLabel}</span>
          </div>
          {!logoFocus && p.logo && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 'var(--gb-r-sm)', fontSize: 10, fontWeight: 600, color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)' }}>+logo {usd(p.logo)}</span>
          )}
          {logoFocus && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-text-muted)' }}>retail {usd(p.price)}</span>}
        </div>
      </div>
    </div>
  );
}

function PriceStat({ label, value, accent }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: accent ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)') }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', letterSpacing: -.5 }}>{value}</div>
    </div>
  );
}

function DetailPanel({ p, onClose }) {
  const openProduct = () => {
    if (!p.url) return;
    try { window.open('https://www.golfballs.com' + p.url + '.htm', '_blank', 'noopener'); } catch { /* ignore */ }
  };
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--gb-backdrop)', zIndex: 20, animation: 'cm-fade .18s ease' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(380px, 82%)', zIndex: 21, background: 'var(--gb-surface-modal)', borderLeft: '1px solid var(--gb-border-default)', boxShadow: '-20px 0 50px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', animation: 'dp-slide .26s cubic-bezier(.34,1.4,.64,1)' }}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <IconBtn size="sm" variant="ghost" icon={<ArrowL />} onClick={onClose} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Product detail</span>
          <div style={{ flex: 1 }} />
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <ProductImage src={p.img} alt={p.title} pad={26} radius="var(--gb-r-lg)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{p.brand}</span>
            <Tag tone="neutral" size="sm" icon={<Dot tone={CAT_TONE[p.cat] || 'brand'} size={5} />}>{p.cat}</Tag>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.25, letterSpacing: -.2 }}>{p.title}</div>
          <div style={{ marginTop: 8 }}><Rating value={p.rating} count={p.reviews} size={12} /></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <PriceStat label="Retail" value={usd(p.price)} />
            {p.logo && <PriceStat label="With logo" value={usd(p.logo)} accent />}
          </div>
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
          <Btn variant="primary" size="md" icon={<I.plus />} style={{ flex: 1 }} onClick={() => { /* quoting wired later */ }}>Add to quote</Btn>
        </div>
      </div>
    </>
  );
}

function CategoryRail({ cats, value, onChange, counts, total }) {
  const Row = ({ id, label, count, tone }) => {
    const on = value === id;
    const [hover, setHover] = useState(false);
    return (
      <div onClick={() => onChange(id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', transition: 'all var(--gb-anim)', background: on ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'transparent') }}>
        <Dot tone={tone} size={7} glow={on} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 700 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{count}</span>
      </div>
    );
  };
  return (
    <div style={{ width: 186, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 10px 8px' }}>Categories</div>
      <Row id="all" label="All products" count={total} tone="muted" />
      {cats.map((c) => <Row key={c} id={c} label={c} count={counts[c] || 0} tone={CAT_TONE[c] || 'brand'} />)}
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

export function GiftCatalog({ onClose, density = 'comfortable', showRating = true, priceFocus = 'retail' }) {
  ensureCatalogKeyframes();
  const [catalog, setCatalog] = useState(GIFT_CATALOG_SEED);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('popular');
  const [selected, setSelected] = useState(null);

  const compact = density === 'compact';

  // Seed paints instantly; the live pull replaces it when it lands.
  useEffect(() => {
    let live = true;
    loadCatalog().then((c) => { if (live) { if (c && c.length) setCatalog(c); setLoading(false); } });
    return () => { live = false; };
  }, []);

  const cats = useMemo(() => [...new Set(catalog.map((p) => p.cat))].sort((a, b) =>
    (catalog.filter((p) => p.cat === b).length) - (catalog.filter((p) => p.cat === a).length)), [catalog]);
  const catCounts = useMemo(() => { const m = {}; catalog.forEach((p) => { m[p.cat] = (m[p.cat] || 0) + 1; }); return m; }, [catalog]);

  const inCat = useMemo(() => (cat === 'all' ? catalog : catalog.filter((p) => p.cat === cat)), [cat, catalog]);
  const brands = useMemo(() => {
    const m = {}; inCat.forEach((p) => { m[p.brand] = (m[p.brand] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [inCat]);

  useEffect(() => { if (brand !== 'all' && !brands.find(([b]) => b === brand)) setBrand('all'); }, [brands]); // eslint-disable-line

  const results = useMemo(() => {
    let r = inCat;
    if (brand !== 'all') r = r.filter((p) => p.brand === brand);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((p) => p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q));
    }
    r = [...r];
    if (sort === 'popular') r.sort((a, b) => b.reviews - a.reviews);
    else if (sort === 'priceLow') r.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'priceHigh') r.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'name') r.sort((a, b) => a.title.localeCompare(b.title));
    return r;
  }, [inCat, brand, query, sort]);

  const colMin = compact ? 150 : 188;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 999990, padding: 24, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(1140px, 100%)', height: 'min(780px, 100%)', position: 'relative', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', flexDirection: 'column', animation: 'gc-pop .3s cubic-bezier(.34,1.56,.64,1)' }}>
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
          <SearchBox value={query} onChange={setQuery} />
          <SortSelect value={sort} onChange={setSort} />
          <IconBtn size="md" icon={<I.close />} onClick={onClose} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CategoryRail cats={cats} value={cat} onChange={setCat} counts={catCounts} total={catalog.length} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--gb-border-subtle)', overflowX: 'auto', flexShrink: 0 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0, marginRight: 2 }}>Brand</span>
              <BrandChip label="All" count={inCat.length} on={brand === 'all'} onClick={() => setBrand('all')} />
              {brands.map(([b, n]) => <BrandChip key={b} label={b} count={n} on={brand === b} onClick={() => setBrand(b)} />)}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {results.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--gb-text-muted)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I.search size={20} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No products match</div>
                  <Btn variant="secondary" size="sm" onClick={() => { setQuery(''); setBrand('all'); setCat('all'); }}>Clear filters</Btn>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: compact ? 10 : 12 }}>
                  {results.map((p) => (
                    <ProductCard key={p.id} p={p} compact={compact} showRating={showRating} priceFocus={priceFocus}
                      active={selected && selected.id === p.id} onClick={() => setSelected(p)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <Layers size={13} style={{ color: 'var(--gb-text-muted)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', fontWeight: 500 }}>
            Showing <b style={{ color: 'var(--gb-text-primary)' }}>{results.length}</b> of {catalog.length}
            {cat !== 'all' && <> in <b style={{ color: 'var(--gb-text-secondary)' }}>{cat}</b></>}
            {brand !== 'all' && <> · <b style={{ color: 'var(--gb-text-secondary)' }}>{brand}</b></>}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dot tone="brand" size={5} /> Logo imprint available
          </span>
        </div>

        {selected && <DetailPanel p={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
