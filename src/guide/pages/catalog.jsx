import React, { useState } from 'react';
import { I, Btn, Tag, Dot, Input, Dropdown, Segmented, Switch } from '../../ui/index.js';
import { GIcon } from '../lib/app.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import { LiveStage } from '../lib/stage.jsx';

/* ───────────────────────────────────────────────────────────────
   catalog.jsx — DEEP pages: Gift Catalog + Proposals & Quotes.

   GiftCatalog.jsx and ProposalEmail.jsx do NOT forward
   contained/portalContainer and lean on heavy Solr/network/page
   state, so we cannot mount them with <LiveModal>. Every snippet
   below is a hand-built, visually-faithful reproduction using the
   real src/ui primitives + --gb-* tokens (search bar, BROWSE
   sidebar, product grid with Sale/Promo/$ badges, the detail panel
   with its tier table + imprint tabs, the proposal line rows with
   split tiers + imprint pills + promo block + totals, and the email
   template selector + a mini rendered Classic email schedule).

   Copy is rewritten from the verified articles: gift-catalog,
   customizing-item, gift-sets, custom-service-items, supplier-import,
   gifting-glossary, proposal-panel, proposal-breakdown, promo-codes,
   build-email-proposal.
─────────────────────────────────────────────────────────────── */

const SURFACE = 'var(--gb-surface-1)';
const BORDER = '1px solid var(--gb-border-default)';
const RMD = 'var(--gb-r-md)';
const MONO = 'var(--gb-font-mono)';

/* tiny helpers ------------------------------------------------- */
function Badge({ tone, children }) {
  const map = {
    sale: { bg: 'var(--gb-error-fg, var(--gb-error))', fg: '#fff' },
    promo: { bg: 'var(--gb-success-fg, var(--gb-success))', fg: '#fff' },
  };
  const c = map[tone] || map.promo;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: c.fg, background: c.bg, boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>{children}</span>
  );
}

function CoinBadge() {
  return (
    <span title="Commissionable — custom-logo SKU" style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)' }}>$</span>
  );
}

