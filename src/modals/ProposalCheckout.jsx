import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { Btn, IconBtn, I, Tag, Checkbox, Icon, Dropdown } from '../ui/index.js';
import { suggestAddresses, geoapifyConfigured } from '../lib/addressSuggest.js';

/* ───────────────────────────────────────────────────────────────────────────
   Proposal Checkout — embeddable composer (ported from the design bundle).
   Shipping (one address OR multiple drop-ship businesses) → Billing → Payment
   (+ rep-only Admin) with an animated step progress bar, a "Your Purchase" rail
   that lists each line's personalization, and Place Order → confirmation.
   The order POST is stubbed in placeOrder() (returns a mock order #) — same TODO
   the design carried.
   ─────────────────────────────────────────────────────────────────────────── */

const XI = {
  truck:   (p) => <Icon {...p}><path d="M1 3h13v10H1zM14 7h4l3 3v3h-7M5.5 18.5a2 2 0 100-4 2 2 0 000 4zM17.5 18.5a2 2 0 100-4 2 2 0 000 4z"/></Icon>,
  pin:     (p) => <Icon {...p}><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/></Icon>,
  building:(p) => <Icon {...p}><rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 22v-3a2 2 0 014 0v3"/></Icon>,
  phone:   (p) => <Icon {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 1.9.6 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.8.5 2.8.6a2 2 0 011.8 2.1z"/></Icon>,
  lock:    (p) => <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></Icon>,
  receipt: (p) => <Icon {...p}><path d="M5 2v20l2.5-1.5L10 22l2-1.5L14 22l2.5-1.5L19 22V2l-2.5 1.5L14 2l-2 1.5L10 2 7.5 3.5z"/><path d="M8 7h8M8 11h8M8 15h5"/></Icon>,
  shield:  (p) => <Icon {...p}><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/></Icon>,
  gift:    (p) => <Icon {...p}><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12h18M12 8v13M12 8S10.5 3.5 8 4.2C6 4.8 6.6 8 8.5 8M12 8s1.5-4.5 4-3.8C18 4.8 17.4 8 15.5 8"/></Icon>,
  users:   (p) => <Icon {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></Icon>,
  info:    (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></Icon>,
  arrow:   (p) => <Icon {...p} strokeWidth={2.2}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>,
  check:   (p) => <Icon {...p} strokeWidth={2.6}><path d="M20 6L9 17l-5-5"/></Icon>,
  doc:     (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></Icon>,
  upload:  (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></Icon>,
  copy:    (p) => <Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  plus:    (p) => <Icon {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14"/></Icon>,
  trash:   (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></Icon>,
};

const CheckoutCtx = React.createContext({ dense: false });
const money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
const CK_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const CK_TAX_RATE = 0.0811, CK_STD_SHIP = 19.95;
const SAVED_ADDRESSES = [], SAVED_CARDS = [], SALES_REPS = ['House account'];
const rid = () => Math.random().toString(36).slice(2, 9);
const emptyAddr = () => ({ saved: '', first: '', last: '', company: '', addr1: '', addr2: '', country: 'United States', city: '', state: '', zip: '', phone: '', setDefault: false });
function makeDest(lines) {
  return { id: rid(), business: '', attn: '', addr1: '', addr2: '', country: 'United States', city: '', state: '', zip: '', phone: '', note: '',
    items: (lines || []).reduce((m, l) => { m[l.id] = { qty: '' }; return m; }, {}) };
}

/* ── form state hook ──────────────────────────────────────────────────────── */
function useCheckoutForm(source, opts = {}) {
  const showAdmin = opts.showAdmin !== false;
  const companyName = (source.company || '').split(' · ')[0];
  const [ship, setShipRaw] = useState(emptyAddr());
  const [delivery, setDelivery] = useState('ship');
  const [shipMode, setShipMode] = useState('single');
  const [destinations, setDestinations] = useState([]);
  const [billSame, setBillSame] = useState(true);
  const [bill, setBillRaw] = useState(emptyAddr());
  const [promo, setPromo] = useState('');
  const [promoApplied, setPromoApplied] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftCert, setGiftCert] = useState('');
  const [payType, setPayType] = useState('Credit Card');
  const [savedCard, setSavedCard] = useState('');
  const [card, setCardRaw] = useState({ name: '', num: '', cvc: '', exp: '' });
  const [admin, setAdminRaw] = useState({ commitment: '', priority: '', salesRep: '', instructions: '' });
  const [placing, setPlacing] = useState(false);
  const [orderNo, setOrderNo] = useState(null);

  useEffect(() => {
    setShipRaw({ ...emptyAddr(), company: companyName });
    setBillRaw(emptyAddr()); setBillSame(true); setPromoApplied(''); setSavedCard('');
    setCardRaw({ name: '', num: '', cvc: '', exp: '' }); setGiftOpen(false); setGiftCert(''); setOrderNo(null);
    setShipMode('single'); setDestinations([]);
  }, [companyName, source]);

  const patchShip = (p) => setShipRaw((s) => ({ ...s, ...p }));
  const patchBill = (p) => setBillRaw((s) => ({ ...s, ...p }));
  const setCard = (p) => setCardRaw((c) => ({ ...c, ...p }));
  const setAdmin = (p) => setAdminRaw((c) => ({ ...c, ...p }));

  // multi-destination helpers
  const addDestination = () => { const d = makeDest(source.lines); setDestinations((a) => [...a, d]); return d.id; };
  const removeDestination = (id) => setDestinations((a) => a.filter((d) => d.id !== id));
  const duplicateDestination = (id) => {
    let newId = null;
    setDestinations((a) => { const src = a.find((d) => d.id === id); if (!src) return a; newId = rid();
      const copy = JSON.parse(JSON.stringify(src)); copy.id = newId; copy.business = src.business ? src.business + ' (copy)' : '';
      const idx = a.findIndex((d) => d.id === id); const next = [...a]; next.splice(idx + 1, 0, copy); return next; });
    return newId;
  };
  const patchDestination = (id, p) => setDestinations((a) => a.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const patchDestItem = (id, lineId, p) => setDestinations((a) => a.map((d) => d.id !== id ? d : { ...d, items: { ...d.items, [lineId]: { ...(d.items[lineId] || { qty: '' }), ...p } } }));
  const autoSplit = () => setDestinations((a) => { if (!a.length) return a;
    return a.map((d, di) => { const items = { ...d.items };
      source.lines.forEach((l) => { const base = Math.floor(l.qty / a.length); const extra = di < (l.qty % a.length) ? 1 : 0; items[l.id] = { ...(items[l.id] || {}), qty: String(base + extra) }; });
      return { ...d, items }; });
  });
  const allocation = useMemo(() => source.lines.map((l) => ({ id: l.id, title: l.product.title, total: l.qty,
    allocated: destinations.reduce((a, d) => a + (parseInt(d.items[l.id] && d.items[l.id].qty, 10) || 0), 0) })), [destinations, source.lines]);
  const allocationComplete = allocation.every((a) => a.allocated === a.total);

  const totals = useMemo(() => {
    const subtotal = (source.subtotal || 0) + (source.setupTotal || 0);
    return { subtotal, tax: subtotal * CK_TAX_RATE, shipping: CK_STD_SHIP, total: subtotal + subtotal * CK_TAX_RATE + CK_STD_SHIP };
  }, [source.subtotal, source.setupTotal]);

  const addrOk = (a) => !!(a.saved || (a.first && a.last && a.addr1 && a.city && a.state && a.zip));
  const destOk = (d) => !!(d.business && d.addr1 && d.city && d.state && d.zip);
  const shipOk = shipMode === 'single' ? addrOk(ship) : (destinations.length > 0 && destinations.every(destOk) && allocationComplete);
  const billOk = billSame || addrOk(bill);
  const payOk = !!savedCard || !!(card.name && card.num && card.cvc && card.exp);
  const missing = [];
  if (!shipOk) missing.push(shipMode === 'single' ? 'shipping address' : 'destinations & allocation');
  if (!billOk) missing.push('billing address');
  if (!payOk) missing.push('payment');
  const canPlace = missing.length === 0;
  const stepDone = { shipping: shipOk, billing: billOk, payment: payOk };

  const applyPromo = () => { if (promo.trim()) setPromoApplied(promo.trim().toUpperCase()); };
  const removePromo = () => { setPromoApplied(''); setPromo(''); };
  const placeOrder = () => {
    // TODO(backend): POST the assembled order to the golfballs order endpoint.
    if (!canPlace) return;
    setPlacing(true);
    setTimeout(() => { setPlacing(false); setOrderNo('GB' + (1840000 + Math.floor(Math.random() * 9999))); }, 1100);
  };
  const resetOrder = () => setOrderNo(null);

  return {
    source, totals, showAdmin,
    ship, patchShip, delivery, setDelivery, billSame, setBillSame, bill, patchBill,
    shipMode, setShipMode, destinations, addDestination, removeDestination, duplicateDestination,
    patchDestination, patchDestItem, autoSplit, allocation, allocationComplete,
    promo, setPromo, promoApplied, applyPromo, removePromo,
    giftOpen, setGiftOpen, giftCert, setGiftCert,
    payType, setPayType, savedCard, setSavedCard, card, setCard, admin, setAdmin,
    placing, orderNo, placeOrder, resetOrder, stepDone, missing, canPlace,
  };
}

/* ── primitives ───────────────────────────────────────────────────────────── */
function FieldLabel({ children, required, hint }) {
  return (
    <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}{required && <span style={{ color: 'var(--gb-error)' }}>*</span>}
      {hint && <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--gb-text-ghost)' }}>{hint}</span>}
    </label>
  );
}
function baseFieldStyle(focused, error, dense) {
  return {
    width: '100%', boxSizing: 'border-box', height: dense ? 32 : 38, padding: '0 11px',
    background: 'var(--gb-fill-inverse-medium)',
    border: '1px solid ' + (focused ? 'var(--gb-brand-label)' : error ? 'var(--gb-error)' : 'var(--gb-border-default)'),
    borderRadius: 'var(--gb-r-md)', boxShadow: focused ? 'var(--gb-focus-ring)' : 'none',
    outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)',
    fontSize: dense ? 12.5 : 13, fontWeight: 500, transition: 'all var(--gb-anim)',
  };
}
function CkText({ label, value, onChange, placeholder, required, hint, type = 'text', mono, leading, error, width, autoComplete }) {
  const [focus, setFocus] = useState(false);
  const { dense } = useContext(CheckoutCtx);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: width || '100%', minWidth: 0 }}>
      {label && <FieldLabel required={required} hint={hint}>{label}</FieldLabel>}
      <div style={{ position: 'relative' }}>
        {leading && <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gb-text-muted)', display: 'flex', pointerEvents: 'none' }}>{leading}</span>}
        <input type={type} value={value} placeholder={placeholder} autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ ...baseFieldStyle(focus, error, dense), fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', paddingLeft: leading ? 34 : 11 }} />
      </div>
    </div>
  );
}
/* Address line 1 with a stylized typeahead. Behaves like CkText (label, leading
   pin, focus ring) but debounces into the free Photon/OSM geocoder and drops a
   suggestion panel; picking one fills addr1 + city/state/zip via onPick. */
function CkAutocomplete({ label, value, onChange, onPick, placeholder, required, leading, width }) {
  const [focus, setFocus] = useState(false);
  const [open, setOpen] = useState(false);
  const [sugg, setSugg] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const { dense } = useContext(CheckoutCtx);
  const boxRef = useRef(null);
  const justPicked = useRef(false);

  // One-time: is a Geoapify key configured? Drives the "set it up" hint.
  useEffect(() => { let a = true; geoapifyConfigured().then((ok) => { if (a) setKeyMissing(!ok); }); return () => { a = false; }; }, []);

  // Debounced lookup; skips the fetch right after a pick (the value change is ours).
  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return undefined; }
    const q = (value || '').trim();
    if (q.length < 3 || keyMissing) { setSugg([]); setOpen(false); setLoading(false); return undefined; }
    setLoading(true);
    const t = setTimeout(async () => {
      const list = await suggestAddresses(q);
      setSugg(list); setActive(-1); setLoading(false);
      if (focus) setOpen(list.length > 0);
    }, 260);
    return () => clearTimeout(t);
  }, [value, keyMissing]); // eslint-disable-line

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (s) => {
    justPicked.current = true;
    onPick && onPick(s);
    setOpen(false); setSugg([]); setActive(-1);
  };
  const onKey = (e) => {
    if (!open || !sugg.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, sugg.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(sugg[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, width: width || '100%', minWidth: 0, position: 'relative' }}>
      {label && <FieldLabel required={required}>{label}</FieldLabel>}
      <div style={{ position: 'relative' }}>
        {leading && <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gb-text-muted)', display: 'flex', pointerEvents: 'none' }}>{leading}</span>}
        <input type="text" value={value} placeholder={placeholder} autoComplete="off"
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
          onFocus={() => { setFocus(true); if (sugg.length) setOpen(true); }}
          onBlur={() => setFocus(false)}
          style={{ ...baseFieldStyle(focus, false, dense), paddingLeft: leading ? 34 : 11, paddingRight: 30 }} />
        {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} />}
      </div>
      {keyMissing && (value || '').trim().length >= 3 && (
        <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.45 }}>
          Address suggestions need a free <b style={{ color: 'var(--gb-text-secondary)' }}>Geoapify API key</b> — add one in Settings → Developer (“Geoapify API key”).
        </div>
      )}
      {open && sugg.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40, maxHeight: 232, overflowY: 'auto',
          background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-pop, 0 12px 30px rgba(40,32,16,.18))', padding: 4 }}>
          {sugg.map((s, i) => (
            <button key={s._key || i} type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '8px 10px', borderRadius: 'var(--gb-r-sm)', border: 'none',
                background: i === active ? 'var(--gb-fill-inverse-medium)' : 'transparent', transition: 'background var(--gb-anim)' }}>
              <span style={{ flexShrink: 0, color: 'var(--gb-text-muted)', display: 'flex' }}><XI.pin size={13} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                {s.sub && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</span>}
              </span>
            </button>
          ))}
          <div style={{ padding: '5px 10px 3px', fontSize: 9, color: 'var(--gb-text-ghost)', letterSpacing: .3 }}>Addresses via Geoapify</div>
        </div>
      )}
    </div>
  );
}

