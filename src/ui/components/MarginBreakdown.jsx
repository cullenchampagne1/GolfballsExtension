/* MarginBreakdown — a standalone, read-only "proposal breakdown" surface.
   Reuses GiftCatalog's blended-margin model (src/lib/marginReport.js) so any
   page (e.g. opportunity-details) can show revenue / cost / gross profit /
   blended margin + the per-line margin table for a set of resolved proposal
   entries, without opening the GiftCatalog modal.

   Input: `entries` — resolved proposal entries, the same shape marginReport
   consumes: [{ id, product, decoration, free, splits:[{ qty, price }] }].
   (On the opportunity page these come from source.rawLines.) */
import React, { useState, useEffect, useMemo } from 'react';
import { marginReport, primeProposalCosts, unitCostOf, hasRealCost } from '../../lib/marginReport.js';
import { money, usd } from '../../lib/giftCatalogMath.js';
import { decoImprints } from '../../lib/giftImprints.js';
import { giftSetPreviewUrl } from '../../lib/cartSerializer.js';

/* ── design-token helpers (copied verbatim from GiftCatalog.jsx) ─────────── */
const marginTone = (m) => (m >= 0.45 ? 'success' : m >= 0.32 ? 'warning' : 'error');
const TONE_FG = { success: 'var(--gb-success-fg)', warning: 'var(--gb-warning-fg)', error: 'var(--gb-error-fg, var(--gb-error))' };
const TONE_BG = { success: 'var(--gb-success-tint-medium)', warning: 'var(--gb-warning-tint-medium)', error: 'var(--gb-error-tint-medium)' };
const TONE_BD = { success: 'var(--gb-success-tint-border)', warning: 'var(--gb-warning-tint-border)', error: 'var(--gb-error-tint-border)' };
const pctOf = (n) => (n * 100).toFixed(1) + '%';

/* gift-set line display identity (copied verbatim from GiftCatalog.jsx) */
const lineGiftImg = (line) => {
  const gs = line && line.decoration && line.decoration.giftSet;
  if (!gs) return null;
  const p = line.product || {};
  return giftSetPreviewUrl(gs, { decoration: line.decoration, sleeveImage: p.giftSetSleeveImage, brand: p.brand }) || gs.thumbnail || null;
};
const lineGiftTitle = (line) => {
  const gs = line && line.decoration && line.decoration.giftSet;
  return gs ? (gs.name || 'Gift set') : null;
};

/* product thumbnail (copied verbatim from GiftCatalog.jsx) */
function MiniThumb({ src, size = 42 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, background: '#f4f4f1', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden' }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, boxSizing: 'border-box' }} />
    </div>
  );
}

/* blended/line margin badge (copied verbatim from GiftCatalog.jsx) */
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

/* One product row in the line-items + margin table. Copied verbatim from
   GiftCatalog.jsx's MarginLineRow, then made READ-ONLY: the inline price-edit
   affordance (onEditPrice / EditablePrice) is dropped — prices render as plain
   text — while the `estimated` "no cost on file" star indicator is kept. */
function MarginLineRow({ e, first, estimated }) {
  const chips = decoImprints(e.decoration);
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
      {/* Per-split detail — shown when there are multiple splits / imprints
          (read-only: no inline price editing). */}
      {(e.splits.length > 1 || chips.length > 0) && (
        <div style={{ marginTop: 7, paddingLeft: 46, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {e.splits.length > 1 && e.splits.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)' }}>
              <span>{s.qty} × </span>
              <span>{usd(s.price)}</span>
              {s.priceEdited && <span title="Price edited" style={{ color: 'var(--gb-brand-label)', marginLeft: 4, fontSize: 9 }}>✎</span>}
              <span style={{ color: 'var(--gb-text-ghost)', margin: '0 7px' }}>·</span>
              <span style={{ color: 'var(--gb-text-muted)' }}>cost {usd(unitCostOf(e.product, s.price, s.qty))}</span>
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

/* A line gets a "couldn't price" star when, after priming, it still has no real
   cost — i.e. it's a custom item (nothing to fetch) or its synced cost fetch
   came back empty. Both collapse to "no real cost on file". */
const starLine = (e) => !!e && !hasRealCost(e.product);

/* The standalone breakdown: a summary stat strip (Revenue, Cost / Est. cost,
   Gross profit, Blended margin) + the per-line margin table — mirroring the
   breakdown rendered inside GiftCatalog's SavedDetail, minus the
   promo / email / checkout machinery. */
export function MarginBreakdown({ entries }) {
  // Prime the inventory cost cache for these entries on mount / change, then
  // re-run marginReport so real costs fill in. `priming` shows a quiet loader.
  const [priming, setPriming] = useState(true);
  const [costTick, setCostTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setPriming(true);
    primeProposalCosts(entries)
      .catch(() => {})
      .finally(() => { if (alive) { setPriming(false); setCostTick((t) => t + 1); } });
    return () => { alive = false; };
  }, [entries]);

  // costTick re-runs the report once costs have loaded.
  const M = useMemo(() => marginReport(entries), [entries, costTick]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* stat strip */}
      <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
        <StatTile label="Revenue" value={money(M.rev)} sub={`${M.units} units · ${M.count} ${M.count === 1 ? 'item' : 'items'}`} />
        <StatTile label={M.costBasis === 'actual' ? 'Cost' : 'Est. cost'} value={money(M.cost)} sub={priming ? 'pricing…' : M.costBasis === 'actual' ? 'actual' : M.costBasis === 'mixed' ? 'part actual' : 'assumed'} />
        <StatTile label="Gross profit" value={money(M.profit)} accent />
        <StatTile label="Blended margin" value={pctOf(M.margin)} tone={TONE_FG[marginTone(M.margin)]} sub="all-in" />
      </div>

      {/* line items + margin table */}
      <div>
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
            {M.lines.map((e, i) => <MarginLineRow key={e.id || i} e={e} first={i === 0} estimated={!priming && starLine(e)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default MarginBreakdown;