/* a flat product-photo stand-in (no network) */
function Photo({ size = '100%', h = 86, ball }) {
  return (
    <div style={{ width: size, height: h, borderRadius: RMD, background: 'radial-gradient(circle at 38% 32%, var(--gb-surface-3), var(--gb-surface-1))', border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {ball ? (
        <div style={{ width: h * 0.62, height: h * 0.62, borderRadius: '50%', background: 'radial-gradient(circle at 36% 30%, #fff, #cfd4d9)', boxShadow: 'inset -4px -5px 9px rgba(0,0,0,.18)' }} />
      ) : (
        <GIcon.gift size={Math.min(h * 0.4, 34)} style={{ color: 'var(--gb-text-ghost)' }} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GIFT CATALOG — snippets
══════════════════════════════════════════════════════════════════ */

const FILTER_PALETTE = [
  { kind: 'Categories', items: ['Golf Balls', 'Apparel', 'Drinkware', 'Gift Sets'] },
  { kind: 'Brands', items: ['Titleist', 'Callaway', 'TaylorMade'] },
  { kind: 'Special', items: ['On sale / promo', 'Commissionable only'] },
];

function SearchBarSnippet() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('popular');
  const showPalette = q.startsWith('/');
  return (
    <MiniFrame width={460} label="catalog · search & filter" pad>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Input value={q} onChange={setQ} size="sm" leading={<I.search />} placeholder="Search products, or / to filter…" />
        </div>
        <Dropdown
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { id: 'popular', label: 'Most reviewed' },
            { id: 'priceLow', label: 'Price: low → high' },
            { id: 'priceHigh', label: 'Price: high → low' },
            { id: 'name', label: 'Name A–Z' },
          ]}
        />
        {(q || sort !== 'popular') && <Btn size="sm" variant="ghost" icon={<I.close />} onClick={() => { setQ(''); setSort('popular'); }} />}
      </div>
      {showPalette && (
        <div style={{ marginTop: 8, border: '1px solid var(--gb-brand-tint-border)', borderRadius: RMD, background: SURFACE, padding: 7 }}>
          {FILTER_PALETTE.map((g) => (
            <div key={g.kind} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '4px 6px 2px' }}>{g.kind}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 4px' }}>
                {g.items.map((it) => <Tag key={it} size="xs" tone={it.includes('sale') || it.includes('Commission') ? 'brand' : 'neutral'}>{it}</Tag>)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>
        {showPalette ? 'Filter palette — pick categories, brands, or special filters' : 'Type “/” to open the filter palette'}
      </div>
    </MiniFrame>
  );
}

const DEPTS = [
  { name: 'Golf Balls', n: 184 },
  { name: 'Apparel', n: 96 },
  { name: 'Drinkware', n: 52 },
  { name: 'Gift Sets', n: 38 },
  { name: 'Promotional Products', n: 71 },
];

function SidebarSnippet() {
  const [dept, setDept] = useState('Golf Balls');
  return (
    <MiniFrame width={250} label="catalog · BROWSE" pad>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 4px 6px' }}>Departments</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {DEPTS.map((d) => {
          const on = dept === d.name;
          return (
            <button key={d.name} onClick={() => setDept(on ? '' : d.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', color: 'inherit', fontFamily: 'inherit', textAlign: 'left' }}>
              <Dot tone={on ? 'brand' : 'muted'} glow={on} size={5} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{d.name}</span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: 'var(--gb-text-ghost)' }}>{d.n}</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '10px 0' }} />
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '0 4px 6px' }}>Saved</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
        <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>Saved Proposals · 4</span>
        <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>Current Proposals · 2</span>
      </div>
      <div style={{ marginTop: 10, padding: 9, borderRadius: RMD, border: '1px solid var(--gb-brand-tint-border)', background: 'var(--gb-brand-tint-soft)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <I.task size={14} style={{ color: 'var(--gb-brand-label)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-brand-label)' }}>Proposal · 3 lines</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>running total $1,284.00</div>
        </div>
        <I.chevr size={12} style={{ color: 'var(--gb-brand-label)' }} />
      </div>
    </MiniFrame>
  );
}

const PRODUCTS = [
  { id: 1, brand: 'Titleist', title: 'Pro V1 (dozen)', price: 54.99, from: true, sale: false, promo: false, coin: true, ball: true },
  { id: 2, brand: 'Callaway', title: 'Chrome Soft', price: 39.99, was: 47.99, sale: true, promo: false, coin: true, ball: true },
  { id: 3, brand: 'Yeti', title: 'Rambler 20oz', price: 35.0, sale: false, promo: true, coin: false, ball: false },
  { id: 4, brand: 'HPG', title: 'Quarter-Zip Pullover', price: 28.5, sale: false, promo: false, coin: false, ball: false, repo: 'HPG' },
];

function ProductCard({ p, onClick, active }) {
  return (
    <button onClick={onClick} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', padding: 9, borderRadius: RMD, border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: active ? 'var(--gb-brand-tint-soft)' : SURFACE, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {p.sale && <span style={{ position: 'absolute', top: 7, right: 7, zIndex: 2 }}><Badge tone="sale">Sale</Badge></span>}
      {p.promo && <span style={{ position: 'absolute', top: 7, left: 7, zIndex: 2 }}><Badge tone="promo">Promo</Badge></span>}
      <Photo h={78} ball={p.ball} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{p.brand}</span>
        {p.coin && <CoinBadge />}
        {p.repo && <Tag size="xs" tone="info">{p.repo}</Tag>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.25 }}>{p.title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: MONO }}>${p.price.toFixed(2)}</span>
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>each</span>
        {p.was && <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: MONO }}>${p.was.toFixed(2)}</span>}
        <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Add to proposal"><I.plus size={13} /></span>
      </div>
    </button>
  );
}

function GridSnippet() {
  const [sel, setSel] = useState(2);
  return (
    <MiniFrame width={440} label="catalog · product grid" pad>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
        {PRODUCTS.map((p) => <ProductCard key={p.id} p={p} active={sel === p.id} onClick={() => setSel(p.id)} />)}
      </div>
    </MiniFrame>
  );
}

const TIERS = [
  { qty: '1+', unit: 6.0, save: null },
  { qty: '12+', unit: 5.5, save: 0.5 },
  { qty: '50+', unit: 5.0, save: 1.0 },
  { qty: '144+', unit: 4.65, save: 1.35 },
];

function DetailSnippet() {
  const [inv, setInv] = useState(false);
  return (
    <MiniFrame width={350} label="catalog · product detail" pad>
      <Photo h={130} ball />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Tag size="xs" tone="neutral">Titleist</Tag>
        <Tag size="xs" tone="neutral">Golf Balls</Tag>
        <CoinBadge />
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: MONO, color: 'var(--gb-text-ghost)' }}>SKU 17PROV1</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gb-text-primary)', margin: '6px 0 2px' }}>Pro V1 (dozen)</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: MONO }}>$6.00</span>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>/ unit · from the 1+ tier</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: 4 }}>Cost $3.20/unit · used for margin</div>

      <div style={{ marginTop: 12, border: BORDER, borderRadius: RMD, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--gb-text-muted)', background: 'var(--gb-surface-1)', padding: '6px 10px', borderBottom: BORDER }}>
          <span>Qty</span><span>Per unit</span><span style={{ textAlign: 'right' }}>You save</span>
        </div>
        {TIERS.map((t) => (
          <div key={t.qty} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 11.5, padding: '6px 10px', borderTop: '1px solid var(--gb-border-subtle)', fontFamily: MONO }}>
            <span style={{ color: 'var(--gb-text-secondary)' }}>{t.qty}</span>
            <span style={{ color: 'var(--gb-text-primary)', fontWeight: 700 }}>${t.unit.toFixed(2)}</span>
            <span style={{ textAlign: 'right', color: t.save ? 'var(--gb-success-fg)' : 'var(--gb-text-ghost)' }}>{t.save ? `−$${t.save.toFixed(2)}` : '—'}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.5 }}>Per-unit price drops with order volume — quote the tier that matches the gift run.</div>

      <div style={{ marginTop: 10 }}>
        {inv ? (
          <div style={{ border: BORDER, borderRadius: RMD, padding: '7px 10px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, fontSize: 10.5, fontFamily: MONO }}>
            {['Avail', 'OnHand', 'Alloc', 'OnOrdr'].map((h) => <span key={h} style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{h}</span>)}
            {['2,140', '2,300', '160', '5,000'].map((v, i) => <span key={i} style={{ color: 'var(--gb-text-secondary)' }}>{v}</span>)}
          </div>
        ) : (
          <Btn size="sm" variant="secondary" icon={<GIcon.stack size={13} />} onClick={() => setInv(true)}>Check inventory</Btn>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        <Btn size="md" variant="ghost" icon={<I.link />}>View product</Btn>
        <Btn size="md" variant="primary" icon={<I.plus />} style={{ flex: 1 }}>Add to proposal</Btn>
      </div>
    </MiniFrame>
  );
}

/* ----- imprint customizer (faithful to giftCustomize: 8 underline tabs,
   a live 3D preview pane, type-specific controls, and the dual-pole row).
   Returned raw (no MiniFrame) so a LiveStage frames it for the walkthrough. */
const IMPRINTS = [
  { id: 'logo', label: 'Custom Logo' },
  { id: 'text', label: 'Personalized' },
  { id: 'mono', label: 'Monogram' },
  { id: 'photo', label: 'Photo' },
  { id: 'alignxl', label: 'AlignXL' },
  { id: 'idalign', label: 'IDAlign' },
  { id: 'icons', label: 'Icons' },
  { id: 'number', label: 'Player #' },
];
function CzGridPick({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
      {items.map((s, i) => (
        <div key={s} title={s} style={{ aspectRatio: '1', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (i === 0 ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: i === 0 ? 'var(--gb-brand-tint-soft)' : SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: 'var(--gb-text-muted)', textAlign: 'center', lineHeight: 1 }}>{s.slice(0, 6)}</div>
      ))}
    </div>
  );
}
function CustomizeSnippet() {
  const [tab, setTab] = useState('logo');
  const [dual, setDual] = useState(false);
  return (
    <div style={{ width: 460, maxWidth: '100%', background: 'var(--gb-surface-modal)', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div data-demo="cz-tabs" style={{ display: 'flex', gap: 1, borderBottom: '1px solid var(--gb-border-default)', padding: '0 8px', overflowX: 'auto' }}>
        {IMPRINTS.map((im) => {
          const on = tab === im.id;
          return <button key={im.id} onClick={() => setTab(im.id)} style={{ padding: '9px 9px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'transparent'), marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)' }}>{im.label}</button>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, padding: 12 }}>
        <div data-demo="cz-preview" style={{ width: 122, flexShrink: 0 }}>
          <Photo h={122} ball />
          <div style={{ fontSize: 9, color: 'var(--gb-text-muted)', textAlign: 'center', marginTop: 4 }}>live 3D preview</div>
        </div>
        <div data-demo="cz-controls" style={{ flex: 1, minWidth: 0 }}>
          {tab === 'logo' && (
            <div style={{ border: '1px dashed var(--gb-border-default)', borderRadius: RMD, padding: '18px 10px', textAlign: 'center', background: 'var(--gb-fill-subtle)' }}>
              <I.upload size={18} style={{ color: 'var(--gb-text-muted)' }} />
              <div style={{ fontSize: 11, color: 'var(--gb-text-secondary)', marginTop: 6 }}>Drop art or click to upload</div>
              <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 2 }}>Any image file · auto-aligned to the print area</div>
            </div>
          )}
          {tab === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Input size="sm" value="The Smith Open" onChange={() => {}} placeholder="Line 1 (17 chars)" />
              <Input size="sm" value="" onChange={() => {}} placeholder="Optional Line 2" />
              <Dropdown size="sm" value="kabel" onChange={() => {}} options={[{ id: 'kabel', label: 'Kabel Dm BT' }, { id: 'calibri', label: 'Calibri' }, { id: 'lucida', label: 'Lucida Handwriting' }, { id: 'bradley', label: 'Bradley Hand' }]} />
              <Segmented value="std" onChange={() => {}} size="sm" options={[{ id: 'std', label: 'Standard' }, { id: 'lg', label: 'Large' }, { id: 'max', label: 'Max' }]} />
            </div>
          )}
          {tab === 'mono' && (
            <div>
              <div style={{ marginBottom: 7 }}><CzGridPick items={['Circle', 'Hexagram', 'Gardenia', 'Vertical', 'Horizontal', 'Diagonal', 'Simple']} /></div>
              <Input size="sm" value="JMS" onChange={() => {}} placeholder="Initials" mono />
            </div>
          )}
          {tab === 'photo' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto', border: '2px dashed var(--gb-border-default)', background: 'var(--gb-fill-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.eye size={20} style={{ color: 'var(--gb-text-muted)' }} /></div>
              <div style={{ fontSize: 10.5, color: 'var(--gb-text-secondary)', marginTop: 6 }}>Auto-cropped to a circle</div>
            </div>
          )}
          {tab === 'alignxl' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <CzGridPick items={['Star', 'Thin', 'Medium', 'Thick', 'Dot', 'Skull', 'Martini', 'Wine']} />
              <Input size="sm" value="EST. 1932" onChange={() => {}} placeholder="Optional accent text" />
            </div>
          )}
          {tab === 'idalign' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <CzGridPick items={['Arrows', 'Dots', 'Stars', 'Chevron', 'Line', 'Martini', 'Wine', 'Bar']} />
              <Input size="sm" value="JMS" onChange={() => {}} placeholder="1–3 initials" mono />
            </div>
          )}
          {tab === 'icons' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Dropdown size="sm" value="dad" onChange={() => {}} options={[{ id: 'dad', label: "Dad / Father's Day" }, { id: 'drinks', label: 'Drinks' }, { id: 'usa', label: 'USA / Patriotic' }, { id: 'masters', label: 'Masters' }, { id: 'misc', label: 'Misc' }]} />
              <CzGridPick items={['🏌', '⛳', '🍺', '🏆', '🇺🇸', '★', '◆', '☘']} />
            </div>
          )}
          {tab === 'number' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Input size="sm" value="7" onChange={() => {}} placeholder="0–99" mono />
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>A jersey-style number. Adds “Additional Personalization · $5.00/dz”.</div>
            </div>
          )}
        </div>
      </div>
      <div data-demo="cz-dual" style={{ margin: '0 12px 12px', padding: 9, borderRadius: RMD, border: BORDER, background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Switch on={dual} size="sm" onChange={setDual} />
        <div style={{ flex: 1, fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>Add Second Imprint (opposite pole)</div>
        <Tag size="xs" tone="success">+$6 / dz logo</Tag>
      </div>
    </div>
  );
}
const CZ_CALLOUTS = [
  { n: 1, target: 'cz-tabs', title: 'Imprint type', text: 'A tab per type the product supports: Custom Logo, Personalized text, Monogram, Photo, AlignXL, IDAlign, Icons, and Player #.' },
  { n: 2, target: 'cz-controls', title: 'Type-specific controls', text: 'The controls change with the tab — upload art, type up to 3 lines, pick a monogram style, choose an icon theme, enter a number, etc.' },
  { n: 3, target: 'cz-preview', title: 'Live 3D preview', text: 'Re-renders as you change anything. The 3D scene is local, but the imprint artwork is the real production render — what you see is what prints.' },
  { n: 4, target: 'cz-dual', title: 'Second imprint (opposite pole)', text: 'Add a second decoration on the other pole — logo one side, text or monogram the other — both shown in the preview, for an upcharge (+$6/dz logo, +$4/dz text).' },
];
const CZ_STEPS = [
  { target: 'cz-tabs', caption: 'Pick how to decorate it — eight imprint types, only the ones this product supports appear.', hold: 2400 },
  { target: 'cz-controls', caption: 'The controls below adapt to the tab — here, drop a logo; on Personalized, type up to three lines.', hold: 2600 },
  { target: 'cz-preview', caption: 'The 3D ball re-renders live with the real production decal — no guessing how it’ll print.', hold: 2400 },
  { target: 'cz-dual', caption: 'Flip on a second imprint for the opposite pole — logo one side, personalization the other.', hold: 2400 },
];

/* The eight imprint types, verified */
const IMPRINT_ROWS = [
  ['Custom Logo', 'Drag-and-drop / click upload (any image file). Art auto-aligns to the print area and projects onto the 3D ball.'],
  ['Personalized (Text)', 'Up to 3 lines (17 characters each) · font (Kabel Dm BT default, Calibri, Lucida Handwriting, Bradley Hand) · color (6 quick / 75+) · size Standard / Large / Max.'],
  ['Monogram', '7 styles — Circle, Hexagram, Gardenia (3 initials); Vertical, Horizontal, Diagonal (2); Simple Circle (1) · initials · primary + accent color.'],
  ['Photo', 'Upload a photo; auto-crops to a circle with a live crop preview.'],
  ['AlignXL (accent line)', '8 line styles (Star, Thin, Medium, Thick, Dot, Skull, Martini, Wine) · optional text · separate text + line colors or “same color”.'],
  ['IDAlign (alignment text)', '12 line styles (arrows, dots, stars, chevrons, martini/wine) · 1–3 initials centered on the line · text + line colors.'],
  ['Icons', 'Theme dropdown (Dad / Father’s Day, Drinks, USA / Patriotic, Masters, Misc) → a grid of 5–9 ready-made graphics.'],
  ['Custom Player Number', 'A number stepper — e.g. a jersey number (adds “Additional Personalization · $5.00/dz”).'],
];

const GLOSSARY = [
  ['Imprint / Decoration', 'The custom artwork on a product — logo, text, monogram, photo, icon.'],
  ['Pole / Dual-pole', 'The two printable sides of a ball. Dual-pole = both sides decorated (+$6/dz logo, +$4/dz text).'],
  ['Commissionable / Custom-logo', 'A SKU priced on the volume ladder instead of retail — marked with the $ coin badge.'],
  ['Ladder / Price breaks', 'Tiered pricing: 1+ @ $6.00, 12+ @ $5.50, 50+ @ $5.00 — quantity snaps to the best tier.'],
  ['Split / Split tier', 'Multiple qty × price rows on one line, to quote several volume scenarios at once.'],
];

/* ----- gift-set packaging selector (faithful to the giftSets bundle:
   a radio list of packaging options each with size + per-set upcharge,
   then the per-SET pricing flip). ----- */
const GIFTSETS = [
  { id: 'none', name: 'No packaging', sub: 'ships loose by the dozen', up: null },
  { id: 'sleeve', name: '3-Ball Sleeve', sub: 'sleeve · 3 balls', up: '+$4.00 / set' },
  { id: 'box-lever', name: '6-Ball Black Box', sub: 'Lever-Divot kit · 6 balls', up: '+$22.00 / set' },
  { id: 'box-chip', name: '6-Ball Black Box', sub: 'Poker-Chip kit · 6 balls', up: '+$19.00 / set' },
  { id: 'wood', name: 'Premium Wood 6-Ball', sub: 'wooden box · 6 balls', up: '+$38.00 / set' },
];
function GiftSetSnippet() {
  const [pick, setPick] = useState('box-lever');
  return (
    <MiniFrame width={360} label="customize · gift-set selector" pad>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 9 }}>Gift-set packaging</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {GIFTSETS.map((g) => {
          const on = pick === g.id;
          return (
            <button key={g.id} type="button" onClick={() => setPick(g.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', padding: '8px 10px', borderRadius: RMD, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-soft)' : SURFACE }}>
              <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: '50%', border: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong, var(--gb-border-default))'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gb-brand-label)' }} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{g.name}</span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--gb-text-muted)' }}>{g.sub}</span>
              </span>
              {g.up
                ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, fontFamily: MONO, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{g.up}</span>
                : <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--gb-text-ghost)' }}>default</span>}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: RMD, border: BORDER, background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <GIcon.gift size={14} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>Pricing flips to <b style={{ color: 'var(--gb-text-secondary)' }}>per&nbsp;set</b> — quantity now means number of sets, not dozens.</span>
      </div>
    </MiniFrame>
  );
}

/* ----- custom / service item editor (faithful to the Custom Items
   editor: identity + cost fields, a thumbnail drop, style-option rows,
   and a price ladder). ----- */
function CiField({ label, value, hint, flex }) {
  return (
    <label style={{ flex: flex || 1, minWidth: 0, display: 'block' }}>
      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 4 }}>{label}</span>
      <span style={{ display: 'block', padding: '6px 9px', borderRadius: 'var(--gb-r-sm)', border: BORDER, background: SURFACE, fontSize: 11.5, color: value ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)', fontFamily: hint ? MONO : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || hint}</span>
    </label>
  );
}
function CustomItemSnippet() {
  const [drop, setDrop] = useState(true);
  const LADDER = [['1+', '$14.50'], ['25+', '$12.75'], ['100+', '$11.25']];
  return (
    <MiniFrame width={400} label="custom items · editor" pad>
      <div style={{ display: 'flex', gap: 8 }}>
        <CiField label="Brand" value="SnugZ" flex={1} />
        <CiField label="Product" value="Tritan Water Bottle" flex={1.4} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <CiField label="Item ID" value="SZ-2200" hint />
        <CiField label="Cost / unit" value="$6.20" hint />
        <CiField label="Setup" value="$45.00" hint />
        <CiField label="Weight" value="0.6 lb" hint />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Thumbnail</div>
          <div style={{ height: 56, borderRadius: 'var(--gb-r-sm)', border: '1px dashed var(--gb-border-strong, var(--gb-border-default))', background: 'var(--gb-fill-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: 'var(--gb-text-muted)' }}>
            <I.upload size={14} /><span style={{ fontSize: 9 }}>re-hosted on upload</span>
          </div>
        </div>
        <div style={{ flex: 1.4 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Style options</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: BORDER, background: SURFACE }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Color</span>
            <Dot /><span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Red · Blue · Black</span>
            <I.chevr size={11} style={{ marginLeft: 'auto', color: 'var(--gb-text-ghost)' }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--gb-text-ghost)', marginTop: 4 }}>each row becomes a picker on the line</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 5 }}>Price ladder</div>
        <div style={{ border: BORDER, borderRadius: RMD, overflow: 'hidden' }}>
          {LADDER.map((r, i) => (
            <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 11.5, padding: '5px 10px', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none', fontFamily: MONO }}>
              <span style={{ color: 'var(--gb-text-secondary)' }}>{r[0]}</span>
              <span style={{ color: 'var(--gb-text-primary)', fontWeight: 700, textAlign: 'right' }}>{r[1]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Switch on={drop} size="sm" onChange={setDrop} /><span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>Dropship</span>
        <Btn size="sm" variant="primary" icon={<I.save />} style={{ marginLeft: 'auto' }}>Save item</Btn>
      </div>
    </MiniFrame>
  );
}

export function CatalogPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Catalog &amp; Proposals</div>
      <h1 className="title">Gift Catalog</h1>
      <p className="lede">
        Open the Gift Catalog from the Actions Shelf to browse the whole golfballs.com range in one
        searchable grid. The layout is four panes: a <strong>search bar</strong> across the top, a
        <strong> BROWSE</strong> sidebar on the left, the <strong>product grid</strong> in the middle, and —
        once you've added something — the <strong>proposal panel</strong> on the right. Every piece below is a
        live, faithful reproduction; walk it pane by pane.
      </p>

      <TourBox n={1} eyebrow="Find anything" title="Search bar & the “/” filter palette" live={<SearchBarSnippet />} wide>
        <p>The search box is focused the moment the catalog opens — just start typing to match by name. The placeholder (<em>“Search products, or / to filter…”</em>) hints at the power move: type <span className="kbd">/</span> and the <strong>filter palette</strong> drops open.</p>
        <p>The palette lets you pick <strong>categories</strong>, <strong>brands</strong>, and special filters — <strong>On sale / promo</strong> and <strong>Commissionable only</strong> — with arrow keys + Enter. The <strong>Sort</strong> dropdown beside it offers Most reviewed (default), Price low→high, Price high→low, and Name A–Z. When any filter is active a small <strong>✕</strong> appears next to the search; one click clears everything.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Scope it" title="The BROWSE sidebar" live={<SidebarSnippet />} flip>
        <p><strong>Departments</strong> — Golf Balls, Apparel, Drinkware, Gift Sets and the rest, each with a live count. Click one to scope the grid; click it again to clear. Below them, <strong>Custom Items</strong> opens your own service products, and the <strong>SAVED</strong> group holds <strong>Saved Proposals</strong> (your local drafts) and <strong>Current Proposals</strong> (pulled live from the CRM when an account is linked).</p>
        <p>Once your proposal has items, a compact <strong>proposal dock</strong> appears at the sidebar's bottom — line count plus running total — and clicking it pops the full proposal panel open.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Read a card at a glance" title="The product grid" live={<GridSnippet />} wide>
        <p>Each card carries everything you need to triage: brand, title, a <strong>“from” price</strong> (custom-logo items show their 1+ tier — volume drops it further), and a <strong>round +</strong> button that adds straight to the proposal. The badges are the language to learn:</p>
        <table className="spectable">
          <thead><tr><th style={{ width: 150 }}>Element</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><b>Sale</b> badge (red)</td><td>The item is on sale — the struck-through “was” price shows below.</td></tr>
            <tr><td><b>Promo</b> badge (green)</td><td>A promotion currently applies to this product.</td></tr>
            <tr><td><b>$</b> coin badge</td><td>Commissionable — a custom-logo SKU priced on the volume ladder.</td></tr>
            <tr><td><b>HPG / SNUGZ</b> pill</td><td>A custom item imported from that supplier.</td></tr>
            <tr><td><b>Round +</b> button</td><td>Adds straight to the proposal (tooltip “Add to proposal”).</td></tr>
          </tbody>
        </table>
      </TourBox>

      <TourBox n={4} eyebrow="The detail panel" title="Pricing tiers, cost & live inventory" live={<DetailSnippet />} flip>
        <p>Click a card and a panel slides in from the right: the big photo, brand + category pills, rating and SKU, the <strong>per-unit price</strong> (with the struck-through “was” price on sale items), and — for tiered products — the <strong>quantity pricing table</strong> showing every break with its per-unit price and a green savings column.</p>
        <p>Watch for the extras: a <strong>green promo banner</strong> when one applies, a <strong>Cost</strong> line (<em>“Cost $X.XX/unit · used for margin”</em>) once a cost has synced for the SKU, and <strong>Check inventory</strong> — press it to pull the live stock table (Avail / OnHand / Alloc / OnOrdr) on demand. The footer's <strong>View product</strong> opens the live site page; <strong>Add to proposal</strong> (which becomes <strong>Add another</strong> once it's in) commits the line.</p>
      </TourBox>

      <h2 className="sec">Customizing an item — imprints</h2>
      <p>On a customizable product the detail panel grows a <strong>customize block</strong>: a tab per imprint type the product supports, type-specific controls, and a <strong>live 3D preview</strong>. Walk through it below — hover the numbered pins (Tour), press Play, or switch to Try it.</p>

      <LiveStage
        width={460}
        frameKind="modal"
        legend="left"
        frameLabel="catalog · customize"
        render={() => <CustomizeSnippet />}
        callouts={CZ_CALLOUTS}
        steps={CZ_STEPS}
        note="The imprint customizer — switch tabs to see each type’s controls; the explanation reads down the left."
      />

      <p>
        The 3D scene renders locally, but the imprint <em>artwork</em> (logo art, monogram, text) is generated by the same
        production services the website uses — so the decal you see is the real one. <strong>Deleting the front imprint promotes
        the back one to front.</strong> The full set of imprint types and their controls:
      </p>
      <table className="spectable">
        <thead><tr><th style={{ width: 150 }}>Imprint type</th><th>Controls</th></tr></thead>
        <tbody>{IMPRINT_ROWS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <TourBox eyebrow="From per-dozen to per-set" title="Gift sets — packaging selector" live={<GiftSetSnippet />} flip>
        <p>
          While customizing a ball, the <strong>gift-set selector</strong> offers packaging: <em>No packaging</em> (default),
          a 3-Ball Sleeve, 6-Ball Black Box variants with a lever-divot or poker-chip kit, and Premium Wood 6-Ball boxes —
          each listing its size and the upcharge per set.
        </p>
        <p>Pick one and three things change:</p>
        <ul>
          <li>The <strong>3D preview swaps to the assembled open box</strong> — balls and kit seated in foam, imprints visible.</li>
          <li>Pricing <strong>flips to per-SET</strong> — the ball's custom-logo ladder scaled to the set's ball count, plus the kit's own ladder, rounded to .95. It's the same math the website uses, verified against production carts.</li>
          <li>In the proposal the line shows a <strong>gift-set banner</strong>, with quantity now meaning <em>number of sets</em>, not dozens.</li>
        </ul>
      </TourBox>

      <TourBox eyebrow="Custom & service items" title="Build your own" live={<CustomItemSnippet />}>
        <p>
          Sidebar → <strong>Custom Items</strong> opens your library as a masonry gallery (scoped to the linked account where one is
          set). <strong>+ Add</strong> opens the item editor — <strong>Brand / Product</strong>, <strong>Item ID</strong>,
          <strong> Extra Details</strong>, <strong>Cost / unit</strong>, <strong>Setup</strong>, <strong>Weight</strong>, a
          <strong> Thumbnail Image</strong> (auto re-hosted on the company image server so it renders in proposal emails),
          row-based <strong>Style options</strong> (each row becomes a picker on the line), a <strong>Price ladder</strong>
          (quantity breaks), a <strong>Description</strong>, and a <strong>Dropship</strong> checkbox.
        </p>
        <p>
          The cost + price ladders are what power real margins in the breakdown. Custom items behave exactly like catalog products
          in the proposal — quantities, splits, even style variants.
        </p>
      </TourBox>
      <p>
        <strong>Supplier import</strong> goes further: the <strong>download</strong> button in the Custom Items toolbar opens
        <strong> “Import from a repo”</strong> — pick a supplier from the <strong>repo dropdown</strong> (e.g. HPG Brands, SnugZ USA)
        and the extension pulls that supplier’s customizable catalog and adds the items straight to your library (deduped by SKU).
        Sell prices are derived from supplier cost so imports arrive quote-ready with honest margins.
      </p>

      <div className="docnote info" style={{ marginTop: 8 }}>
        <span className="dn-ico"><I.download size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Before a SnugZ import</div>
          <p style={{ margin: 0 }}>SnugZ needs you signed in to <strong>snugzusa.com</strong> in another tab first; HPG is public. A big import pages through the whole supplier catalog — let it finish before navigating away.</p>
        </div>
      </div>

      <h2 className="sec">Gifting glossary</h2>
      <p>Every term the gifting suite throws at you, in one place.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 200 }}>Term</th><th>Meaning</th></tr></thead>
        <tbody>{GLOSSARY.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.history size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">A brief “old prices” flash on first open is normal</div>
          <p style={{ margin: 0 }}>The catalog index is cached locally and re-pulls after 24h (Developer Settings → “Re-index interval”). Seed data paints instantly while the live Solr feed loads behind it — so first-open prices may flicker before settling.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PROPOSALS & QUOTES — snippets
══════════════════════════════════════════════════════════════════ */

function Stepper({ qty }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: BORDER, borderRadius: 'var(--gb-r-sm)', overflow: 'hidden' }}>
      <span style={{ padding: '2px 7px', color: 'var(--gb-text-muted)', borderRight: BORDER, fontSize: 12 }}>−</span>
      <span style={{ padding: '2px 9px', fontSize: 11.5, fontFamily: MONO, color: 'var(--gb-text-primary)', minWidth: 26, textAlign: 'center' }}>{qty}</span>
      <span style={{ padding: '2px 7px', color: 'var(--gb-text-muted)', borderLeft: BORDER, fontSize: 12 }}>+</span>
    </div>
  );
}

function ImprintPill({ tone, label, art = '◧' }) {
  const brand = tone === 'front';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px 2px 6px', borderRadius: 'var(--gb-r-pill)', cursor: 'grab', border: '1px solid ' + (brand ? 'var(--gb-brand-tint-border)' : 'var(--gb-success-tint-border)'), background: brand ? 'var(--gb-brand-tint-soft)' : 'var(--gb-success-tint-soft)' }}>
      <span style={{ width: 14, height: 14, borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: brand ? 'var(--gb-brand-tint-medium)' : 'var(--gb-success-tint-medium)', color: brand ? 'var(--gb-brand-label)' : 'var(--gb-success-fg)' }}>{art}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: brand ? 'var(--gb-brand-label)' : 'var(--gb-success-fg)' }}>{label}</span>
      <I.close size={9} style={{ color: 'var(--gb-text-muted)' }} />
    </span>
  );
}