/* Select → the design-system Dropdown (custom, not a native <select>). */
function CkSelect({ label, value, onChange, options, required, placeholder, width }) {
  const opts = (options || []).map((o) => (o && typeof o === 'object') ? { id: o.value ?? o.id, label: o.label } : { id: o, label: o });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: width || '100%', minWidth: 0 }}>
      {label && <FieldLabel required={required}>{label}</FieldLabel>}
      <Dropdown value={value} onChange={onChange} options={opts} placeholder={placeholder || 'Select…'} size="sm" />
    </div>
  );
}
function CkArea({ label, value, onChange, placeholder, rows = 3, hint }) {
  const [focus, setFocus] = useState(false);
  const { dense } = useContext(CheckoutCtx);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <textarea rows={rows} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ ...baseFieldStyle(focus, false, dense), height: 'auto', padding: '9px 11px', lineHeight: 1.5, resize: 'vertical' }} />
    </div>
  );
}
/* Segmented control */
function CkSeg({ value, onChange, options, full }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 3, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', width: full ? '100%' : 'auto' }}>
      {options.map((o) => {
        const on = value === (o.value ?? o);
        return (
          <button key={o.value ?? o} onClick={() => onChange(o.value ?? o)} style={{
            flex: full ? 1 : 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 600,
            background: on ? 'var(--gb-surface-1)' : 'transparent', color: on ? 'var(--gb-text-primary)' : 'var(--gb-text-tertiary)',
            border: '1px solid ' + (on ? 'var(--gb-border-default)' : 'transparent'),
            boxShadow: on ? '0 1px 3px rgba(40,32,16,.12)' : 'none', transition: 'all var(--gb-anim)',
          }}>
            {o.icon && <span style={{ display: 'flex' }}>{o.icon}</span>}{o.label ?? o}
          </button>
        );
      })}
    </div>
  );
}
/* checkbox — design-system Checkbox; our labels are single-line, so center the
   box with the label (the component defaults to top-align for label+hint). */
