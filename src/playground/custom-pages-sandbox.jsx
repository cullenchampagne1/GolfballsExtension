/* eslint-disable */
/* ─────────────────────────────────────────────────────────────
   custom-pages-sandbox — offline dev harness for the Custom Pages
   (Contact Details / Account Details takeovers).

   How it works WITHOUT the CRM / wifi:
   the page bundles (react-dist/content/{contact,account}-details.js,
   loaded by custom-pages-sandbox.html) register
     window.__gbCustomPages[id].render(rootEl, { pageId, store })
   and read all their data from ctx.store. So here we just feed them a
   FAKE store backed by mock data — the exact same render path the live
   engine uses, no schema engine or host page required.

   Controls: switch page (Contact / Account) and data state
   (Full / Empty / Loading) to exercise every branch.
─────────────────────────────────────────────────────────────── */
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

/* ── Mock engine data — same shape runEngine(doc).data produces
   (schema FIELDS keys). Dates are ISO strings, currency/number are
   numbers, missing scalars are '' — matching the real extractor. ── */
const CONTACT_DATA = {
  ids: { contact: '7467310', account: '97837' },
  contact: {
    firstName: 'Dustin', lastName: 'Cooley', middleInitial: 'H',
    email: 'dhcooley@ualr.edu', phone: '(870) 703-5729',
    jobTitle: 'Owner', companyName: 'Cooley Insurance',
    zipCode: '71901', state: 'AR', country: 'US',
    linkedInUrl: '', context: 'Prefers email. Buys for the agency every spring.',
    archived: false,
  },
  account: {
    name: 'Cooley Insurance', webAddress: 'https://cooleyins.com',
    mainAddress: '123 Central Ave', city: 'Hot Springs', postal: '71901',
    state: 'AR', country: 'US', creditApproved: '2022-06-01T00:00:00',
    creditRequirements: 'Net 30', territoryName: 'P5', salesRep: 'Cullen',
    userType: 'Corporate', createdBy: 'GabrielM', createdDate: '2022-05-23T00:00:00',
    contextNotes: 'Insurance agency, logo balls + gifts.', modifiedDate: '2026-05-20T14:15:00',
    taxExempt: false, partnerCampaign: 'Spring Promo', industry: 'Financial', linkedInUrl: '',
  },
  stats: {
    orderCount: 13, totalRevenue: 1821.17, lastOrderDate: '2026-03-27T17:08:00',
    priorYearRevenue: 629.58, ytdRevenue: 377.94, avgOrderSize: 140.09,
    mailerPoints: 0, mailerRemoved: 0, mailerRemoveDate: '', mailerTouchDate: '2022-05-23T00:00:00',
    lastBounceCode: '',
  },
  orders: [
    { number: '5027518', href: '#', summary: 'Titleist Pro V1 Personalized · Buy 3 DZ Get 1 DZ Free · 2025 Model', date: '2026-03-17T00:00:00', revenue: 377.94, status: 'Complete' },
    { number: '4847362', href: '#', summary: 'Titleist TruFeel Photo · 2024 Model · VIP Sign Up', date: '2025-08-09T00:00:00', revenue: 49.94, status: 'Complete' },
    { number: '4811510', href: '#', summary: 'Titleist TruFeel Photo · 2024 Model', date: '2025-06-26T00:00:00', revenue: 110.92, status: 'Complete' },
  ],
  items: [
    { name: 'Titleist 2022 TruFeel Custom Logo Golf Balls', quantity: 2, revenue: 75.98, orderCount: 1 },
    { name: 'Titleist 2023 Pro V1x Photo Golf Balls', quantity: 1, revenue: 69.99, orderCount: 1 },
    { name: 'Logo 6-Stripe Poker Chip Ball Marker · Black', quantity: 24, revenue: 59.76, orderCount: 1 },
  ],
  tasks: {
    open: [{ id: '659739', subject: 'Call & Email Promo Buyer', category: 'Order History Special', status: 'New', priority: 'High', liveDate: '2026-05-06T00:00:00', dueDate: '2026-05-22T00:00:00' }],
    done: [
      { id: '510428', subject: 'Last Chance: Call & Email TP5X Buyer 2025', category: 'Order History Special', priority: 'High', liveDate: '2026-03-24T00:00:00', dueDate: '2026-03-25T00:00:00' },
      { id: '491315', subject: 'Prior Year Call', category: 'Workflow Task', priority: 'Med', liveDate: '2026-03-05T00:00:00', dueDate: '2026-03-06T00:00:00' },
    ],
  },
  opportunities: [
    { id: '232066', subject: 'Spring agency restock', estimatedValue: 1200, estimatedCloseDate: '2026-06-15T00:00:00', stage: 'Prospect' },
  ],
  activities: [
    { employee: 'Caleb', category: 'Detail', direction: 'Out', subject: 'Opportunity #232066 stage changed to Prospect', date: '2026-04-23T09:37:00' },
    { employee: 'Caleb', category: 'Email', direction: 'Out', subject: 'Initial Order Followup Email Sent', date: '2026-03-30T08:43:00' },
    { employee: 'Graeme', category: 'Call', direction: 'Out', subject: 'Left voicemail re: spring promo', date: '2026-02-26T09:55:00' },
  ],
  emails: [
    { from: 'Kelli@golfballs.com', to: 'dhcooley@ualr.edu', subject: 'Order Update: Order #5027518', date: '2026-03-18T13:51:00', sizeBytes: 17408 },
    { from: 'Matthew@golfballs.com', to: 'dhcooley@ualr.edu', subject: 'NEW 2026 Titleist Balls!', date: '2026-03-06T17:24:00', sizeBytes: 202752 },
    { from: 'dhcooley@ualr.edu', to: 'Kirsten@golfballs.com', subject: '[EXTERNAL]Re: Logo Art File Needed', date: '2023-02-22T14:36:00', sizeBytes: 20480 },
  ],
  contacts: [],
};