function ProposalPanelSnippet() {
  return (
    <MiniFrame width={400} label="proposal panel" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: 'var(--gb-text-secondary)' }}>PROPOSAL</span>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>2 products · 62 units</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Btn size="xs" variant="ghost" icon={<I.trash />}>Clear</Btn>
          <I.chevd size={13} style={{ color: 'var(--gb-text-muted)' }} />
        </span>
      </div>

      {/* line 1 — ball with two imprints + two splits */}
      <div style={{ border: BORDER, borderRadius: RMD, padding: 10, background: SURFACE, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <Photo size={42} h={42} ball />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Titleist</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Pro V1 (dozen)</div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 800, fontFamily: MONO, color: 'var(--gb-text-primary)' }}>$331.00</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
          <ImprintPill tone="front" label="Logo" art="◧" />
          <ImprintPill tone="back" label="Text" art="A" />
        </div>
        {[{ q: 12, p: 6.5, s: 78 }, { q: 50, p: 5.95, s: 297.5 }].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
            <Stepper qty={r.q} />
            <span style={{ color: 'var(--gb-text-ghost)', fontSize: 11 }}>×</span>
            <span style={{ fontSize: 11.5, fontFamily: MONO, color: 'var(--gb-brand-label)', borderBottom: '1px dashed var(--gb-brand-tint-border)', cursor: 'text' }}>${r.p.toFixed(2)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, fontFamily: MONO, color: 'var(--gb-text-secondary)' }}>${r.s.toFixed(2)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
          <Btn size="xs" variant="ghost" icon={<I.plus />}>Split tier</Btn>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gb-text-muted)' }}>62 units</span>
          <I.trash size={12} style={{ color: 'var(--gb-text-muted)', marginLeft: 8 }} />
        </div>
      </div>

      {/* promo block */}
      <div style={{ border: '1px solid var(--gb-success-tint-border)', borderRadius: RMD, padding: 9, background: 'var(--gb-success-tint-soft)', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.sparkle size={13} style={{ color: 'var(--gb-success-fg)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-success-fg)' }}>BUYMORE24</span>
          <span style={{ fontSize: 10.5, color: 'var(--gb-success-fg)' }}>− Buy 4 dz, get 1 free</span>
          <I.close size={10} style={{ marginLeft: 'auto', color: 'var(--gb-text-muted)' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 4 }}>+ 1 free dozen line added · −$71.40</div>
      </div>

      {/* totals */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 2px' }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>62 units · Estimated total</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gb-text-ghost)', textDecoration: 'line-through', fontFamily: MONO }}>$1,355.40</span>
        <span style={{ fontSize: 18, fontWeight: 800, fontFamily: MONO, color: 'var(--gb-text-primary)' }}>$1,284.00</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <Btn size="sm" variant="secondary" icon={<I.save />}>Save draft</Btn>
        <Btn size="sm" variant="ghost">Load</Btn>
        <Btn size="sm" variant="primary" icon={<I.send />} style={{ flex: 1 }}>Generate email</Btn>
      </div>
    </MiniFrame>
  );
}