function CkCheck({ checked, onClick, label }) {
  return <Checkbox checked={checked} label={label} onChange={() => onClick()} style={{ alignItems: 'center' }} />;
}
function ProductPlate({ src, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: '#ffffff', border: '1px solid var(--gb-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4, boxSizing: 'border-box' }}>
      {src && <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />}
    </div>
  );
}

/* ── animated step progress bar ───────────────────────────────────────────── */
function CkProgress({ progress = 0, scrolled }) {
  const labels = ['Shipping', 'Billing', 'Payment'];
  const frontier = Math.min(2, Math.floor(progress + 1e-6));
  const els = [];
  labels.forEach((label, i) => {
    const state = i < frontier ? 'done' : i === frontier ? 'active' : 'todo';
    els.push(
      <div key={'n' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
          background: state === 'done' ? 'var(--gb-success)' : state === 'active' ? 'var(--gb-brand-label)' : 'var(--gb-fill-subtle)',
          color: state === 'todo' ? 'var(--gb-text-muted)' : '#fff',
          border: '1px solid ' + (state === 'done' ? 'var(--gb-success)' : state === 'active' ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
          boxShadow: state === 'active' ? '0 0 0 4px var(--gb-brand-tint-soft)' : 'none', transform: state === 'active' ? 'scale(1.08)' : 'scale(1)',
          transition: 'background .35s ease, color .35s ease, border-color .35s ease, box-shadow .35s ease, transform .35s ease' }}>{state === 'done' ? <XI.check size={12} /> : i + 1}</span>
        <span style={{ fontSize: 12, fontWeight: state === 'active' ? 800 : 600, color: state === 'active' ? 'var(--gb-brand-label)' : state === 'done' ? 'var(--gb-success-fg)' : 'var(--gb-text-muted)', whiteSpace: 'nowrap', transition: 'color .35s ease' }}>{label}</span>
      </div>
    );
    if (i < labels.length - 1) {
      const fill = Math.max(0, Math.min(1, progress - i));
      els.push(
        <div key={'c' + i} style={{ flex: 1, height: 3, margin: '0 10px', borderRadius: 3, background: 'var(--gb-border-default)', position: 'relative', overflow: 'hidden', minWidth: 18 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (fill * 100) + '%', background: 'var(--gb-success)', borderRadius: 3, transition: 'width .14s linear' }} />
        </div>
      );
    }
  });
  return (
    <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', padding: '12px 18px', display: 'flex', alignItems: 'center', flexShrink: 0,
      boxShadow: scrolled ? '0 10px 26px rgba(40,32,16,.14)' : 'none', transition: 'box-shadow .4s cubic-bezier(.4,0,.2,1)' }}>{els}</div>
  );
}

