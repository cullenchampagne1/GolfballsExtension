import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Field, Input, Dropdown, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   CRMCreateContact — React port of content/crm-create-contact-modal.js.

   Surface: 720px wide, 4 sections (Contact · Account/Location ·
   Segmentation · Source/Flags). Layout matches the design's
   CRMCreateView from surfaces-2.jsx.

   Two server endpoints:
     1. Account autocomplete
        GET https://api.golfballs.com/golfballs/crm/Admin/AutoComplete/Account.ajax?q=…
     2. Create contact
        GET https://api.golfballs.com/golfballs/crm/Admin/Contact/NewContact.ajax?<JSON-payload>

   Both calls can fail. We:
     • Silently swallow autocomplete failures and surface a single
       "Account search is unavailable" toast — typing falls back to a
       plain input. The user can still submit (the account name field
       still gets sent, just without an ID match).
     • Catch create-contact failures and surface a clear toast with
       what went wrong. Form state is preserved so the user can retry.

   Playground fallback: when fetch isn't talking to a real server
   (extension context detection misses, CORS blocks, etc.) the
   submit handler can mock-resolve so the modal stays demo-able.
   Toggled via the dev setting `crmCreateContact.useMock`.
─────────────────────────────────────────────────────────────── */

/* ── Option sets — lifted verbatim from the original. ───────── */
const TERRITORIES = [
  ['0','Not Set'],['1','P1 / SR (Lorie)'],['2','P1 / SA (AlexS)'],['3','P1 / BDR (Ashlund)'],
  ['4','P2 / SR (Melanie)'],['5','P2 / SA (RyanG)'],['6','P2 / BDR (Rickey)'],
  ['7','P3 / SR (Scott)'],['8','P3 / SA (Tyler)'],['9','P3 / BDR (Kade)'],
  ['10','P4 / SR (Andy)'],['11','P4 / SA (Sam)'],['12','P4 / BDR (Joshua)'],
  ['13','P5 / SR (Seth)'],['14','P5 / SA (Matthew)'],['15','P5 / BDR (Cullen)'],
  ['16','P6 / SR (Brendan)'],['17','P6 / SA (Brodie)'],['18','P6 / BDR (Kevin)'],
  ['19','P7 / SR (Joby)'],['20','P7 / SA (Cameron)'],['21','P7 / BDR (BryceS)'],
  ['22','P8 / SR (Collin)'],['23','P8 / SA (Spencer)'],['24','P8 / BDR (Clay)'],
  ['25','P9 / SR (Mitch)'],['26','P9 / SA (BryceZ)'],['27','P9 / BDR (Gage)'],
  ['28','P0 / 6Sense (NathanR)'],['29','P0 / Testing (NathanR)'],['30','P0 / Sales Dev (NathanR)'],
  ['31','P0 / Admin (Bryan)'],['32','P0 / IT Testing (TannerL)'],
  ['33','P10 / SR (Loganb)'],['34','P10 / SA (Loganb)'],['35','P10 / BDR (Loganb)'],
];
const INDUSTRIES = [
  ['','Select'],['Aerospace & Defense','Aerospace & Defense'],['Agriculture','Agriculture'],
  ['Associations & Non Profits','Associations & Non Profits'],['Automotive','Automotive'],
  ['Biotech & Pharmaceuticals','Biotech & Pharmaceuticals'],['Business Services','Business Services'],
  ['Construction & Engineering','Construction & Engineering'],
  ['Consumer Goods & Services','Consumer Goods & Services'],
  ['Education','Education'],['Energy & Utilities','Energy & Utilities'],['Financial','Financial'],
  ['Government','Government'],['Hardware & Semiconductors','Hardware & Semiconductors'],
  ['Healthcare & Medical','Healthcare & Medical'],
  ['Hospitality, Travel, and Recreation','Hospitality, Travel, and Recreation'],
  ['Industrial Manufacturing','Industrial Manufacturing'],
  ['Information Technology','Information Technology'],['Internet','Internet'],
  ['Media & Entertainment','Media & Entertainment'],
  ['Real Estate, Rentals, and Leasing','Real Estate, Rentals, and Leasing'],
  ['Software','Software'],['Telecommunications','Telecommunications'],
  ['Transportation & Logistics','Transportation & Logistics'],
  ['Wholesale & Distribution','Wholesale & Distribution'],
];
const EMP_RANGES = [
  ['','Select'],['0 - 9','0 - 9'],['10 - 19','10 - 19'],['20 - 49','20 - 49'],
  ['50 - 99','50 - 99'],['100 - 249','100 - 249'],['250 - 499','250 - 499'],
  ['500 - 999','500 - 999'],['1,000 - 4,999','1,000 - 4,999'],
  ['5,000 - 9,999','5,000 - 9,999'],['10,000+','10,000+'],
];
const REV_RANGES = [
  ['','Select'],['$1 - $1M','$1 - $1M'],['$1M - $5M','$1M - $5M'],
  ['$5M - $10M','$5M - $10M'],['$10M - $25M','$10M - $25M'],['$25M - $50M','$25M - $50M'],
  ['$50M - $100M','$50M - $100M'],['$100M - $250M','$100M - $250M'],
  ['$250M - $500M','$250M - $500M'],['$500M - $1B','$500M - $1B'],
  ['$1B - $2.5B','$1B - $2.5B'],['$2.5B - $5B','$2.5B - $5B'],['$5B+','$5B+'],
];
const CAMPAIGNS = [
  ['0','Select'],['1774','6Sense'],['1775','Bing / Yahoo'],['1776','Chat'],
  ['1777','Customer Referral'],['1778','Facebook'],['1779','Friend / Referral'],
  ['1780','Google Search'],['1833','Instagram'],['1834','LinkedIn'],
  ['1781','Online Order'],['1782','Phone Call'],['1783','Retargeting'],
  ['1784','Sales Person Outreach'],['1785','TV'],['1786','Webform'],
];
const CUSTOMER_TYPES = [
  ['0','Select'],['1','Consumer'],['2','Business - Buyer'],
  ['3','Business - Influencer'],['4','Business - Processor'],
];
const COUNTRIES = [
  ['US','United States'],['CA','Canada'],['OTH','Other'],
];
const FLAGS = [
  ['BoolConsumer','Consumer'],['BoolCustom','Custom'],['BoolRep','Rep'],
  ['BoolOneToOne','One-to-One'],['BoolRetail','Retail'],['BoolDelay','Delay'],
];

