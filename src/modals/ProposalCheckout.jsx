import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { Btn, I, Tag, Checkbox, Icon } from '../ui/index.js';

/* ───────────────────────────────────────────────────────────────────────────
   Proposal Checkout — embeddable composer (ported from the design bundle).
   Shipping → Billing → Payment (+ rep-only Admin) + a "Your Purchase" rail with
   the Place Order action. Single-address for now (multi-business drop-ship is a
   follow-up). The actual order POST is stubbed in placeOrder() — same TODO the
   design carried — and returns a mock order number for the confirmation screen.
   ─────────────────────────────────────────────────────────────────────────── */

/* local icons not in the shared `I` set */
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
};

const CheckoutCtx = React.createContext({ dense: false });
const money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');

const CK_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const CK_TAX_RATE = 0.0811;
const CK_STD_SHIP = 19.95;
const ART_EMAIL = 'art@golfballs.com';
const SAVED_ADDRESSES = [];   // populated from the account in a later pass
const SAVED_CARDS = [];
const SALES_REPS = ['House account'];

const emptyAddr = () => ({ saved: '', first: '', last: '', company: '', addr1: '', addr2: '', country: 'United States', city: '', state: '', zip: '', phone: '', setDefault: false });

/* ── form state hook ──────────────────────────────────────────────────────── */
function useCheckoutForm(source, opts = {}) {
  const showAdmin = opts.showAdmin !== false;
  const companyName = (source.company || '').split(' · ')[0];
  const [ship, setShipRaw] = useState(emptyAddr());
  const [delivery, setDelivery] = useState('ship');
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
  }, [companyName, source]);

  const patchShip = (p) => setShipRaw((s) => ({ ...s, ...p }));
  const patchBill = (p) => setBillRaw((s) => ({ ...s, ...p }));
  const setCard = (p) => setCardRaw((c) => ({ ...c, ...p }));
  const setAdmin = (p) => setAdminRaw((c) => ({ ...c, ...p }));

  const totals = useMemo(() => {
    const subtotal = (source.subtotal || 0) + (source.setupTotal || 0);
    const tax = subtotal * CK_TAX_RATE;
    const shipping = CK_STD_SHIP;
    return { subtotal, tax, shipping, total: subtotal + tax + shipping };
  }, [source.subtotal, source.setupTotal]);

  const addrOk = (a) => !!(a.saved || (a.first && a.last && a.addr1 && a.city && a.state && a.zip));
  const shipOk = addrOk(ship);
  const billOk = billSame || addrOk(bill);
  const payOk = !!savedCard || !!(card.name && card.num && card.cvc && card.exp);
  const missing = [];
  if (!shipOk) missing.push('shipping address');
  if (!billOk) missing.push('billing address');
  if (!payOk) missing.push('payment');
  const canPlace = missing.length === 0;
  const stepDone = { shipping: shipOk, billing: billOk, payment: payOk };

  const applyPromo = () => { if (promo.trim()) setPromoApplied(promo.trim().toUpperCase()); };
  const removePromo = () => { setPromoApplied(''); setPromo(''); };

  const placeOrder = () => {
    // TODO(backend): POST the assembled order (ship, bill, payType, card/savedCard,
    // promoApplied, giftCert, admin overrides, source lines) to the golfballs order
    // endpoint. Stubbed for now — mirrors the design.
    if (!canPlace) return;
    setPlacing(true);
    setTimeout(() => { setPlacing(false); setOrderNo('GB' + (1840000 + Math.floor(Math.random() * 9999))); }, 1100);
  };
  const resetOrder = () => setOrderNo(null);

  return {
    source, totals, showAdmin,
    ship, patchShip, delivery, setDelivery, billSame, setBillSame, bill, patchBill,
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
function CkSelect({ label, value, onChange, options, required, placeholder, width }) {
  const [focus, setFocus] = useState(false);
  const { dense } = useContext(CheckoutCtx);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: width || '100%', minWidth: 0 }}>
      {label && <FieldLabel required={required}>{label}</FieldLabel>}
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ ...baseFieldStyle(focus, false, dense), appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', color: value ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)', paddingRight: 30 }}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gb-text-muted)', pointerEvents: 'none', display: 'flex' }}><I.chevd size={12} /></span>
      </div>
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
function ProductPlate({ src, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: '#ffffff', border: '1px solid var(--gb-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4, boxSizing: 'border-box' }}>
      {src && <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />}
    </div>
  );
}