/* ── layout pieces ────────────────────────────────────────────────────────── */
function CkSection({ n, icon, title, sub, done, optional, children, secRef }) {
  return (
    <section ref={secRef} style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', flexShrink: 0, scrollMarginTop: 84 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
          background: done ? 'var(--gb-success-tint-medium)' : 'var(--gb-brand-tint-medium)', color: done ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)',
          border: '1px solid ' + (done ? 'var(--gb-success-tint-border)' : 'var(--gb-brand-tint-border)') }}>{done ? <XI.check size={14} /> : n}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.2 }}>{title}</h2>
            {optional && <Tag tone="neutral" size="sm">Rep only</Tag>}
          </div>
          {sub && <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        {icon && <span style={{ color: 'var(--gb-text-ghost)', display: 'flex' }}>{icon}</span>}
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}
const CkRow2 = ({ children }) => <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>;
function SubLabel({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-tertiary)' }}>
      <span style={{ display: 'flex', color: 'var(--gb-text-muted)' }}>{icon}</span>{children}
    </div>
  );
}
function CkAddress({ a, set }) {
  const usingSaved = !!a.saved;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {SAVED_ADDRESSES.length > 0 && <CkSelect label="Saved addresses" value={a.saved} onChange={(v) => set({ saved: v })} options={SAVED_ADDRESSES.map((s) => ({ value: s.id, label: s.label }))} placeholder="Use a new address" />}
      {!usingSaved && (
        <>
          <CkRow2>
            <CkText label="First name" required value={a.first} onChange={(v) => set({ first: v })} placeholder="Debra" width="calc(50% - 6px)" />
            <CkText label="Last name" required value={a.last} onChange={(v) => set({ last: v })} placeholder="Grimley" width="calc(50% - 6px)" />
          </CkRow2>
          <CkText label="Company" value={a.company} onChange={(v) => set({ company: v })} placeholder="Acme Corp" leading={<XI.building size={14} />} />
          <CkAutocomplete label="Address 1" required value={a.addr1}
            onChange={(v) => set({ addr1: v })}
            onPick={(s) => set({ addr1: s.addr1, city: s.city || a.city, state: s.state || a.state, zip: s.zip || a.zip })}
            placeholder="Start typing an address…" leading={<XI.pin size={14} />} />
          <CkText label="Address 2" value={a.addr2} onChange={(v) => set({ addr2: v })} placeholder="Suite, unit, building (optional)" />
          <CkRow2>
            <CkSelect label="Country" value={a.country} onChange={(v) => set({ country: v })} options={['United States', 'Canada']} width="calc(50% - 6px)" />
            <CkText label="City" required value={a.city} onChange={(v) => set({ city: v })} placeholder="Portland" width="calc(50% - 6px)" />
          </CkRow2>
          <CkRow2>
            <CkSelect label="State" required value={a.state} onChange={(v) => set({ state: v })} options={CK_STATES} placeholder="—" width="calc(33% - 8px)" />
            <CkText label="Zip code" required value={a.zip} onChange={(v) => set({ zip: v })} placeholder="78374" mono width="calc(33% - 8px)" />
            <CkText label="Phone" value={a.phone} onChange={(v) => set({ phone: v })} placeholder="(555) 010-0142" mono width="calc(34% - 8px)" leading={<XI.phone size={13} />} />
          </CkRow2>
          <CkCheck checked={a.setDefault} onClick={() => set({ setDefault: !a.setDefault })} label="Set as default address" />
        </>
      )}
    </div>
  );
}