const ACCOUNT_DATA = {
  ids: { contact: '7467310', account: '98943' },
  contact: { firstName: 'Barbara', lastName: 'Angus', email: 's2angus@aol.com', phone: '(555) 010-2030', state: 'AR', zipCode: '71901', country: 'US' },
  account: { ...CONTACT_DATA.account, name: 'Angus Holdings', industry: 'Real Estate', city: 'Little Rock' },
  stats: { ...CONTACT_DATA.stats, orderCount: 6, totalRevenue: 842.5 },
  orders: CONTACT_DATA.orders.slice(0, 2),
  items: CONTACT_DATA.items.slice(0, 2),
  tasks: CONTACT_DATA.tasks,
  opportunities: CONTACT_DATA.opportunities,
  activities: CONTACT_DATA.activities,
  emails: CONTACT_DATA.emails,
  contacts: [
    { fullName: 'Barbara Angus', firstName: 'Barbara', lastName: 'Angus', email: 's2angus@aol.com', phone: '(555) 010-2030', contactType: 'Corporate', partnerCampaign: 'Spring Promo', detailUrl: '#' },
    { fullName: 'Greg Angus', firstName: 'Greg', lastName: 'Angus', email: 'greg@angus.co', phone: '(555) 010-2031', contactType: 'Consumer', partnerCampaign: '', detailUrl: '#' },
  ],
};

function emptyData(base) {
  return {
    ids: base.ids, contact: {}, account: {}, stats: {},
    orders: [], items: [], tasks: { open: [], done: [] },
    opportunities: [], activities: [], emails: [], contacts: [],
  };
}

function dataFor(page, state) {
  const base = page === 'account_details' ? ACCOUNT_DATA : CONTACT_DATA;
  if (state === 'loading') return null;
  if (state === 'empty') return emptyData(base);
  return base;
}

/* Minimal external store the page subscribes to via useSyncExternalStore. */
function makeStore(initial) {
  let data = initial;
  const subs = new Set();
  return {
    get: () => data,
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    set: (d) => { data = d; subs.forEach((cb) => { try { cb(); } catch (e) {} }); },
  };
}

const PAGES = [
  { id: 'contact_details', label: 'Contact' },
  { id: 'account_details', label: 'Account' },
];
const STATES = [
  { id: 'full', label: 'Full data' },
  { id: 'empty', label: 'Empty' },
  { id: 'loading', label: 'Loading' },
];

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', borderRadius: 8 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{
              height: 24, padding: '0 12px', border: 0, borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 600,
              background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Sandbox() {
  const [page, setPage] = useState('contact_details');
  const [state, setState] = useState('full');
  const hostRef = useRef(null);
  const stores = useRef({});

  // (Re)mount the selected page bundle's render() into the host.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reg = window.__gbCustomPages && window.__gbCustomPages[page];
    if (!reg || typeof reg.render !== 'function') {
      host.innerHTML = '<div style="padding:40px;color:#e25a5a;font-family:monospace">Page bundle not registered: ' + page + '<br>(check the &lt;script&gt; tags in custom-pages-sandbox.html)</div>';
      return;
    }
    if (!stores.current[page]) stores.current[page] = makeStore(dataFor(page, state));
    else stores.current[page].set(dataFor(page, state));
    let cleanup = null;
    try { cleanup = reg.render(host, { pageId: page, store: stores.current[page] }); } catch (e) { host.innerHTML = '<pre style="padding:24px;color:#e25a5a">' + (e && e.stack || e) + '</pre>'; }
    return () => { try { cleanup && cleanup(); } catch (e) {} try { host.innerHTML = ''; } catch (e) {} };
  }, [page]);

  // Swap data state without remounting (store push → useSyncExternalStore).
  useEffect(() => {
    const s = stores.current[page];
    if (s) s.set(dataFor(page, state));
  }, [state, page]);

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 46, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
        background: 'var(--gb-surface-canvas)', borderBottom: '1px solid var(--gb-border-default)',
        fontFamily: 'var(--gb-font-sans)',
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Custom Pages Sandbox</span>
        <Seg options={PAGES} value={page} onChange={setPage} />
        <Seg options={STATES} value={state} onChange={setState} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>mock data · no CRM</span>
      </div>
      <div ref={hostRef} style={{ position: 'fixed', top: 46, left: 0, right: 0, bottom: 0 }} />
    </>
  );
}

const mount = document.createElement('div');
document.body.appendChild(mount);
createRoot(mount).render(<Sandbox />);