/* ── layout pieces ────────────────────────────────────────────────────────── */
function CkSection({ n, icon, title, sub, done, optional, children }) {
  return (
    <section style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', flexShrink: 0 }}>
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
function CkCheck({ checked, onClick, label }) {
  return <div onClick={onClick} style={{ cursor: 'pointer', display: 'inline-flex', maxWidth: '100%' }}><Checkbox checked={checked} label={label} /></div>;
}
function CkAddress({ a, set, savedAddresses }) {
  const usingSaved = !!a.saved;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {savedAddresses.length > 0 && (
        <CkSelect label="Saved addresses" value={a.saved} onChange={(v) => set({ saved: v })} options={savedAddresses.map((s) => ({ value: s.id, label: s.label }))} placeholder="Use a new address" />
      )}
      {!usingSaved && (
        <>
          <CkRow2>
            <CkText label="First name" required value={a.first} onChange={(v) => set({ first: v })} placeholder="Debra" width="calc(50% - 6px)" />
            <CkText label="Last name" required value={a.last} onChange={(v) => set({ last: v })} placeholder="Grimley" width="calc(50% - 6px)" />
          </CkRow2>
          <CkText label="Company" value={a.company} onChange={(v) => set({ company: v })} placeholder="Acme Corp" leading={<XI.building size={14} />} />
          <CkText label="Address 1" required value={a.addr1} onChange={(v) => set({ addr1: v })} placeholder="103 Guadalupe Palm Dr" leading={<XI.pin size={14} />} />
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

/* ── left column — sections ───────────────────────────────────────────────── */
function CheckoutSections({ f }) {
  let n = 0; const sn = () => (++n);
  return (
    <>
      <CkSection n={sn()} icon={<XI.truck size={16} />} title="Shipping Address" sub="Where the order ships" done={f.stepDone.shipping}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CkAddress a={f.ship} set={f.patchShip} savedAddresses={SAVED_ADDRESSES} />
          <div style={{ height: 1, background: 'var(--gb-border-subtle)' }} />
          <CkSelect label="Delivery method" value={f.delivery} onChange={f.setDelivery} options={[
            { value: 'ship', label: 'Please ship my packages' },
            { value: 'pickup', label: 'Pick up at Golfballs.com' },
          ]} />
        </div>
      </CkSection>

      <CkSection n={sn()} icon={<XI.receipt size={16} />} title="Billing Address" sub="Where the invoice goes" done={f.stepDone.billing}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CkCheck checked={f.billSame} onClick={() => f.setBillSame(!f.billSame)} label="Same as shipping address" />
          {!f.billSame && <CkAddress a={f.bill} set={f.patchBill} savedAddresses={SAVED_ADDRESSES} />}
        </div>
      </CkSection>

      <CkSection n={sn()} icon={<I.card size={16} />} title="Payment Options" sub="Promotion, gift certificate and payment" done={f.stepDone.payment}>
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
        {line.decorated && (
          <div style={{ fontSize: 10, color: 'var(--gb-brand-label)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <XI.info size={10} /> Send artwork to {ART_EMAIL}
          </div>
        )}
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
    <div className="gl-card" style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-brand-label)' }}>Your Purchase</div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 3, letterSpacing: -.2 }}>{source.name}</div>
        {source.company && <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{source.company}</div>}
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
  const { orderNo, source, totals, ship, payType, savedCard } = f;
  const dest = [ship.city, ship.state].filter(Boolean).join(', ') || '—';
  const payLabel = savedCard ? (SAVED_CARDS.find((c) => c.id === savedCard) || {}).label : payType;
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 0 50px' }}>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '32px 30px 26px', textAlign: 'center', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-success-tint-medium)', border: '1px solid var(--gb-success-tint-border)', color: 'var(--gb-success-fg)' }}>
            <XI.check size={28} />
          </div>
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
  return (
    <CheckoutCtx.Provider value={{ dense: true }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)' }}>
        {f.orderNo ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            <Confirmation f={f} onBack={() => { f.resetOrder(); onBack && onBack(); }} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CheckoutSections f={f} />
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