/* ── multi-destination drop-ship ──────────────────────────────────────────── */
function AllocBar({ allocation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Allocation across destinations</div>
      {allocation.map((a) => {
        const ok = a.allocated === a.total, over = a.allocated > a.total, pct = a.total ? Math.min(100, (a.allocated / a.total) * 100) : 0;
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
            <div style={{ width: 90, height: 5, borderRadius: 3, background: 'var(--gb-border-default)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: over ? 'var(--gb-error)' : ok ? 'var(--gb-success)' : 'var(--gb-warning)', transition: 'width .2s ease' }} />
            </div>
            <span style={{ width: 56, textAlign: 'right', fontSize: 11, fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: over ? 'var(--gb-error)' : ok ? 'var(--gb-success-fg)' : 'var(--gb-text-tertiary)' }}>{a.allocated}/{a.total}</span>
          </div>
        );
      })}
    </div>
  );
}
// Imprints whose value a recipient can vary per address (the name on a monogram,
// the lines of personalized text). A custom logo is the same art everywhere, so
// it isn't editable here.
const editableImprints = (line) => (line.imprints || [])
  .map((im, idx) => ({ im, idx }))
  .filter(({ im }) => im.label === 'Personalized text' || im.label === 'Monogram');

function DestItemRow({ line, item, onPatch }) {
  const editable = editableImprints(line);
  const assigned = (parseInt(item.qty, 10) || 0) > 0;
  const ov = item.imprints || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px' }}>
        <ProductPlate src={line.product.img} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.product.title}</div>
          <ImprintList imprints={line.imprints} compact />
        </div>
        <div style={{ width: 70, flexShrink: 0 }}>
          <CkText value={item.qty} onChange={(v) => onPatch({ qty: v.replace(/\D/g, '') })} placeholder="Qty" mono />
        </div>
      </div>
      {editable.length > 0 && assigned && (
        <div style={{ padding: '9px 12px 11px', borderTop: '1px dashed var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)' }}>Personalization for this address</div>
          {editable.map(({ im, idx }) => (
            <CkText key={idx}
              label={im.label}
              value={ov[idx] != null ? ov[idx] : (im.detail || '')}
              onChange={(v) => onPatch({ imprints: { ...ov, [idx]: im.label === 'Monogram' ? v.toUpperCase() : v } })}
              placeholder={im.label === 'Monogram' ? 'e.g. JDM' : 'Name or message for this recipient'} />
          ))}
        </div>
      )}
    </div>
  );
}
function DestinationCard({ index, dest, lines, expanded, onToggle, onPatch, onPatchItem, onRemove, onDuplicate }) {
  const units = lines.reduce((a, l) => a + (parseInt(dest.items[l.id] && dest.items[l.id].qty, 10) || 0), 0);
  const place = [dest.city, dest.state].filter(Boolean).join(', ');
  const title = dest.business || dest.attn || 'Untitled destination';
  return (
    <div style={{ borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (expanded ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), background: 'var(--gb-fill-inverse-medium)', overflow: 'hidden', transition: 'border-color var(--gb-anim)' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', cursor: 'pointer' }}>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)' }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: title === 'Untitled destination' ? 'var(--gb-text-muted)' : 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place || 'No address yet'}</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: units ? 'var(--gb-text-secondary)' : 'var(--gb-text-ghost)', padding: '3px 8px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>{units} units</span>
        <IconBtn size="sm" variant="ghost" icon={<XI.copy />} onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate" />
        <IconBtn size="sm" variant="ghost" icon={<XI.trash />} onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove" />
        <span style={{ flexShrink: 0, display: 'flex', color: 'var(--gb-text-muted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform var(--gb-anim)' }}><XI.arrow size={14} /></span>
      </div>
      {expanded && (
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <SubLabel icon={<XI.pin size={12} />}>Ship-to address</SubLabel>
            <CkRow2>
              <CkText label="Business name" value={dest.business} onChange={(v) => onPatch({ business: v })} placeholder="Dallas Regional Office" width="calc(60% - 6px)" />
              <CkText label="Attn" value={dest.attn} onChange={(v) => onPatch({ attn: v })} placeholder="Front desk" width="calc(40% - 6px)" />
            </CkRow2>
            <CkAutocomplete label="Address 1" value={dest.addr1}
              onChange={(v) => onPatch({ addr1: v })}
              onPick={(s) => onPatch({ addr1: s.addr1, city: s.city || dest.city, state: s.state || dest.state, zip: s.zip || dest.zip })}
              placeholder="Start typing an address…" leading={<XI.pin size={13} />} />
            <CkText label="Address 2" value={dest.addr2} onChange={(v) => onPatch({ addr2: v })} placeholder="Suite 400 (optional)" />
            <CkRow2>
              <CkText label="City" value={dest.city} onChange={(v) => onPatch({ city: v })} placeholder="Dallas" width="calc(40% - 8px)" />
              <CkSelect label="State" value={dest.state} onChange={(v) => onPatch({ state: v })} options={CK_STATES} placeholder="—" width="calc(28% - 8px)" />
              <CkText label="Zip" value={dest.zip} onChange={(v) => onPatch({ zip: v.replace(/\D/g, '') })} placeholder="75201" mono width="calc(32% - 8px)" />
            </CkRow2>
            <CkText label="Phone" value={dest.phone} onChange={(v) => onPatch({ phone: v })} placeholder="(555) 010-0142" mono leading={<XI.phone size={13} />} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SubLabel icon={<XI.gift size={12} />}>Items for this location</SubLabel>
            {lines.map((l) => <DestItemRow key={l.id} line={l} item={dest.items[l.id] || { qty: '' }} onPatch={(p) => onPatchItem(l.id, p)} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SubLabel icon={<XI.doc size={12} />}>Destination notes</SubLabel>
            <CkArea value={dest.note} onChange={(v) => onPatch({ note: v })} placeholder="Delivery window, dock instructions, gift message for this location…" rows={2} />
          </div>
        </div>
      )}
    </div>
  );
}
function DestinationManager({ f }) {
  const { source, destinations, addDestination, removeDestination, duplicateDestination, patchDestination, patchDestItem, autoSplit, allocation } = f;
  const [openId, setOpenId] = useState(destinations[0] && destinations[0].id);
  const totalUnits = source.units;
  const allocated = allocation.reduce((a, x) => a + x.allocated, 0);
  const off = allocated !== totalUnits;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}</div>
          <div style={{ fontSize: 11, color: off ? 'var(--gb-warning-fg)' : 'var(--gb-success-fg)', marginTop: 1, fontWeight: 500 }}>
            <b style={{ fontFamily: 'var(--gb-font-mono)' }}>{allocated}</b> of <b style={{ fontFamily: 'var(--gb-font-mono)' }}>{totalUnits}</b> units allocated{off ? ` · ${Math.abs(totalUnits - allocated)} ${allocated > totalUnits ? 'over' : 'unassigned'}` : ' · balanced'}
          </div>
        </div>
        <Btn variant="ghost" size="sm" icon={<XI.info />} onClick={autoSplit}>Split evenly</Btn>
        <Btn variant="primary" size="sm" icon={<XI.plus />} onClick={() => { const id = addDestination(); setOpenId(id); }}>Add destination</Btn>
      </div>
      {destinations.length > 0 && <AllocBar allocation={allocation} />}
      {destinations.length === 0 ? (
        <div style={{ padding: '26px 16px', textAlign: 'center', borderRadius: 'var(--gb-r-md)', border: '1.5px dashed var(--gb-border-strong)', background: 'var(--gb-fill-subtle)' }}>
          <div style={{ color: 'var(--gb-text-muted)', display: 'flex', justifyContent: 'center', marginBottom: 8 }}><XI.users size={22} /></div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>No destinations yet</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3 }}>Add a destination to drop-ship to multiple businesses.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {destinations.map((d, i) => (
            <DestinationCard key={d.id} index={i} dest={d} lines={source.lines} expanded={openId === d.id}
              onToggle={() => setOpenId(openId === d.id ? null : d.id)}
              onPatch={(p) => patchDestination(d.id, p)} onPatchItem={(lineId, p) => patchDestItem(d.id, lineId, p)}
              onRemove={() => removeDestination(d.id)} onDuplicate={() => { const id = duplicateDestination(d.id); setOpenId(id); }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── left column ──────────────────────────────────────────────────────────── */
function CheckoutSections({ f, scrollRef }) {
  const secRefs = useRef([]);
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = (scrollRef && scrollRef.current) || window;
    const BAR = 84;
    const onScroll = () => {
      const isWin = scroller === window;
      const scTop = isWin ? 0 : scroller.getBoundingClientRect().top;
      const cur = isWin ? window.scrollY : scroller.scrollTop;
      setScrolled(cur > 6);
      const tops = [0, 1, 2].map((i) => { const el = secRefs.current[i]; return el ? el.getBoundingClientRect().top - scTop + cur : 0; });
      let prog = 0;
      for (let i = 0; i < tops.length - 1; i++) {
        const start = tops[i] - BAR, end = tops[i + 1] - BAR;
        if (cur >= end) { prog = i + 1; continue; }
        if (cur > start && end > start) { prog = i + (cur - start) / (end - start); }
        break;
      }
      setProgress(Math.max(0, Math.min(2, prog)));
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [scrollRef, f.shipMode, f.showAdmin]);

  let n = 0; const sn = () => (++n);
  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 6, margin: '0 -16px', padding: '16px 16px 0', background: 'var(--gb-surface-canvas)' }}>
        <CkProgress progress={progress} scrolled={scrolled} />
      </div>

      <CkSection secRef={(el) => (secRefs.current[0] = el)} n={sn()} icon={<XI.truck size={16} />} title="Shipping Address" sub={f.shipMode === 'single' ? 'Where the order ships' : 'Drop-ship to multiple businesses'} done={f.stepDone.shipping}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CkSeg full value={f.shipMode} onChange={f.setShipMode} options={[
            { value: 'single', label: 'One address', icon: <XI.pin size={13} /> },
            { value: 'multi', label: 'Multiple businesses', icon: <XI.users size={13} /> },
          ]} />
          {f.shipMode === 'single' ? (
            <>
              <CkAddress a={f.ship} set={f.patchShip} />
              <div style={{ height: 1, background: 'var(--gb-border-subtle)' }} />
              <CkSelect label="Delivery method" value={f.delivery} onChange={f.setDelivery} options={[
                { value: 'ship', label: 'Please ship my packages' },
                { value: 'pickup', label: 'Pick up at Golfballs.com' },
              ]} />
            </>
          ) : <DestinationManager f={f} />}
        </div>
      </CkSection>

      <CkSection secRef={(el) => (secRefs.current[1] = el)} n={sn()} icon={<XI.receipt size={16} />} title="Billing Address" sub="Where the invoice goes" done={f.stepDone.billing}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CkCheck checked={f.billSame} onClick={() => f.setBillSame(!f.billSame)} label="Same as shipping address" />
          {!f.billSame && <CkAddress a={f.bill} set={f.patchBill} />}
        </div>
      </CkSection>

      <CkSection secRef={(el) => (secRefs.current[2] = el)} n={sn()} icon={<I.card size={16} />} title="Payment Options" sub="Promotion, gift certificate and payment" done={f.stepDone.payment}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginBottom: 6 }}>Promotion code</div>
            {f.promoApplied ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                <span style={{ color: 'var(--gb-success-fg)', display: 'flex' }}><XI.check size={14} /></span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{f.promoApplied}</span>
                <button onClick={f.removePromo} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--gb-brand-label)', padding: 0 }}>remove</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><CkText value={f.promo} onChange={f.setPromo} placeholder="Enter code" mono /></div>
                <Btn variant="secondary" size="md" onClick={f.applyPromo}>Apply</Btn>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 14 }}>
            {!f.giftOpen ? (
              <button onClick={() => f.setGiftOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: 'var(--gb-text-secondary)' }}>
                <span style={{ color: 'var(--gb-brand-label)', display: 'flex' }}><XI.gift size={15} /></span>
                I have a <b style={{ color: 'var(--gb-brand-label)' }}>Gift Certificate</b> to enter
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}><CkText label="Gift certificate code" value={f.giftCert} onChange={f.setGiftCert} placeholder="GC-0000-0000" mono leading={<XI.gift size={14} />} /></div>
                <Btn variant="secondary" size="md">Apply</Btn>
                <Btn variant="ghost" size="md" onClick={() => { f.setGiftOpen(false); f.setGiftCert(''); }}>Cancel</Btn>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-tertiary)' }}>Billing Information</div>
            <CkSelect label="Payment type" value={f.payType} onChange={f.setPayType} options={['Credit Card']} />
            {SAVED_CARDS.length > 0 && <CkSelect label="Saved billing options" value={f.savedCard} onChange={f.setSavedCard} options={SAVED_CARDS.map((c) => ({ value: c.id, label: c.label }))} placeholder="Use a new card" />}
            {!f.savedCard && (
              <>
                <CkText label="Name on card" required value={f.card.name} onChange={(v) => f.setCard({ name: v })} placeholder="Debra Grimley" autoComplete="cc-name" />
                <CkText label="Card number" required value={f.card.num} onChange={(v) => f.setCard({ num: v })} placeholder="•••• •••• •••• ••••" mono leading={<I.card size={14} />} autoComplete="cc-number" />
                <CkRow2>
                  <CkText label="Security code" required value={f.card.cvc} onChange={(v) => f.setCard({ cvc: v.replace(/\D/g, '') })} placeholder="•••" mono width="calc(50% - 6px)" />
                  <CkText label="Expiration date" required value={f.card.exp} onChange={(v) => f.setCard({ exp: v })} placeholder="MM / YY" mono width="calc(50% - 6px)" />
                </CkRow2>
              </>
            )}
          </div>
        </div>
      </CkSection>

      {f.showAdmin && (
        <CkSection n={sn()} icon={<XI.shield size={16} />} title="Admin Order Details" sub="Rep overrides — not shown to the customer" optional>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CkRow2>
              <CkText label="Commitment override" value={f.admin.commitment} onChange={(v) => f.setAdmin({ commitment: v })} placeholder="e.g. 3 days" width="calc(50% - 6px)" />
              <CkText label="Priority override" value={f.admin.priority} onChange={(v) => f.setAdmin({ priority: v })} placeholder="e.g. Rush" width="calc(50% - 6px)" />
            </CkRow2>
            <div style={{ height: 1, background: 'var(--gb-border-subtle)' }} />
            <CkSelect label="Assign to sales rep" value={f.admin.salesRep} onChange={(v) => f.setAdmin({ salesRep: v })} options={SALES_REPS} placeholder="Unassigned" />
            <CkArea label="Custom order instructions" value={f.admin.instructions} onChange={(v) => f.setAdmin({ instructions: v })} placeholder="Internal production notes, special handling, art instructions, billing notes…" rows={3} />
          </div>
        </CkSection>
      )}
    </>
  );
}