/* Breakdown / margin tiles */
function StatTile({ label, value, accent }) {
  return (
    <div style={{ flex: 1, border: BORDER, borderRadius: RMD, padding: '9px 11px', background: SURFACE }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, color: accent || 'var(--gb-text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
function marginTone(m) {
  if (m >= 45) return 'success';
  if (m >= 32) return 'warning';
  return 'error';
}
const BD_ROWS = [
  { name: 'Pro V1 (dozen)', qty: 50, rev: 297.5, cost: 160, m: 46 },
  { name: 'Chrome Soft', qty: 12, rev: 78, cost: 49, m: 37 },
  { name: 'Free dozen (BUYMORE24)', qty: 12, rev: 0, cost: 0, m: null, free: true },
];
function BreakdownSnippet() {
  return (
    <MiniFrame width={420} label="proposal · breakdown & margin" pad>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <StatTile label="Revenue" value="$1,284" />
        <StatTile label="Est. Cost" value="$701" />
        <StatTile label="Gross Profit" value="$583" accent="var(--gb-success-fg)" />
        <StatTile label="Blended" value="45.4%" accent="var(--gb-success-fg)" />
      </div>
      <div style={{ border: BORDER, borderRadius: RMD, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr .5fr .9fr .9fr .8fr', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--gb-text-muted)', background: 'var(--gb-surface-1)', padding: '6px 10px', borderBottom: BORDER }}>
          <span>Product</span><span>Qty</span><span>Revenue</span><span>Cost</span><span style={{ textAlign: 'right' }}>Margin</span>
        </div>
        {BD_ROWS.map((r) => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1.6fr .5fr .9fr .9fr .8fr', alignItems: 'center', fontSize: 11, padding: '7px 10px', borderTop: '1px solid var(--gb-border-subtle)' }}>
            <span style={{ color: 'var(--gb-text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ fontFamily: MONO, color: 'var(--gb-text-secondary)' }}>{r.qty}</span>
            <span style={{ fontFamily: MONO, color: 'var(--gb-text-secondary)' }}>${r.rev.toFixed(0)}</span>
            <span style={{ fontFamily: MONO, color: 'var(--gb-text-secondary)' }}>${r.cost.toFixed(0)}</span>
            <span style={{ textAlign: 'right' }}>
              {r.free ? <Tag size="xs" tone="neutral">Free</Tag> : <Tag size="xs" tone={marginTone(r.m)}>{r.m}%</Tag>}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.5 }}>Cost basis: <b>mixed</b> — estimated lines marked *. Free promo lines excluded from margin. Any price is clickable to override.</div>
    </MiniFrame>
  );
}

/* Promo browser */
const PROMOS = [
  { code: 'BUYMORE24', label: 'Buy 4 dz, get 1 free', kind: 'FREE_QUANTITY', fits: true },
  { code: 'SAVE10', label: '10% off custom logo', kind: 'PERCENT', fits: true },
  { code: 'SHIPFREE', label: 'Free freight', kind: 'SHIPPING', fits: false },
];
function PromoSnippet() {
  const [applied, setApplied] = useState(null);
  return (
    <MiniFrame width={360} label="proposal · promo block" pad>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1 }}><Input size="sm" value={applied || ''} onChange={() => {}} placeholder="Enter a promo code…" leading={<I.sparkle />} /></div>
        <Btn size="sm" variant="secondary">Apply</Btn>
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', margin: '8px 2px 5px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.5 }}>Codes that fit this cart</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PROMOS.filter((p) => p.fits).map((p) => {
          const on = applied === p.code;
          return (
            <button key={p.code} onClick={() => setApplied(on ? null : p.code)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (on ? 'var(--gb-success-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-success-tint-soft)' : SURFACE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: MONO, color: on ? 'var(--gb-success-fg)' : 'var(--gb-text-primary)' }}>{p.code}</span>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', flex: 1 }}>{p.label}</span>
              {p.kind === 'FREE_QUANTITY' && <Tag size="xs" tone="success">free qty</Tag>}
              {on && <I.check size={13} style={{ color: 'var(--gb-success-fg)' }} />}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--gb-text-ghost)', marginTop: 6 }}>SHIPFREE hidden — it doesn't fit this cart.</div>
    </MiniFrame>
  );
}

/* Email template selector + a mini rendered Classic schedule */
const EMAIL_TEMPLATES = [
  { id: 'corporate', name: 'Corporate', sub: 'Squared letterhead · ruled' },
  { id: 'classic', name: 'Classic', sub: 'golfballs.com cart schedule' },
  { id: 'quote', name: 'Quote', sub: 'Total panel over a lined table' },
  { id: 'separated', name: 'Separated', sub: 'Detached option cards · per-price' },
];
const CLASSIC_LINES = [
  { item: 'Pro V1 — Custom Logo', qty: 50, cost: 5.95, total: 297.5 },
  { item: 'Chrome Soft — Personalized', qty: 12, cost: 6.5, total: 78.0 },
  { item: 'Free dozen (BUYMORE24)', qty: 12, cost: 0, total: 0, free: true },
];
function EmailSnippet() {
  const [tpl, setTpl] = useState('classic');
  const [prev, setPrev] = useState(true);
  return (
    <MiniFrame width={440} label="proposal email · composer" pad>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 10 }}>
        {EMAIL_TEMPLATES.map((t) => {
          const on = tpl === t.id;
          return (
            <button key={t.id} onClick={() => setTpl(t.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: 9, borderRadius: RMD, border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-soft)' : SURFACE, fontFamily: 'inherit' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>{t.name}</div>
              <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>{t.sub}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Switch on={prev} size="sm" onChange={setPrev} />
        <span style={{ fontSize: 11, color: 'var(--gb-text-secondary)' }}>Imprint previews</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--gb-text-muted)' }}>{tpl === 'classic' ? 'Classic preview ↓' : `${EMAIL_TEMPLATES.find((t) => t.id === tpl).name} layout`}</span>
      </div>

      {/* mini rendered Classic email — white card like the real email */}
      <div style={{ borderRadius: 10, border: '1px solid #d8dde2', background: '#fff', padding: 12, color: '#222' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#339900', marginBottom: 8 }}>Corporate Gift Proposal</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr .4fr .5fr .6fr', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', color: '#888', paddingBottom: 5, borderBottom: '1px solid #e3e7eb' }}>
          <span>Item</span><span>Qty</span><span>Cost</span><span style={{ textAlign: 'right' }}>Total</span>
        </div>
        {CLASSIC_LINES.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr .4fr .5fr .6fr', alignItems: 'center', fontSize: 10.5, padding: '5px 0', borderBottom: '1px solid #f0f2f4' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {prev && <span style={{ width: 16, height: 16, borderRadius: 3, background: 'radial-gradient(circle at 35% 30%,#fff,#cfd4d9)', border: '1px solid #d8dde2', flexShrink: 0 }} />}
              <span style={{ color: '#333' }}>{l.item}</span>
            </span>
            <span style={{ fontFamily: MONO, color: '#555' }}>{l.qty}</span>
            <span style={{ fontFamily: MONO, color: '#555' }}>{l.free ? '$0.00' : `$${l.cost.toFixed(2)}`}</span>
            <span style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: l.free ? '#999' : '#e87b00' }}>{l.free ? 'FREE' : `$${l.total.toFixed(2)}`}</span>
          </div>
        ))}
        <div style={{ marginTop: 7, fontSize: 10, color: '#444' }}>
          <Row label="Subtotal" value="$1,355.40" />
          <Row label="Promotion (BUYMORE24)" value="−$71.40" green />
          <Row label="Promotion code" value="BUYMORE24" muted />
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e3e7eb', marginTop: 5, paddingTop: 5, fontWeight: 800 }}>
            <span>Estimated total</span><span style={{ fontFamily: MONO }}>$1,284.00</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <span style={{ display: 'inline-block', background: '#339900', color: '#fff', fontWeight: 700, fontSize: 11, padding: '7px 18px', borderRadius: 6 }}>View This Option</span>
        </div>
      </div>
    </MiniFrame>
  );
}
function Row({ label, value, green, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: green ? '#2a8a00' : muted ? '#999' : '#444' }}>
      <span>{label}</span><span style={{ fontFamily: MONO }}>{value}</span>
    </div>
  );
}

const TOGGLE_ROWS = [
  ['Imprint previews', 'Includes real 3D render snapshots of each decoration — and on Classic, swaps the preview photo in for the logo name.'],
  ['Product images', 'Product photos on / off.'],
  ['Unit cost / qty detail', 'Off hides per-unit prices — for teaser sends.'],
  ['Estimated total', 'Off hides the Subtotal / Promotion / Estimated-total summary.'],
  ['Expiration date', 'Adds “This proposal expires on <date>” with a date picker.'],
  ['Shipping & tax disclaimer', 'Adds the footnote that shipping & sales tax are calculated in the cart.'],
  ['“View this option” button', 'Adds the CTA linking to the live cart — only when the proposal has been saved.'],
  ['Show personal message', 'Adds your typed intro paragraph above the schedule.'],
];

export function ProposalsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Catalog &amp; Proposals</div>
      <h1 className="title">Proposals &amp; Quotes</h1>
      <p className="lede">
        The right-hand <strong>proposal panel</strong> is where a quote takes shape — line items with split tiers,
        inline price editing, draggable imprint pills, a promo block, and a one-click <strong>Generate email</strong>.
        Open the <strong>breakdown</strong> for the profitability X-ray, and the <strong>email composer</strong> turns it
        all into the customer-facing send. Everything below is a faithful, interactive reproduction.
      </p>

      <TourBox n={1} eyebrow="Build the quote" title="The proposal panel" live={<ProposalPanelSnippet />} wide>
        <p>The panel slides in with your first added item. Its header shows <strong>PROPOSAL</strong>, the count (<em>“2 products · 62 units”</em>), a <strong>Clear</strong> button, and a collapse arrow. Each line-item card carries the thumbnail, brand, title, the right-aligned line total, a gift-set banner when packaging applies, <strong>imprint pills</strong>, <strong>split rows</strong>, a trash icon, and a unit count.</p>
        <p><strong>Imprint pills</strong> sit on the line: front-pole pills tinted brand, back-pole tinted green, each with the art preview and an ✕ to remove. <strong>Drag a pill onto another line to copy the same decoration there</strong> — the fastest way to apply one logo across several products.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Quote several scenarios" title="Splits, prices & tier snapping" live={<ProposalPanelSnippet />} flip>
        <p>Each line starts with one <strong>split</strong>: a quantity stepper (−/+ or type a number) and a price. The price <strong>auto-snaps to the matching volume tier</strong> as quantity changes. Click the dashed-underline price to type your own — that <strong>locks it</strong>, and a small <strong>↺</strong> link appears showing the auto tier price; click it to snap back.</p>
        <p><strong>+ Split tier</strong> adds another qty/price row on the same line, so one quote can show <em>“option A: 12 @ $6.50, option B: 50 @ $5.95”</em> side by side. At the bottom of the panel the footer rolls up the <strong>promo block</strong> and the <strong>Estimated total</strong>, with buttons for <strong>Save draft</strong> (expands a name field, e.g. “Q3 Client Gift Run”), <strong>Load</strong>, <strong>Generate email</strong>, and <strong>Clear</strong>.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Discounts that actually fit" title="Promo codes" live={<PromoSnippet />} wide>
        <p>The promo block lives in the panel footer (and in the breakdown). Type a code, or open the chevron to <strong>browse known codes</strong> — each candidate is pre-checked against your current cart, so <strong>only applicable ones appear</strong>, each showing its real value (a dollar/percent discount or a free quantity). A code that no longer fits the cart simply isn't offered.</p>
        <p>Apply recomputes the proposal: a <strong>green discount line</strong>, <strong>free-item lines</strong> where a <code>FREE_QUANTITY</code> promo grants them, and a struck-through old total. Free lines show <strong>FREE</strong> in the email and are <strong>excluded from margin math</strong>, so the breakdown still reads true. A warning appears if the cart stops meeting the promo's requirements.</p>
      </TourBox>

      <TourBox n={4} eyebrow="Will it make money?" title="Breakdown & margin view" live={<BreakdownSnippet />} flip>
        <p>Click a saved-proposal card (or the current proposal) to open its <strong>breakdown</strong>. Four stat tiles run across the top — <strong>Revenue</strong>, <strong>Est. Cost</strong>, <strong>Gross Profit</strong>, <strong>Blended Margin</strong> — over a <strong>LINE ITEMS &amp; MARGIN</strong> table whose margin badge is color-coded: <Tag size="xs" tone="success">45%+</Tag> green, <Tag size="xs" tone="warning">32%+</Tag> yellow, <Tag size="xs" tone="error">&lt;32%</Tag> red. Click a row to expand its splits and imprints; <strong>free promo lines</strong> carry a Free badge and are excluded from the math.</p>
        <p>The footer tells you the <strong>cost basis</strong> — <strong>actual</strong> (every line synced), <strong>mixed</strong> (some estimated, marked with <strong>*</strong>), or <strong>assumed</strong> (no costs; a default % of sell price). Missing costs auto-load when the breakdown opens, and <strong>any price is clickable to override right there</strong>.</p>
        <table className="spectable">
          <thead><tr><th style={{ width: 110 }}>Cost basis</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><b>actual</b></td><td>Every line uses a real synced cost (inventory or a custom item's entered cost).</td></tr>
            <tr><td><b>mixed</b></td><td>Some lines synced, the rest estimated — estimated lines marked with *.</td></tr>
            <tr><td><b>assumed</b></td><td>No costs on file; margins assume a default percentage of sell price.</td></tr>
          </tbody>
        </table>
      </TourBox>

      <TourBox n={5} eyebrow="Send it" title="Emailing a proposal — four layouts" live={<EmailSnippet />} wide>
        <p><strong>Generate email</strong> (from the panel or a breakdown) opens the composer in place. A template selector offers <strong>four layouts</strong>, then the message fields: recipient (pre-filled from the page's contact), subject (pre-filled <em>“Corporate Gift Proposal — …”</em>), and an editable intro body.</p>
        <table className="spectable">
          <thead><tr><th style={{ width: 120 }}>Template</th><th>Layout</th></tr></thead>
          <tbody>
            <tr><td><b>Corporate</b></td><td>Squared, ruled letterhead.</td></tr>
            <tr><td><b>Classic</b></td><td>The golfballs.com cart-style schedule (shown in the preview).</td></tr>
            <tr><td><b>Quote</b></td><td>A total panel over a lined table.</td></tr>
            <tr><td><b>Separated</b></td><td>Detached option cards, each priced individually.</td></tr>
          </tbody>
        </table>
        <p><strong>Classic</strong> reproduces the email golfballs.com generates itself: a rounded bordered box with an <em>item / qty / cost / total</em> schedule, <strong>orange line totals</strong>, then <strong>Subtotal → Promotion → Promotion code → Estimated total</strong>, the expiry line, the tax disclaimer, and the green <strong>“View This Option”</strong> button. With <strong>Imprint previews</strong> on, the rendered preview photo drops into each line in place of the logo name (toggle it in the snippet). Free promo dozens appear as their own <strong>$0 / FREE</strong> lines, exactly as the site lays them out.</p>
      </TourBox>

      <h2 className="sec">Content toggles</h2>
      <p>Eight switches shape what the customer sees — show or hide costs and images, swap in real 3D imprint snapshots, add an expiration or a CTA, and so on.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 190 }}>Toggle</th><th>Effect</th></tr></thead>
        <tbody>{TOGGLE_ROWS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h2 className="sec">Saved &amp; current proposals</h2>
      <p>
        Sidebar → <strong>Saved Proposals</strong> is the gallery of your local drafts — each card shows thumbnails, name, date,
        unit count, total, and a <strong>Load</strong> button (loading is <em>additive</em>: it merges into the working proposal).
        Every draft has a visible two-step <strong>Delete</strong> control. Check one or more cards before opening Share; the
        selected count updates live and only those checked drafts are exported. <strong>Current Proposals</strong> pulls the
        linked account's real proposals live from the CRM — open any into the Breakdown view, load it into the builder, or re-email
        it. Saved drafts also expose <strong>Copy command</strong> and <strong>Save to account</strong> from the breakdown.
        The account picker reads the complete unfiltered opportunity table and omits closed opportunities. After a successful save,
        an <strong>Open</strong> or <strong>Prospect</strong> opportunity advances to <strong>Proposed</strong> automatically.
      </p>

      <div className="docnote warn" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Proposal Checkout is a preview, not an order submission</div>
          <p style={{ margin: 0 }}>The embedded checkout validates shipping, billing, payment fields, multi-destination allocation, and address suggestions, but <strong>Place Order currently generates a mock confirmation number in the browser</strong>. It does not post an order, charge a card, reserve inventory, or write a CRM order. Use the saved-cart and proposal-email flows for operational customer work. See the <a href="#manual/proposal-checkout-preview">checkout preview reference</a>.</p>
        </div>
      </div>

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.send size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">What Send actually does</div>
          <p style={{ margin: 0 }}>Sending uploads the 3D snapshots, then runs the same server-side bookkeeping as a quote from the website: it creates the proposal-email record, registers it for tracking, and updates the opportunity's value on the account. The cart link (<strong>“View this option”</strong> CTA) is only included when the cart saved successfully — if it's missing from a preview, <strong>re-save the proposal first</strong>. A toast confirms <em>“Proposal sent to &lt;email&gt;.”</em></p>
        </div>
      </div>

      <div className="docnote info" style={{ marginTop: 14 }}>
        <span className="dn-ico"><I.sparkle size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Re-saved promos and the free-line gotcha</div>
          <p style={{ margin: 0 }}>A promotion references its items by their original cart item-guid. When you load a saved proposal back in and re-save, keep the loaded line's split id as the cart's <em>original</em> bare item-guid — otherwise the promo's eligible-items / free-items links break and the free dozen drops off.</p>
        </div>
      </div>
    </div>
  );
}
