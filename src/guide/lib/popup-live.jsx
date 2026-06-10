import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Btn, TemplatePicker, KeyVal, SectionLabel, Tag, Spinner, I, T } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   popup-live.jsx — a faithful, runnable replica of the toolbar
   popup for the guide's LiveStage. Same layout, components, and
   button logic as src/popup/popup.jsx, driven by sample data
   instead of a live CRM page. Two-phase variable resolution is
   simulated (fast vars first, code vars later) so the spinner /
   "running code…" states demo honestly.

   Exposes an imperative api for walkthrough steps:
     openPicker(bool) · selectTemplate(id) · getState()
─────────────────────────────────────────────────────────────── */

/* ── Sample page: an order page, $100 left to capture ── */
const PAGE = {
  pageType: 'order',
  orderNo: '4815162342',
  messageId: 'msg_1',
  pageOrderTotal: 612.40,
  pageChargeTotal: 512.40,
};

const TEMPLATES = [
  {
    id: 'tpl_ship', name: 'Order Shipped', type: 'order',
    vars: { first_name: {}, order_no: {}, tracking: {} },
    variations: [{ id: 'va', preview: 'Warmer tone' }, { id: 'vb', preview: 'Brief' }],
  },
  {
    id: 'tpl_proof', name: 'Art Proof Ready', type: 'order',
    vars: { first_name: {}, proof_link: {} },
    variations: [],
  },
  {
    id: 'tpl_back', name: 'Backorder Notice', type: 'order',
    vars: { first_name: {}, oos_items: { type: 'code' }, replacement: { type: 'code' } },
    variations: [],
  },
];
const MATCHED_IDS = ['tpl_ship'];

/* What each template resolves to on the sample order. `null` keeps a
   value unresolved so the red "Not found" state is demonstrable. */
const RESOLUTIONS = {
  tpl_ship:  { to: 'jordan.lee@example.com', vars: { first_name: 'Jordan', order_no: '4815162342', tracking: '1Z999AA10123456784' } },
  tpl_proof: { to: 'jordan.lee@example.com', vars: { first_name: 'Jordan', proof_link: 'golfballs.com/proof/8842-rev2' } },
  tpl_back:  { to: 'jordan.lee@example.com', vars: { first_name: 'Jordan', oos_items: 'Srixon Z-Star (2 dz)', replacement: 'Srixon Z-Star XV — in stock' } },
};

const WATCH_LIST = [
  { id: 'w1', done: false, addedAt: Date.now() - 7 * 3600000 },  // 7h old → critical
  { id: 'w2', done: false, addedAt: Date.now() - 40 * 60000 },
];

const Ic = {
  watch: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  checkbox: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  paperclip: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
};

function Header({ onManage, templateCount }) {
  return (
    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
      <div data-demo="logo" style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.mail size={15} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.1 }}>Email Templates</div>
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>Golfballs.com</span>
          <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />
          <span>{templateCount} template{templateCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div data-demo="manage"><Btn size="sm" icon={<I.cog />} onClick={onManage}>Manage</Btn></div>
    </div>
  );
}

function Reveal({ children, gap = 6 }) {
  return <motion.div initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: 'auto', opacity: 1, marginTop: gap }} exit={{ height: 0, opacity: 0, marginTop: 0 }} transition={T.base} style={{ overflow: 'visible' }}>{children}</motion.div>;
}

function LoadingVal({ code }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: code ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}><Spinner size={9} />{code ? 'running code…' : 'resolving…'}</span>;
}