/* ── personalization list (replaces the generic "send artwork" note) ──────── */
function ImprintList({ imprints, compact }) {
  if (!imprints || !imprints.length) {
    return <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', marginTop: 3 }}>Blank</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
      {imprints.map((im, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: compact ? 10 : 10.5, color: 'var(--gb-text-muted)', minWidth: 0 }}>
          {im.colorHex && <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: im.colorHex, border: '1px solid var(--gb-border-strong)' }} />}
          <span style={{ fontWeight: 700, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap' }}>{im.label}</span>
          {im.detail && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {im.detail}</span>}
          {im.color && !im.colorHex && <span style={{ whiteSpace: 'nowrap' }}>· {im.color}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── purchase rail ────────────────────────────────────────────────────────── */
function PurchaseLine({ line }) {
  return (
    <div style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--gb-border-subtle)' }}>
      <ProductPlate src={line.product.img} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.3 }}>{line.product.title}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
          <span>Qty <b style={{ color: 'var(--gb-text-secondary)' }}>{line.qty}</b></span>
          <span>Cost/Pack <b style={{ color: 'var(--gb-text-secondary)' }}>{money(line.unitPrice)}</b></span>
        </div>
        <ImprintList imprints={line.imprints} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{money(line.lineTotal)}</div>
    </div>
  );
}
function CostRow({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 500, color: strong ? 'var(--gb-text-primary)' : 'var(--gb-text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: strong ? 22 : 12.5, fontWeight: strong ? 800 : 600, fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', letterSpacing: strong ? -.5 : 0, color: strong ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)' }}>{value}</span>
    </div>
  );
}
function CheckoutSummary({ f, onEditCart }) {
  const { source, totals } = f;
  return (
    <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-brand-label)' }}>Your Purchase</div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 3, letterSpacing: -.2 }}>{source.name}</div>
        {source.company && <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{source.company}</div>}
        {f.shipMode === 'multi' && f.destinations.length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--gb-brand-label)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <XI.users size={11} /> Drop-ship to {f.destinations.length} {f.destinations.length === 1 ? 'business' : 'businesses'}
          </div>
        )}
      </div>
      <div style={{ padding: '4px 18px', maxHeight: 220, overflowY: 'auto' }}>
        {source.lines.map((l) => <PurchaseLine key={l.id} line={l} />)}
      </div>
      <div style={{ padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--gb-border-subtle)' }}>
        <CostRow label={`Subtotal · ${source.units} units`} value={money(source.subtotal + source.setupTotal)} />
        <CostRow label="Tax Total" value={money(totals.tax)} />
        <CostRow label="Standard Shipping" value={money(totals.shipping)} />
        <div style={{ height: 1, background: 'var(--gb-border-default)', margin: '4px 0' }} />
        <CostRow label="Order Total" value={money(totals.total)} strong />
      </div>
      <div style={{ padding: '0 18px 18px' }}>
        <Btn variant="primary" size="lg" full disabled={!f.canPlace || f.placing} state={f.placing ? 'loading' : 'idle'} icon={!f.placing && <XI.lock size={14} />} onClick={f.placeOrder}>
          {f.placing ? 'Placing order…' : 'Place Order · ' + money0(totals.total)}
        </Btn>
        {!f.canPlace && f.missing.length > 0 && (
          <div style={{ marginTop: 9, fontSize: 11, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--gb-warning-fg)', display: 'flex', marginTop: 1, flexShrink: 0 }}><XI.info size={12} /></span>
            <span>Still needed: {f.missing.join(', ')}</span>
          </div>
        )}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
          <XI.shield size={12} /> 100% Safe &amp; Secure
        </div>
      </div>
    </div>
  );
}

