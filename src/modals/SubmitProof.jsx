import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Field, Input, Dropdown, Tag, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';
import { ImagePreview } from './ImagePreview.jsx';

/* ───────────────────────────────────────────────────────────────
   SubmitProof — React port of the proof-submission flow that used
   to live inside content/logo-extractor.js.

   States (in order):
     'awaiting-image'  — no image passed in → mount full ImagePreview
                         first; ImagePreview's "Use this image" wakes
                         this modal with the chosen image dataUrl/URL
     'form'             — main proof form (matches the design's
                          SubmitProofView from surfaces-3.jsx)
     'submitting'       — looping through each selected item, one
                          chrome.runtime.sendMessage per item
     'results'          — shows the generated links + per-item status

   Server failures (all surfaced as toasts):
     • Dropdown scrape fails → reps/artists fall back to free-text
       inputs. User can still submit.
     • Gallery scrape fails → "Previous proofs unavailable" toast,
       gallery panel hidden, form still works.
     • Submit fails → toast + button re-enabled, form state preserved.

   Public props:
     image            { dataUrl?: string, url?: string }   — passed when
                       opened from ImagePreview's "Submit Proof" button
     orderId          string  — pre-fill order #
     customerId       string  — pre-fill cust id (also drives gallery)
     onClosed         () => void
     bindClose        (close: () => void) => void
─────────────────────────────────────────────────────────────── */

const ENDPOINT_PAGE128 = '/golfballs/adminnew/Default.aspx?Page=128';
const ENDPOINT_CRM240  = (custId) => `/golfballs/adminnew/Default.aspx?Page=240&customerID=${custId}`;

const ITEMS = [
  'Pad to Digital Request', 'Ball',
  'Apparel (Shirts, Polos, Outerwear, Shorts)', 'Hats', 'Towels', 'Bags', 'Gloves',
  'Poker Chip', 'Ball Marker', 'Divot Tools',
  'Tees',
  'Gift Set - 6 Ball - Wooden Box - Poker Chip',
  'Gift Set - 6 Ball - Wooden Box - Classic Divot Tool',
  'Gift Set - 6 Ball - Black Box - Poker Chip',
  'Gift Set - 6 Ball - Black Box - Bartender Divot Tool',
  'Gift Set - 6 Ball - Black Box - Lever Divot Tool',
  'Gift Set - 6 Ball - Black Box - Classic Divot Tool',
  'Gift Set - Single Sleeve - Black Box - Bartender Divot Tool',
  'Gift Set - Single Sleeve - Black Box - Lever Divot Tool',
  'Gift Set - Single Sleeve - Black Box - Poker Chip',
  'Gift Set - Accessory - Black Box - Bartender Divot Tool',
  'Gift Set - Accessory - Black Box - Bartender Divot Tool w/ Poker Chip',
  'Gift Set - Accessory - Black Box - Poker Chips',
  'Gift Set - Accessory - Black Box - Lever Divot Tool',
  'Gift Set - Accessory - Black Box - Poker Chips with Tees',
  'Flags', 'Other',
];

const GROUP_MAP = {
  'Ball': 'ball',
  'Apparel (Shirts, Polos, Outerwear, Shorts)': 'apparel',
  'Hats': 'apparel', 'Towels': 'apparel', 'Bags': 'apparel', 'Gloves': 'apparel',
  'Poker Chip': 'poker', 'Ball Marker': 'poker', 'Divot Tools': 'poker',
  'Tees': 'tees', 'Flags': 'flags', 'Other': 'other',
};