const toDdOpts = (pairs) => pairs.map(([id, label]) => ({ id, label }));

/* ── Endpoints ────────────────────────────────────────────── */
const ENDPOINT_AC      = 'https://api.golfballs.com/golfballs/crm/Admin/AutoComplete/Account.ajax';
const ENDPOINT_CREATE  = 'https://api.golfballs.com/golfballs/crm/Admin/Contact/NewContact.ajax';

/* Are we in an extension context with chrome.runtime + the host
   permission needed to reach the api domain? Used to decide whether
   to attempt the real network calls or fall back to mock data. */
function detectExtensionContext() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch { return false; }
}

/* Mock account search — used when there's no live server. Filters
   a small hand-picked list of plausible accounts so the playground
   modal shows realistic autocomplete behaviour. */
const MOCK_ACCOUNTS = [
  { ID: 'A-2188', Text: 'Acme Industries',         SecondaryText: 'San Francisco, CA' },
  { ID: 'A-2189', Text: 'Acme Hospitality Group',  SecondaryText: 'San Jose, CA' },
  { ID: 'A-1187', Text: 'Pebble Beach Resort',     SecondaryText: 'Pebble Beach, CA' },
  { ID: 'A-4517', Text: 'TaylorMade Promo',        SecondaryText: 'Carlsbad, CA' },
  { ID: 'A-5223', Text: 'Brown Custom Gifts',      SecondaryText: 'Atlanta, GA' },
  { ID: 'A-6612', Text: 'OC Fitness',              SecondaryText: 'Dublin, IE' },
];
async function mockAccountSearch(q) {
  await new Promise((r) => setTimeout(r, 320 + Math.random() * 220));
  const ql = q.toLowerCase();
  return MOCK_ACCOUNTS.filter((a) => a.Text.toLowerCase().includes(ql));
}

/* Mock contact create — sleeps + always succeeds (so the toast
   path is the visible result). Returns a fake contact ID. */
async function mockCreateContact() {
  await new Promise((r) => setTimeout(r, 700));
  return { contactID: 99000 + Math.floor(Math.random() * 999) };
}