/* ── confirmation ─────────────────────────────────────────────────────────── */
function Confirmation({ f, onBack }) {
  const { orderNo, source, totals, ship, shipMode, destinations, payType, savedCard } = f;
  const dest = shipMode === 'multi' ? `${destinations.length} businesses` : ([ship.city, ship.state].filter(Boolean).join(', ') || '—');
  const payLabel = savedCard ? (SAVED_CARDS.find((c) => c.id === savedCard) || {}).label : payType;
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 0 50px' }}>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '32px 30px 26px', textAlign: 'center', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-success-tint-medium)', border: '1px solid var(--gb-success-tint-border)', color: 'var(--gb-success-fg)' }}><XI.check size={28} /></div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.4 }}>Order placed</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>{source.name} is confirmed.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '8px 14px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Order</span>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>{orderNo}</span>
          </div>
        </div>
        <div style={{ padding: '20px 30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
          {[['Order Total', money(totals.total)], ['Payment', payLabel], ['Ship to', dest], ['Standard Shipping', money(totals.shipping)]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{k}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gb-text-primary)', marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 30px 24px', borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" size="lg" icon={<XI.arrow />} onClick={onBack}>Back to proposal</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── embeddable composer ──────────────────────────────────────────────────── */
export function CheckoutComposer({ source, onBack }) {
  const f = useCheckoutForm(source, { showAdmin: true });
  const scrollRef = useRef(null);
  return (
    <CheckoutCtx.Provider value={{ dense: true }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)' }}>
        {f.orderNo ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            <Confirmation f={f} onBack={() => { f.resetOrder(); onBack && onBack(); }} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CheckoutSections f={f} scrollRef={scrollRef} />
            </div>
            <div style={{ width: 332, flexShrink: 0, borderLeft: '1px solid var(--gb-border-subtle)', overflowY: 'auto', padding: 16, background: 'var(--gb-fill-faint)' }}>
              <CheckoutSummary f={f} onEditCart={onBack} />
            </div>
          </div>
        )}
      </div>
    </CheckoutCtx.Provider>
  );
}