export const PopupLive = forwardRef(function PopupLive({ onToast }, ref) {
  const [selectedId, setSelectedId] = useState(MATCHED_IDS[0]);
  const [selectedVariationId, setSelectedVariationId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolvedVars, setResolvedVars] = useState({});
  const [resolvedTo, setResolvedTo] = useState('');
  const [pendingVars, setPendingVars] = useState({});   // varName -> {code:bool} while resolving
  const timers = useRef([]);

  const tpl = TEMPLATES.find((t) => t.id === selectedId);

  /* Simulated two-phase resolution: To + plain vars land first, code
     vars ~1.2s later — mirroring how the real popup streams. */
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!tpl) { setResolvedVars({}); setResolvedTo(''); setPendingVars({}); return; }
    const res = RESOLUTIONS[tpl.id] || { to: '', vars: {} };
    setResolvedTo('');
    setResolvedVars({});
    setPendingVars(Object.fromEntries(Object.entries(tpl.vars).map(([n, d]) => [n, { code: d?.type === 'code' }])));
    const plain = Object.entries(tpl.vars).filter(([, d]) => d?.type !== 'code').map(([n]) => n);
    const coded = Object.entries(tpl.vars).filter(([, d]) => d?.type === 'code').map(([n]) => n);
    timers.current.push(setTimeout(() => {
      setResolvedTo(res.to || '');
      setResolvedVars((v) => ({ ...v, ...Object.fromEntries(plain.map((n) => [n, res.vars[n] ?? ''])) }));
      setPendingVars((p) => Object.fromEntries(Object.entries(p).filter(([n]) => !plain.includes(n))));
    }, 700));
    if (coded.length) {
      timers.current.push(setTimeout(() => {
        setResolvedVars((v) => ({ ...v, ...Object.fromEntries(coded.map((n) => [n, res.vars[n] ?? ''])) }));
        setPendingVars({});
      }, 1900));
    }
    return () => { timers.current.forEach(clearTimeout); };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    openPicker: (b) => setPickerOpen(b),
    selectTemplate: (id, varId = null) => { setSelectedId(id); setSelectedVariationId(varId); },
    getState: () => ({ selectedId, pickerOpen }),
  }), [selectedId, pickerOpen]);

  const resolving = Object.keys(pendingVars).length > 0 || (!resolvedTo && !!tpl);
  const hasRecipient = !!(resolvedTo && resolvedTo.includes('@'));
  const canSend = !!tpl && hasRecipient;

  const diff = PAGE.pageOrderTotal - PAGE.pageChargeTotal;
  const chargeReady = !!PAGE.orderNo && Math.abs(diff) >= 0.005;
  const isRefund = chargeReady && diff < 0;
  const chargeLabel = !chargeReady ? 'Charge Card' : isRefund ? `Refund  ($${Math.abs(diff).toFixed(2)})` : `Charge Card  ($${diff.toFixed(2)})`;

  const watchCount = WATCH_LIST.filter((i) => !i.done).length;
  const watchHasCrit = WATCH_LIST.some((i) => !i.done && (Date.now() - i.addedAt) >= 6 * 3600000);

  const dropdownValue = selectedVariationId ? `${selectedId}::${selectedVariationId}` : (selectedId || '');
  const onPick = (id) => {
    if (typeof id === 'string' && id.includes('::')) { const [p, v] = id.split('::'); setSelectedId(p); setSelectedVariationId(v); return; }
    setSelectedId(id); setSelectedVariationId(null);
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.34, 1.4, 0.64, 1] }}
      style={{ width: 320, minHeight: 340, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', overflow: 'hidden', position: 'relative', boxSizing: 'border-box', transformOrigin: 'top center' }}>
      <Header templateCount={TEMPLATES.length} onManage={() => onToast?.('Opens the Manager — templates, notes, and Settings')} />
      <div style={{ flex: 1, padding: '14px 14px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <SectionLabel divider={false} style={{ marginBottom: 2 }}>Template</SectionLabel>
          <div data-demo="picker">
            <TemplatePicker mode="single" templates={TEMPLATES} matchedIds={MATCHED_IDS} value={dropdownValue} onChange={onPick} placeholder="Pick a template" listMaxHeight={220} initialOpen={pickerOpen} />
          </div>

          <Reveal key="charge"><div data-demo="charge"><Btn full size="sm" variant={chargeReady ? 'tinted' : 'secondary'} status={isRefund ? 'error' : 'brand'} disabled={!chargeReady} icon={<I.card />} onClick={() => onToast?.('Opens the Charge / Refund modal on the order page')}>{chargeLabel}</Btn></div></Reveal>
          <Reveal key="orderEdit"><div data-demo="orderEdit"><Btn full size="sm" icon={<I.edit />} onClick={() => onToast?.('Opens the Order Edit modal on the page')}>Order Edit</Btn></div></Reveal>
          <Reveal key="watch">
            <div data-demo="watch" style={{ display: 'flex', gap: 6 }}>
              <Btn size="sm" icon={<I.eye />} onClick={() => onToast?.('Adds this order to your Watch List')} style={{ flex: 1, minWidth: 0, width: 'auto' }}>Watch Order</Btn>
              <Btn size="sm" variant={watchHasCrit ? 'tinted' : 'secondary'} status="error" icon={<Ic.watch />} badge={watchCount} badgeTone={watchHasCrit ? 'error' : 'brand'} badgePulse={watchHasCrit} onClick={() => onToast?.('Opens your Watch List — the red pulse means an item is 6h+ old')} style={{ flex: 1, minWidth: 0, width: 'auto' }}>Watch List</Btn>
            </div>
          </Reveal>
          <Reveal key="tasks"><div data-demo="tasks"><Btn full size="sm" icon={<Ic.checkbox />} onClick={() => onToast?.('Opens the Task List (Ctrl+X works anywhere)')}>My Tasks</Btn></div></Reveal>
          <Reveal key="crmSearch"><div data-demo="crmSearch"><Btn full size="sm" icon={<I.search />} onClick={() => onToast?.('Opens CRM Search (Ctrl+K works anywhere)')}>CRM Search</Btn></div></Reveal>
          <Reveal key="proof"><div data-demo="proof"><Btn full size="sm" icon={<Ic.paperclip />} onClick={() => onToast?.('Opens Submit Proof for this order')}>Submit Proof</Btn></div></Reveal>
        </div>

        <div style={{ flexShrink: 0, paddingTop: 12 }}>
          <div data-demo="resolved">
            <KeyVal k="To" v={resolvedTo ? resolvedTo : (resolving ? <LoadingVal /> : <Tag tone="error" size="xs">Not found</Tag>)} tone={hasRecipient ? 'ok' : 'default'} />
            {Object.keys(tpl?.vars || {}).map((n) => {
              const pending = pendingVars[n];
              const val = resolvedVars[n];
              if (pending) return <KeyVal key={n} k={n} v={<LoadingVal code={pending.code} />} />;
              return <KeyVal key={n} k={n} v={val ? String(val).slice(0, 40) : <Tag tone="error" size="xs">Not found</Tag>} tone={val ? 'default' : 'error'} />;
            })}
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />
          <div data-demo="send">
            <Btn full variant="primary" size="md" disabled={!canSend || resolving} icon={<I.send />} onClick={() => onToast?.('Power Automate is off in this demo, so this opens a pre-filled Outlook window')}>Open in Outlook</Btn>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