/* ── Component ────────────────────────────────────────────────── */
export function CRMCreateContact({ onClosed, bindClose }) {
  const toast = useToast();
  const draggable = useDevSetting('crmCreateContact.draggable') ?? true;
  const forceMock = useDevSetting('crmCreateContact.useMock') ?? false;
  // Detect once at mount — if the user toggles `useMock` they get the
  // new mode on the next open, which is fine.
  const useMock = forceMock || !detectExtensionContext();

  // ── Field state. Grouped by section for clarity. ───────────
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [jobTitle, setJobTitle]     = useState('');
  const [company, setCompany]       = useState('');

  const [linkedIn, setLinkedIn]     = useState('');
  const [accountText, setAccountText] = useState('');
  const [accountId, setAccountId]   = useState('');
  const [address, setAddress]       = useState('');
  const [city, setCity]             = useState('');
  const [postal, setPostal]         = useState('');
  const [country, setCountry]       = useState('US');

  const [industry, setIndustry]     = useState('');
  const [empRange, setEmpRange]     = useState('');
  const [revRange, setRevRange]     = useState('');
  const [custType, setCustType]     = useState('0');
  const [territory, setTerritory]   = useState('15');
  const [campaign, setCampaign]     = useState('0');

  const [sourceDetails, setSourceDetails] = useState('');
  const [flags, setFlags] = useState(() =>
    Object.fromEntries(FLAGS.map(([k]) => [k, false])));

  // ── Submit state. ───────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg]   = useState('');     // footer hint
  const [statusTone, setStatusTone] = useState('info'); // 'info' | 'ok' | 'err'
  const [submittedId, setSubmittedId] = useState(null);
  const [invalid, setInvalid]       = useState({ firstName: false, lastName: false, email: false });

  // ── Account autocomplete. ───────────────────────────────────
  const [acResults, setAcResults] = useState(null); // null = closed, [] = no matches, [...] = matches
  const [acStatus, setAcStatus] = useState('idle'); // idle | loading | error
  const [acHighlight, setAcHighlight] = useState(-1);
  const acTimer = useRef(null);
  // Whether we've shown the "search unavailable" toast yet for this
  // mount — avoids spamming if the user keeps typing while the
  // server is down.
  const acErrorSurfaced = useRef(false);

  // Debounced search whenever accountText changes.
  useEffect(() => {
    if (accountId) return undefined; // user already picked → skip live search
    const q = accountText.trim();
    if (q.length < 2) {
      setAcResults(null);
      setAcStatus('idle');
      return undefined;
    }
    clearTimeout(acTimer.current);
    acTimer.current = setTimeout(async () => {
      setAcStatus('loading');
      try {
        let items;
        if (useMock) {
          items = await mockAccountSearch(q);
        } else {
          const res = await fetch(`${ENDPOINT_AC}?q=${encodeURIComponent(q)}`, { credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          items = await res.json();
        }
        setAcResults(Array.isArray(items) ? items : []);
        setAcStatus('idle');
        setAcHighlight(-1);
      } catch (e) {
        // Graceful fallback: stop surfacing the popover so the input
        // behaves like plain text. Toast once per modal session.
        setAcResults(null);
        setAcStatus('error');
        if (!acErrorSurfaced.current) {
          acErrorSurfaced.current = true;
          toast?.error?.('Account search is unavailable — you can still type a name', { duration: 4500 });
        }
      }
    }, 280);
    return () => clearTimeout(acTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountText, accountId, useMock]);

  const pickAccount = (item) => {
    setAccountId(String(item.ID));
    setAccountText(item.Text);
    setAcResults(null);
    setAcStatus('idle');
  };
  const clearAccountPick = () => { if (accountId) setAccountId(''); };

  const onAccountInput = (v) => {
    setAccountText(v);
    clearAccountPick();
  };
  const onAccountKeyDown = (e) => {
    if (!acResults || acResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcHighlight((i) => Math.min(acResults.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && acHighlight >= 0) {
      e.preventDefault();
      pickAccount(acResults[acHighlight]);
    } else if (e.key === 'Escape') {
      setAcResults(null);
    }
  };

  // ── Submit. ─────────────────────────────────────────────────
  const onSubmit = async () => {
    // Required-fields validation up front.
    const nextInvalid = {
      firstName: !firstName.trim(),
      lastName:  !lastName.trim(),
      email:     !email.trim(),
    };
    setInvalid(nextInvalid);
    if (nextInvalid.firstName || nextInvalid.lastName || nextInvalid.email) {
      setStatusMsg('Required fields are missing.');
      setStatusTone('err');
      toast?.warning?.('Fill in the required fields marked *');
      return;
    }

    setSubmitting(true);
    setStatusMsg('Submitting…');
    setStatusTone('info');

    const payload = {
      AccountLookup:    accountText.trim(),
      AccountLookup_ID: accountId || '',
      AccountWebAddress: '',
      MainAddress:      address.trim(),
      MainCity:         city.trim(),
      MainPostal:       postal.trim(),
      MainCountry:      country,
      TerritoryID:      territory,
      LinkedInURL:      linkedIn.trim(),
      Industry:         industry,
      SubIndustry:      '',
      EmployeeRange:    empRange,
      EstimatedRevenue: revRange,
      EmailLookup:      email.trim(),
      EmailLookup_ID:   'Email not found.',
      FirstName:        firstName.trim(),
      LastName:         lastName.trim(),
      jobTitle:         jobTitle.trim(),
      CompanyName:      company.trim(),
      PhoneNumber:      phone.trim(),
      ParCamp_ID:       campaign,
      SourceDetails:    sourceDetails.trim(),
      CustomerType:     custType,
      ...Object.fromEntries(FLAGS.map(([k]) => [k, String(!!flags[k])])),
    };

    try {
      let newId;
      if (useMock) {
        const out = await mockCreateContact();
        newId = out.contactID;
      } else {
        const res = await fetch(`${ENDPOINT_CREATE}?${JSON.stringify(payload)}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        // Server returns either a numeric contact id, a {contactID,…}
        // object, or an error string. Mirror the original heuristic.
        const isSuccess = parsed != null
          ? (typeof parsed === 'object' ? !parsed.error : !Number.isNaN(Number(parsed)))
          : (text && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('fail'));
        if (!isSuccess) throw new Error(text || 'Unexpected response');
        newId = parsed != null
          ? (typeof parsed === 'object' ? (parsed.contactID || parsed.id || parsed) : parsed)
          : text.trim();
      }
      setStatusMsg(`✓ Contact created (#${newId})`);
      setStatusTone('ok');
      setSubmittedId(newId);
      toast?.success?.(`Contact created: ${firstName} ${lastName}`);
      // In the live extension, navigate to the new contact page.
      // Mocked mode (or detection-miss) just closes after a beat.
      if (!useMock && newId && !Number.isNaN(Number(newId))) {
        setTimeout(() => {
          window.location.href = `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=239&ContactID=${newId}`;
        }, 900);
      } else {
        setTimeout(() => bindCloseRef.current?.(), 1400);
      }
    } catch (err) {
      const msg = err?.message || 'Unknown error';
      setStatusMsg(`Error: ${msg}`);
      setStatusTone('err');
      toast?.error?.(`Couldn't create contact — ${msg}`, { duration: 5000 });
      setSubmitting(false);
    }
  };

  // Track the bindClose fn from FloatingPanel so the success branch
  // can call it directly (animated close + onClosed unmount).
  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  const allRequiredFilled = !!(firstName.trim() && lastName.trim() && email.trim());

  return (
    <FloatingPanel
      width={720}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        accent
        icon={<I.user size={14} />}
        title="New Contact"
        subtitle={
          <span>
            Create CRM Contact
            {useMock && (
              <>
                {' · '}
                <span style={{
                  fontFamily: 'var(--gb-font-mono)',
                  color: 'var(--gb-warning-fg)',
                  fontWeight: 700, fontSize: 10,
                }}>OFFLINE / MOCK</span>
              </>
            )}
          </span>
        }
      />

      <div style={{
        padding: 16,
        maxHeight: 'min(70vh, 560px)',
        overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* ── Contact Info ── */}
        <SectionHdr>Contact Info</SectionHdr>
        <Grid3>
          {/* Required fields are outlined red while empty. Once the user
              fills them in, the red drops; if they submit empty, the
              error MESSAGE also surfaces beneath the input. */}
          <Field
            label="First name" required
            error={invalid.firstName ? 'Required' : null}
          >
            <Input
              value={firstName}
              onChange={(v) => { setFirstName(v); setInvalid((i) => ({ ...i, firstName: false })); }}
              placeholder="First name"
              error={!firstName.trim()}
              autoFocus
            />
          </Field>
          <Field
            label="Last name" required
            error={invalid.lastName ? 'Required' : null}
          >
            <Input
              value={lastName}
              onChange={(v) => { setLastName(v); setInvalid((i) => ({ ...i, lastName: false })); }}
              placeholder="Last name"
              error={!lastName.trim()}
            />
          </Field>
          <Field
            label="Email" required
            error={invalid.email ? 'Required' : null}
          >
            <Input
              value={email}
              onChange={(v) => { setEmail(v); setInvalid((i) => ({ ...i, email: false })); }}
              placeholder="name@example.com"
              error={!email.trim()}
            />
          </Field>
        </Grid3>
        <Grid3>
          <Field label="Phone"><Input value={phone} onChange={setPhone} placeholder="(415) 555-0100" /></Field>
          <Field label="Job title"><Input value={jobTitle} onChange={setJobTitle} placeholder="Purchasing manager" /></Field>
          <Field label="Company"><Input value={company} onChange={setCompany} placeholder="Acme Industries" /></Field>
        </Grid3>

        {/* ── Account & Location ── */}
        <SectionHdr>Account &amp; Location</SectionHdr>
        <Grid3>
          <Field label="LinkedIn URL">
            <Input value={linkedIn} onChange={setLinkedIn} placeholder="https://linkedin.com/in/…" />
          </Field>
          <Field
            label={accountId ? 'Account lookup · linked' : 'Account lookup'}
            hint={acStatus === 'error' ? 'Search unavailable' : undefined}
          >
            <AccountAutocomplete
              value={accountText}
              accountId={accountId}
              status={acStatus}
              results={acResults}
              highlight={acHighlight}
              onInput={onAccountInput}
              onKeyDown={onAccountKeyDown}
              onPick={pickAccount}
              onUnlink={() => { setAccountId(''); setAccountText(''); }}
              onHighlight={setAcHighlight}
              onClose={() => setAcResults(null)}
            />
          </Field>
          <Field label="Address"><Input value={address} onChange={setAddress} placeholder="482 Brannan St #310" /></Field>
        </Grid3>
        <Grid3>
          <Field label="City"><Input value={city} onChange={setCity} placeholder="San Francisco" /></Field>
          <Field label="Postal"><Input value={postal} onChange={setPostal} placeholder="94107" /></Field>
          <Field label="Country">
            <Dropdown value={country} onChange={setCountry} options={toDdOpts(COUNTRIES)} />
          </Field>
        </Grid3>

        {/* ── Segmentation & Assignment ── */}
        <SectionHdr>Segmentation &amp; Assignment</SectionHdr>
        <Grid3>
          <Field label="Industry"><Dropdown value={industry} onChange={setIndustry} options={toDdOpts(INDUSTRIES)} searchable /></Field>
          <Field label="Employee range"><Dropdown value={empRange} onChange={setEmpRange} options={toDdOpts(EMP_RANGES)} /></Field>
          <Field label="Est. revenue"><Dropdown value={revRange} onChange={setRevRange} options={toDdOpts(REV_RANGES)} /></Field>
        </Grid3>
        <Grid3>
          <Field label="Customer type"><Dropdown value={custType} onChange={setCustType} options={toDdOpts(CUSTOMER_TYPES)} /></Field>
          <Field label="Territory"><Dropdown value={territory} onChange={setTerritory} options={toDdOpts(TERRITORIES)} searchable /></Field>
          <Field label="Campaign"><Dropdown value={campaign} onChange={setCampaign} options={toDdOpts(CAMPAIGNS)} searchable /></Field>
        </Grid3>

        {/* ── Source & Flags ── */}
        <SectionHdr>Source &amp; Flags</SectionHdr>
        <Field label="Source details">
          <Input value={sourceDetails} onChange={setSourceDetails} placeholder="PGA Show 2026 — booth visit" />
        </Field>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {FLAGS.map(([key, label]) => {
            const on = !!flags[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFlags((s) => ({ ...s, [key]: !on }))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px',
                  borderRadius: 'var(--gb-r-sm)',
                  fontSize: 11, fontWeight: 600,
                  background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                  border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
                  color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background-color .15s, border-color .15s, color .15s',
                }}
              >
                {on && <I.check size={10} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 11, fontWeight: 600,
          color: statusTone === 'ok'  ? 'var(--gb-brand-label)' :
                 statusTone === 'err' ? 'var(--gb-error-fg)'    :
                                        'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {statusMsg ? (
            <>
              {statusTone === 'ok'  && <I.check size={11} />}
              {statusTone === 'err' && <I.alert size={11} />}
              <span>{statusMsg}</span>
            </>
          ) : allRequiredFilled ? (
            <>
              <I.check size={11} style={{ color: 'var(--gb-brand-label)' }} />
              <span style={{ color: 'var(--gb-brand-label)' }}>Required fields filled</span>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--gb-error-fg)', fontWeight: 700 }}>*</span>
              <span>Fill required fields</span>
            </>
          )}
        </div>
        <Btn size="sm" variant="secondary" onClick={() => bindCloseRef.current?.()} disabled={submitting}>Cancel</Btn>
        <Btn
          size="sm"
          variant="tinted"
          status={submittedId ? 'success' : 'brand'}
          icon={submitting ? <Spinner /> : submittedId ? <I.check size={11} /> : <I.user size={11} />}
          onClick={onSubmit}
          disabled={submitting || !!submittedId}
        >
          {submittedId ? 'Created' : submitting ? 'Creating…' : 'Create contact'}
        </Btn>
      </div>
    </FloatingPanel>
  );
}

/* ── Section header — brand-uppercase rule from the design. */
function SectionHdr({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: 1.2,
      color: 'var(--gb-brand-label)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      paddingBottom: 6,
      marginTop: 8, marginBottom: 6,
    }}>{children}</div>
  );
}
function Grid3({ children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
      marginBottom: 4,
    }}>{children}</div>
  );
}

/* ── AccountAutocomplete ─────────────────────────────────────
   Custom: composes the design-system Input with an absolutely-
   positioned results panel underneath. Closes on outside click. */
function AccountAutocomplete({
  value, accountId, status, results, highlight,
  onInput, onKeyDown, onPick, onUnlink, onHighlight, onClose,
}) {
  const wrapRef = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const open = !!results && !accountId;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <Input
        value={value}
        onChange={onInput}
        onKeyDown={onKeyDown}
        placeholder={status === 'error' ? 'Type account name…' : 'Search account name…'}
        leading={accountId
          ? <I.check size={11} style={{ color: 'var(--gb-brand-label)' }} />
          : <I.search size={11} />}
        trailing={accountId
          ? <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onUnlink(); }}
              title="Unlink account"
              style={{
                width: 18, height: 18, padding: 0,
                background: 'transparent', border: 'none',
                color: 'var(--gb-text-tertiary)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><I.close size={10} /></button>
          : status === 'loading' ? <Spinner /> : null}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)', left: 0, right: 0,
              zIndex: 100,
              maxHeight: 220, overflowY: 'auto',
              background: 'var(--gb-surface-modal)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-sm)',
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
            }}
          >
            {results.length === 0 ? (
              <div style={{
                padding: '10px 12px',
                fontSize: 11.5,
                color: 'var(--gb-text-tertiary)',
                textAlign: 'center',
              }}>No matching accounts</div>
            ) : (
              results.map((item, i) => (
                <button
                  key={item.ID + i}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onPick(item); }}
                  onMouseEnter={() => onHighlight(i)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    padding: '7px 10px',
                    background: highlight === i ? 'var(--gb-fill-soft)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--gb-border-subtle)',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: 'var(--gb-text-primary)',
                  }}>{item.Text}</span>
                  {item.SecondaryText && (
                    <span style={{
                      fontSize: 10.5,
                      color: 'var(--gb-text-tertiary)',
                    }}>{item.SecondaryText}</span>
                  )}
                  <span style={{
                    marginLeft: 'auto',
                    fontFamily: 'var(--gb-font-mono)',
                    fontSize: 10,
                    color: 'var(--gb-text-muted)',
                  }}>{item.ID}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Tiny inline spinner — matches the design's submit-button spinner. */
function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{
        animation: 'gbCcmSpin 1s linear infinite',
        transformOrigin: 'center',
      }} />
      <style>{`@keyframes gbCcmSpin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}