const DYN_FIELDS = {
  ball: [
    { id: 'logoType',    type: 'select', label: 'Logo type',          options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Ball' },
    { id: 'color',       type: 'select', label: 'Ball color',         options: ['White','Gray','Yellow','Red','Orange','Green','Pink','Blue','Purple','Multi-Color'], default: 'White' },
    { id: 'imprint',     type: 'text',   label: 'Imprint color',      hint: 'Recommended: Black, Silver, Gold', dependsOn: 'color', dependsNotValue: 'White' },
    { id: 'dozens',      type: 'text',   label: 'Number of dozens',   hint: 'Pad=50dz+, Digital=49dz-' },
    { id: 'printMethod', type: 'select', label: 'Print method',       options: ['Digital', 'Pad'], default: 'Digital' },
  ],
  apparel: [
    { id: 'logoType',  type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Embroidery' },
    { id: 'decorator', type: 'select', label: 'Decorator', options: ['TM Works or Alphabroder (Isacord)', 'Ignite/Other (Madeira)', 'In-House (Venture Towels)'], default: 'TM Works or Alphabroder (Isacord)' },
    { id: 'method',    type: 'select', label: 'Decoration method', options: ['Embroidery', 'Heat Seal', 'Direct to Film Transfer (Ignite)', 'Screen Print', 'Sublimation', 'Other - See Special Instructions'], default: 'Embroidery' },
    { id: 'color',     type: 'text',   label: 'Item color' },
    { id: 'placement', type: 'text',   label: 'Logo placement', hint: 'Ex. Left Chest, Right Sleeve' },
    { id: 'imprint',   type: 'text',   label: 'Imprint color', hint: 'Notate if Pantone matching needed' },
  ],
  poker: [
    { id: 'logoType', type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
    { id: 'color',    type: 'text',   label: 'Item color' },
    { id: 'imprint',  type: 'text',   label: 'Imprint color', hint: 'Notate if Pantone matching needed' },
  ],
  tees: [
    { id: 'logoType', type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
    { id: 'size',     type: 'select', label: 'Tee size', options: ['2 3/4in', '3 1/4in'], default: '2 3/4in' },
    { id: 'imprint',  type: 'select', label: 'Imprint color (tees)', options: ['One Color', 'Two Color'], default: 'One Color', hint: 'Black tees: White, Silver, Gold only' },
    { id: 'color',    type: 'text',   label: 'Item color' },
  ],
  flags: [
    { id: 'logoType', type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
    { id: 'color',    type: 'text',   label: 'Item color' },
  ],
  other: [
    { id: 'logoType', type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
    { id: 'name',     type: 'text',   label: 'Item name' },
    { id: 'color',    type: 'text',   label: 'Item color' },
    { id: 'imprint',  type: 'text',   label: 'Imprint color', hint: 'Notate if Pantone matching needed' },
  ],
  giftset: [
    { id: 'logoType', type: 'select', label: 'Logo type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Gift Set' },
  ],
};

function getDynFieldsFor(item) {
  if (item.startsWith('Gift Set')) return DYN_FIELDS.giftset;
  return DYN_FIELDS[GROUP_MAP[item]] || DYN_FIELDS.other;
}

const STATUS_OPTS = [
  { id: '1',  label: 'New logo (no proof yet)' },
  { id: '2',  label: 'Awaiting approval (proof created)' },
  { id: '4',  label: 'Digitization queue' },
  { id: '10', label: 'Approved' },
];

/* ── Extension-context detection (same trick as CRMCreateContact) */
function hasExtensionContext() {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; }
  catch { return false; }
}

/* Mock scrape — used when there's no live server context. */
const MOCK_REPS = [
  { val: '101', txt: 'Alice Johnson' },
  { val: '102', txt: 'Bob Smith' },
  { val: '103', txt: 'Carol White' },
  { val: '15',  txt: 'Cullen Champagne' },
];
const MOCK_ARTISTS = [
  { val: '42', txt: 'Marco Studio' },
  { val: '43', txt: 'Priya Designs' },
  { val: '44', txt: 'Ren Atelier' },
];
const MOCK_GALLERY = [
  { name: 'Acme Logo v3',    proofLink: '#', thumbUrl: '', status: 'Approved' },
  { name: 'Acme Logo v2',    proofLink: '#', thumbUrl: '', status: 'Revised' },
  { name: 'Pre-prod sample', proofLink: '#', thumbUrl: '', status: 'Pending' },
];

/* ───────────────────────────────────────────────────────────────
   Public component
─────────────────────────────────────────────────────────────── */
export function SubmitProof({ image, orderId: orderIdProp, customerId: customerIdProp, onClosed, bindClose }) {
  const toast = useToast();
  const draggable = useDevSetting('submitProof.draggable') ?? true;
  const forceMock = useDevSetting('submitProof.useMock') ?? false;
  const useMock   = forceMock || !hasExtensionContext();

  // ── Top-level state machine ───────────────────────────────
  // 'awaiting-image' — no image → mount ImagePreview first
  // 'form'           — main proof form
  // 'submitting'     — sending requests
  // 'results'        — generated links panel
  const [stage, setStage] = useState(image?.dataUrl || image?.url ? 'form' : 'awaiting-image');
  const [imageData, setImageData] = useState(image || null);

  // Form fields.
  const [orderId, setOrderId]       = useState(orderIdProp || '');
  const [customerId, setCustomerId] = useState(customerIdProp || '');
  const [proofName, setProofName]   = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // ordered list with possible duplicates
  const [status, setStatus]   = useState('1');
  const [salesRepId, setSalesRepId]   = useState('');
  const [artistId, setArtistId]       = useState('');
  const [orderType, setOrderType]     = useState('Live Order');
  const [orderValue, setOrderValue]   = useState('Under $2k');
  const [flags, setFlags] = useState({ rush: false, canada: false, dropship: false });
  const [itemLink, setItemLink] = useState('');
  const [refLink, setRefLink]   = useState('');
  const [notes, setNotes]       = useState('');
  // dynData[index] = { fieldId: value, ... } — keyed by position in selectedItems
  const [dynData, setDynData] = useState({});

  // Required-field touched + invalid (same pattern as CRMCreateContact).
  const [invalid, setInvalid] = useState({ proofName: false, items: false });
  const [touched, setTouched] = useState({ proofName: false, items: false });
  const markTouched = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const showErr = (key, empty) => empty && (touched[key] || invalid[key]);

  // Loaded server data.
  const [reps, setReps]       = useState(null); // null = loading, [] = failed → fallback, [...] = ok
  const [artists, setArtists] = useState(null);
  const [gallery, setGallery] = useState(null); // null = unknown, [] = loaded none / failed, [...] = ok
  const [galleryFailed, setGalleryFailed] = useState(false);
  const [dropdownsFailed, setDropdownsFailed] = useState(false);

  // Submit loop state.
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState({ current: 0, total: 0, item: '' });
  const [results, setResults] = useState([]);

  // Fire async loads when we enter 'form' (skip during 'awaiting-image').
  useEffect(() => {
    if (stage !== 'form') return;
    let alive = true;
    (async () => {
      // ── Dropdowns (reps + artists) ──
      try {
        if (useMock) {
          await new Promise((r) => setTimeout(r, 280));
          if (!alive) return;
          setReps(MOCK_REPS);
          setArtists(MOCK_ARTISTS);
        } else {
          const res = await fetch(ENDPOINT_PAGE128, { credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const scrape = (id) => {
            const sel = doc.getElementById(id);
            if (!sel) return [];
            return Array.from(sel.options).map((o) => ({ val: o.value, txt: o.text.trim() }));
          };
          const r = scrape('ctl00_DropDownSalesRep');
          const a = scrape('ctl00_DropDownArtist');
          if (!alive) return;
          if (r.length === 0 && a.length === 0) throw new Error('Empty option lists');
          setReps(r);
          setArtists(a);
        }
      } catch (e) {
        if (!alive) return;
        setReps([]);
        setArtists([]);
        setDropdownsFailed(true);
        toast?.warning?.('Sales rep / artist lookup unavailable — switched to text input', { duration: 4500 });
      }
      // ── Gallery (existing proofs for this customer) ──
      const cust = (customerIdProp || customerId || '').trim();
      if (!cust) {
        setGallery([]);
        return;
      }
      try {
        if (useMock) {
          await new Promise((r) => setTimeout(r, 380));
          if (!alive) return;
          setGallery(MOCK_GALLERY);
        } else {
          const res = await fetch(ENDPOINT_CRM240(cust), { credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const parsed = parseGalleryFromDoc(doc);
          if (!alive) return;
          setGallery(parsed);
        }
      } catch {
        if (!alive) return;
        setGallery([]);
        setGalleryFailed(true);
        toast?.warning?.('Previous proofs unavailable', { duration: 3500 });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, useMock]);

  // ── Item add/remove (the multi-select with counts) ────────
  const addItem = (it) => setSelectedItems((s) => [...s, it]);
  const removeOne = (it) => setSelectedItems((s) => {
    const idx = s.lastIndexOf(it);
    if (idx < 0) return s;
    const next = s.slice();
    next.splice(idx, 1);
    return next;
  });
  const itemCounts = useMemo(() => {
    const m = {};
    for (const it of selectedItems) m[it] = (m[it] || 0) + 1;
    return m;
  }, [selectedItems]);

  // Dynamic field update for a specific item index.
  const updateDyn = (index, fieldId, value) => {
    setDynData((d) => ({ ...d, [index]: { ...(d[index] || {}), [fieldId]: value } }));
  };

  // ── Submit ─────────────────────────────────────────────────
  const onSubmit = async () => {
    const nextInvalid = {
      proofName: !proofName.trim(),
      items: selectedItems.length === 0,
    };
    setInvalid(nextInvalid);
    setTouched((t) => ({ ...t, proofName: true, items: true }));
    if (nextInvalid.proofName || nextInvalid.items) {
      toast?.warning?.(
        nextInvalid.items ? 'Pick at least one item to proof' : 'Required fields are missing',
      );
      return;
    }

    setSubmitting(true);
    setStage('submitting');

    // Per-item proof name suffix (matches original logic).
    const totals = itemCounts;
    const seen = {};
    const proofNames = selectedItems.map((it) => {
      seen[it] = (seen[it] || 0) + 1;
      const suffix = totals[it] > 1 ? ` - ${seen[it]}` : '';
      return `${proofName.trim()} - ${it}${suffix}`;
    });

    const basePayload = {
      orderId:      orderId.trim(),
      customerId:   customerId.trim(),
      logoStatus:   status,
      salesRepId:   salesRepId,
      artistId:     artistId,
      orderType,
      orderValue,
      rushNeeded:   flags.rush     ? 'Rush'    : 'No',
      canadaDrop:   flags.canada   ? 'Canada'  : 'No',
      dropShipTS:   flags.dropship ? 'Yes'     : 'No',
      itemLink:     itemLink.trim(),
      refLink:      refLink.trim(),
      notes:        notes.trim(),
      sourceImage:  imageData?.dataUrl || imageData?.url || '',
    };

    const sendOne = (payload) => new Promise((resolve) => {
      if (useMock) {
        // Mock: 70% success rate (gives us realistic mixed-result panels).
        setTimeout(() => {
          if (Math.random() < 0.85) {
            resolve({ proofLink: `https://www.golfballs.com/proof/${Math.random().toString(36).slice(2, 10)}` });
          } else {
            resolve({ error: 'Server returned 500 (mock)' });
          }
        }, 450 + Math.random() * 400);
        return;
      }
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { error: 'No response from background' });
          }
        });
      } catch (e) {
        resolve({ error: e?.message || 'Failed to send to background' });
      }
    });

    const out = [];
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const dyn = dynData[i] || {};
      const logoType = dyn.logoType || 'Ball';
      setSubmitProgress({ current: i + 1, total: selectedItems.length, item });
      const r = await sendOne({
        action:        'generateProofLink',
        ...basePayload,
        proofName:     proofNames[i],
        itemsSelected: item,
        multiProofs:   selectedItems.length,
        dynamicFields: { [item]: dyn },
      });
      out.push({
        item,
        logoType,
        proofName: proofNames[i],
        proofLink: r?.proofLink || r?.link || r?.url || '',
        error:     r?.error || null,
        dynFields: dyn,
      });
    }

    setResults(out);
    setSubmitting(false);
    const failed = out.filter((r) => !r.proofLink || r.error);
    if (failed.length === out.length) {
      // Everything failed — keep the form, don't show results, let them retry.
      setStage('form');
      toast?.error?.(`Submission failed (${failed.length}/${out.length})`, { duration: 5000 });
    } else {
      setStage('results');
      if (failed.length > 0) {
        toast?.warning?.(`${failed.length} of ${out.length} requests failed`);
      } else {
        toast?.success?.('Proof requests submitted');
      }
    }
  };

  // bindClose passthrough.
  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  // ── awaiting-image stage: open ImagePreview in picker mode ──
  if (stage === 'awaiting-image') {
    return (
      <ImagePreview
        pickerMode
        onUseImage={(picked) => {
          setImageData(picked);
          setStage('form');
        }}
        onSkipImage={() => {
          setImageData(null);
          setStage('form');
        }}
        onClosed={onClosed}
        bindClose={bindClose}
      />
    );
  }

  // ── Main form ──
  const repOptions = (reps || []).map((r) => ({ id: r.val, label: r.txt }));
  const artistOptions = (artists || []).map((a) => ({ id: a.val, label: a.txt }));
  const hasGallery = Array.isArray(gallery) && gallery.length > 0;

  return (
    <FloatingPanel
      width={hasGallery ? 1000 : 720}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        accent
        icon={<I.send size={14} />}
        title="Submit Proof Request"
        subtitle={
          <span>
            {orderId ? <>Order #{orderId} · </> : null}
            {customerId ? <>Customer {customerId} · </> : null}
            {hasGallery
              ? <>{gallery.length} previous proof{gallery.length === 1 ? '' : 's'}</>
              : 'Submit to the art team'}
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

      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
        {/* LEFT — form */}
        <div style={{
          flex: 1, minWidth: 0,
          maxHeight: 'min(72vh, 620px)',
          overflowY: 'auto', overflowX: 'hidden',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Image preview chip — only when we have one. */}
          {(imageData?.dataUrl || imageData?.url) && (
            <Field label="Source image">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 8,
                border: '1px solid var(--gb-border-default)',
                borderRadius: 'var(--gb-r-sm)',
                background: 'var(--gb-surface-1)',
              }}>
                <img
                  src={imageData.dataUrl || imageData.url}
                  alt=""
                  style={{
                    width: 48, height: 48, objectFit: 'cover',
                    borderRadius: 'var(--gb-r-xs)',
                    border: '1px solid var(--gb-border-subtle)',
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  flex: 1, fontSize: 11,
                  color: 'var(--gb-text-tertiary)',
                  fontFamily: 'var(--gb-font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {imageData.dataUrl ? 'Custom image · attached' : (imageData.url || '')}
                </span>
                <Btn size="sm" variant="ghost" onClick={() => setImageData(null)}>Remove</Btn>
              </div>
            </Field>
          )}

          {/* Multi-select items */}
          <Field
            label="Item(s) being proofed"
            required
            error={showErr('items', selectedItems.length === 0) ? 'Pick at least one' : null}
          >
            <ItemMultiSelect
              items={ITEMS}
              counts={itemCounts}
              error={showErr('items', selectedItems.length === 0)}
              onAdd={(it) => {
                addItem(it);
                setInvalid((i) => ({ ...i, items: false }));
                setTouched((t) => ({ ...t, items: false }));
              }}
              onRemove={removeOne}
              onTouch={markTouched('items')}
            />
          </Field>

          {/* Order / cust / name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Order #">
              <Input value={orderId} onChange={setOrderId} placeholder="123456" />
            </Field>
            <Field label="Customer ID" hint={dropdownsFailed ? undefined : 'Drives the previous-proofs gallery'}>
              <Input value={customerId} onChange={setCustomerId} placeholder="4650030" />
            </Field>
          </div>
          <Field
            label="Proof link name"
            required
            error={showErr('proofName', !proofName.trim()) ? 'Required' : null}
          >
            <Input
              value={proofName}
              onChange={(v) => {
                setProofName(v);
                setInvalid((i) => ({ ...i, proofName: false }));
                if (v) setTouched((t) => ({ ...t, proofName: false }));
              }}
              onBlur={markTouched('proofName')}
              placeholder="ATT - Divot Tool"
              error={showErr('proofName', !proofName.trim())}
            />
          </Field>

          {/* Logo status + reps + artists */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Field label="Logo status">
              <Dropdown value={status} onChange={setStatus} options={STATUS_OPTS} />
            </Field>
            <Field label="Sales rep" hint={dropdownsFailed ? 'Server unavailable — enter ID' : undefined}>
              {dropdownsFailed ? (
                <Input value={salesRepId} onChange={setSalesRepId} placeholder="Rep ID" />
              ) : reps == null ? (
                <SkeletonBox />
              ) : (
                <Dropdown
                  value={salesRepId}
                  onChange={setSalesRepId}
                  options={[{ id: '', label: 'Not selected' }, ...repOptions]}
                  searchable
                />
              )}
            </Field>
            <Field label="Artist" hint={dropdownsFailed ? 'Server unavailable — enter ID' : undefined}>
              {dropdownsFailed ? (
                <Input value={artistId} onChange={setArtistId} placeholder="Artist ID" />
              ) : artists == null ? (
                <SkeletonBox />
              ) : (
                <Dropdown
                  value={artistId}
                  onChange={setArtistId}
                  options={[{ id: '', label: 'All artists' }, ...artistOptions]}
                  searchable
                />
              )}
            </Field>
          </div>

          {/* Order type / value (exclusive tags) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Order type">
              <ExclusiveTagRow
                value={orderType}
                onChange={setOrderType}
                options={['Live Order', 'Potential Order', 'Jardine Order']}
              />
            </Field>
            <Field label="Order value">
              <ExclusiveTagRow
                value={orderValue}
                onChange={setOrderValue}
                options={['Under $2k', 'Over $2k']}
              />
            </Field>
          </div>

          {/* Flags (toggle chips) */}
          <Field label="Flags & overrides">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <ToggleTag
                on={flags.rush}
                onClick={() => setFlags((f) => ({ ...f, rush: !f.rush }))}
                icon={<I.bolt size={10} />}
              >Rush</ToggleTag>
              <ToggleTag
                on={flags.canada}
                onClick={() => setFlags((f) => ({ ...f, canada: !f.canada }))}
                icon={<MapPinIcon />}
              >Canada Drop</ToggleTag>
              <ToggleTag
                on={flags.dropship}
                onClick={() => setFlags((f) => ({ ...f, dropship: !f.dropship }))}
                icon={<TruckIcon />}
              >Drop Ship TS</ToggleTag>
            </div>
          </Field>

          {/* Per-item dynamic fields */}
          <AnimatePresence initial={false}>
            {selectedItems.length > 0 && (
              <motion.div
                key="dyn"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
                  {selectedItems.map((item, idx) => {
                    const fields = getDynFieldsFor(item);
                    if (!fields.length) return null;
                    const data = dynData[idx] || {};
                    return (
                      <DynamicItemBlock
                        key={`${item}-${idx}`}
                        item={item}
                        index={idx}
                        fields={fields}
                        data={data}
                        onChange={(fieldId, v) => updateDyn(idx, fieldId, v)}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Links + notes */}
          <Field label="Item link" hint="N/A for white balls unless special alignment">
            <Input value={itemLink} onChange={setItemLink} placeholder="https://…" />
          </Field>
          <Field label="Reference logo link" hint="Previous proofs">
            <Input value={refLink} onChange={setRefLink} placeholder="https://…" />
          </Field>
          <Field label="Special instructions">
            <Input value={notes} onChange={setNotes} placeholder="Write N/A if unneeded" />
          </Field>

          {/* Results panel (shown after a successful submit) */}
          {stage === 'results' && results.length > 0 && (
            <ResultsPanel results={results} onClose={() => bindCloseRef.current?.()} />
          )}
        </div>

        {/* RIGHT — gallery */}
        {hasGallery && (
          <div style={{
            width: 280, flexShrink: 0,
            background: 'var(--gb-surface-1)',
            borderLeft: '1px solid var(--gb-border-subtle)',
            padding: '14px 14px 20px',
            overflowY: 'auto',
            maxHeight: 'min(72vh, 620px)',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 12,
            }}>Previous Proofs ({gallery.length})</div>
            {gallery.map((p, i) => (
              <GalleryItem key={i} proof={p} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, fontSize: 11, fontWeight: 600,
          color: 'var(--gb-text-tertiary)',
        }}>
          {stage === 'submitting'
            ? `Sending ${submitProgress.current} of ${submitProgress.total}…`
            : stage === 'results'
              ? `${results.filter((r) => r.proofLink).length} of ${results.length} sent`
              : selectedItems.length > 0
                ? `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} selected`
                : 'Pick items to send'}
        </div>
        <Btn size="sm" variant="secondary" onClick={() => bindCloseRef.current?.()} disabled={submitting}>
          {stage === 'results' ? 'Close' : 'Cancel'}
        </Btn>
        {stage !== 'results' && (
          <Btn
            size="sm"
            variant="tinted"
            status="brand"
            icon={submitting ? <SpinIcon /> : <I.send size={11} />}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send request'}
          </Btn>
        )}
      </div>
    </FloatingPanel>
  );
}

/* ───────────────────────────────────────────────────────────────
   Subcomponents
─────────────────────────────────────────────────────────────── */

function ItemMultiSelect({ items, counts, error, onAdd, onRemove, onTouch }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) { setOpen(false); onTouch?.(); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onTouch]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const summary = total === 0 ? 'Select items…' : `${total} item${total === 1 ? '' : 's'} selected`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          height: 32, padding: '0 10px',
          background: 'var(--gb-surface-2)',
          border: '1px solid ' + (error ? 'var(--gb-error)' : 'var(--gb-border-default)'),
          borderRadius: 'var(--gb-r-sm)',
          fontSize: 12, fontWeight: 500,
          color: total > 0 ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
          fontFamily: 'inherit',
          cursor: 'pointer', textAlign: 'left',
          outline: 'none',
        }}
      >
        <span style={{ flex: 1 }}>{summary}</span>
        <I.chevd size={10} style={{ color: 'var(--gb-text-tertiary)' }} />
      </button>
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
              zIndex: 50,
              maxHeight: 260, overflowY: 'auto',
              background: 'var(--gb-surface-modal)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-sm)',
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
              padding: 4,
            }}
          >
            {items.map((it) => {
              const count = counts[it] || 0;
              return (
                <div
                  key={it}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 'var(--gb-r-xs)',
                    background: count ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onAdd(it)}
                    style={{
                      flex: 1, textAlign: 'left',
                      background: 'transparent', border: 'none', padding: 0,
                      fontSize: 11.5, fontWeight: count ? 600 : 500,
                      color: count ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{it}</button>
                  {count > 0 && (
                    <>
                      <Tag tone="brand" size="xs" mono>{count}</Tag>
                      <button
                        type="button"
                        onClick={() => onRemove(it)}
                        style={{
                          width: 18, height: 18, padding: 0,
                          background: 'transparent',
                          border: '1px solid var(--gb-border-default)',
                          borderRadius: 'var(--gb-r-xs)',
                          color: 'var(--gb-text-muted)',
                          cursor: 'pointer', fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'inherit', lineHeight: 1,
                        }}
                      >−</button>
                    </>
                  )}
                  {count === 0 && (
                    <I.plus size={10} style={{ color: 'var(--gb-text-muted)' }} />
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExclusiveTagRow({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <motion.button
            key={o}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(o)}
            animate={{
              backgroundColor: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
              color:           on ? 'var(--gb-brand-label)'    : 'var(--gb-text-muted)',
              borderColor:     on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)',
            }}
            transition={{ duration: 0.15 }}
            style={{
              padding: '5px 11px',
              fontSize: 11, fontWeight: 600,
              borderRadius: 'var(--gb-r-sm)',
              border: '1px solid transparent',
              fontFamily: 'inherit',
              cursor: 'pointer', outline: 'none',
            }}
          >{o}</motion.button>
        );
      })}
    </div>
  );
}

function ToggleTag({ on, onClick, icon, children }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      animate={{
        backgroundColor: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
        color:           on ? 'var(--gb-brand-label)'    : 'var(--gb-text-muted)',
        borderColor:     on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)',
      }}
      transition={{ duration: 0.15 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px',
        fontSize: 11, fontWeight: 600,
        borderRadius: 'var(--gb-r-sm)',
        border: '1px solid transparent',
        fontFamily: 'inherit',
        cursor: 'pointer', outline: 'none',
      }}
    >{icon}{children}</motion.button>
  );
}

function DynamicItemBlock({ item, fields, data, onChange }) {
  return (
    <div style={{
      padding: 10,
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-surface-1)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--gb-brand-label)',
        marginBottom: 8,
      }}>{item}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {fields.map((f) => {
          // Conditional show: dependsOn + dependsNotValue
          if (f.dependsOn && data[f.dependsOn] === f.dependsNotValue) return null;
          const val = data[f.id] ?? f.default ?? '';
          return (
            <Field key={f.id} label={f.label} hint={f.hint}>
              {f.type === 'select' ? (
                <Dropdown
                  value={val}
                  onChange={(v) => onChange(f.id, v)}
                  options={f.options.map((o) => ({ id: o, label: o }))}
                />
              ) : (
                <Input
                  value={val}
                  onChange={(v) => onChange(f.id, v)}
                  placeholder={f.hint || ''}
                />
              )}
            </Field>
          );
        })}
      </div>
    </div>
  );
}

function GalleryItem({ proof }) {
  return (
    <a
      href={proof.proofLink || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        textDecoration: 'none',
        marginBottom: 14,
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-subtle)',
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        {proof.thumbUrl ? (
          <img src={proof.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gb-text-ghost)', fontSize: 11,
          }}>No thumbnail</div>
        )}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: 'var(--gb-text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{proof.name}</div>
      {proof.status && (
        <div style={{ fontSize: 10, color: 'var(--gb-text-tertiary)', marginTop: 2 }}>{proof.status}</div>
      )}
    </a>
  );
}

function ResultsPanel({ results, onClose }) {
  const success = results.filter((r) => r.proofLink).length;
  return (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: '1px solid var(--gb-border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'var(--gb-text-muted)',
      }}>
        Generated links · <span style={{
          color: success === results.length ? 'var(--gb-brand-label)' : 'var(--gb-error-fg)',
        }}>{success} / {results.length}</span>
      </div>
      {results.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.05 }}
          style={{
            padding: 10,
            background: 'var(--gb-surface-1)',
            border: '1px solid ' + (r.error ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'),
            borderRadius: 'var(--gb-r-sm)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{
            fontSize: 11.5, fontWeight: 600,
            color: 'var(--gb-text-primary)',
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={r.proofName}>{r.proofName}</span>
          {r.error ? (
            <Tag tone="error" size="sm">Failed</Tag>
          ) : (
            <>
              <Tag tone="brand" size="sm">{r.logoType}</Tag>
              <Btn size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(r.proofLink)}>
                Copy link
              </Btn>
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function SkeletonBox() {
  return (
    <motion.div
      animate={{ opacity: [0.5, 0.9, 0.5] }}
      transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
      style={{
        height: 32,
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-sm)',
      }}
    />
  );
}

function SpinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{
        animation: 'gbSpProofSpin 1s linear infinite', transformOrigin: 'center',
      }} />
      <style>{`@keyframes gbSpProofSpin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

const MapPinIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const TruckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

/* Parse the legacy "previous proofs" table out of the customer's CRM page. */
function parseGalleryFromDoc(doc) {
  const proofs = [];
  const rows = doc.querySelectorAll('tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) continue;
    const proofAnchor = cells[4].querySelector('a[href*="logoProofing"]');
    const imgEl = cells[4].querySelector('img');
    if (!proofAnchor || !imgEl) continue;
    const href = proofAnchor.getAttribute('href') || '';
    const guidMatch = href.match(/logoGUID=([a-f0-9-]+)/i);
    if (!guidMatch) continue;
    const guid = guidMatch[1];
    const isUseless = (t) => !t || /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(t) || t.length < 3;
    let name = '';
    for (let ci = 0; ci <= 3 && !name; ci++) {
      if (cells[ci] && !cells[ci].contains(proofAnchor)) {
        const t = cells[ci].textContent.trim();
        if (!isUseless(t)) name = t;
      }
    }
    if (!name) name = proofAnchor.textContent.trim() || `Proof ${guid.substring(0, 8)}`;
    const thumbUrl = `https://d1tp32r8b76g0z.cloudfront.net/logo/${guid.substring(0, 2)}/${guid}-150.jpg`;
    const proofLink = /^https?:\/\//i.test(href)
      ? href
      : `https://www.golfballs.com${href.startsWith('/') ? '' : '/'}${href}`;
    proofs.push({ name, proofLink, thumbUrl, status: cells[3]?.textContent.trim() || '' });
  }
  return proofs;
}
