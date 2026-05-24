import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Field, Input, Textarea, Dropdown, Tag, Segmented, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

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

/* Item → field-group lookup. Mirrors the original logo-extractor
   logic: items not in GROUP_MAP and not gift sets get NO extra fields
   (e.g. "Pad to Digital Request" is a request, not a deliverable). */
function getDynFieldsFor(item) {
  if (item.startsWith('Gift Set')) return DYN_FIELDS.giftset;
  const key = GROUP_MAP[item];
  return key ? DYN_FIELDS[key] : null;
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
  { name: 'Acme Logo v3',    proofLink: '#', thumbUrl: '', status: 'Approved', label: 'v3' },
  { name: 'Acme Logo v2',    proofLink: '#', thumbUrl: '', status: 'Revised',  label: 'v2' },
  { name: 'Acme Logo v1',    proofLink: '#', thumbUrl: '', status: 'Rejected', label: 'v1' },
  { name: 'Pre-prod sample', proofLink: '#', thumbUrl: '', status: 'Pending',  label: 'pre' },
];

// Tone mapping for the status pill — matches the design's per-status
// colors. Falls back to 'neutral' for anything unrecognised.
const STATUS_TONE = {
  Approved: 'brand',
  Revised:  'warning',
  Rejected: 'error',
  Pending:  'neutral',
};
function statusTone(status) { return STATUS_TONE[status] || 'neutral'; }

/* ───────────────────────────────────────────────────────────────
   Public component
─────────────────────────────────────────────────────────────── */
export function SubmitProof({ image, orderId: orderIdProp, customerId: customerIdProp, onClosed, bindClose }) {
  const toast = useToast();
  const draggable = useDevSetting('submitProof.draggable') ?? true;
  const forceMock = useDevSetting('submitProof.useMock') ?? false;
  const useMock   = forceMock || !hasExtensionContext();

  // Stage drives the footer button + results panel. We open straight
  // to the form regardless of whether an image was passed — the source-
  // image field handles both "you have one" and "drop one here".
  //   'form'        — main proof form (default)
  //   'submitting'  — sending requests
  //   'results'     — generated links panel
  const [stage, setStage] = useState('form');
  // Attached images list. Stored as an array so we can grow into
  // multi-image later without restructuring. Each entry is
  // { id, dataUrl? | url?, hosted (bool) } — `hosted` controls the
  // "won't render in email template" warning.
  const [images, setImages] = useState(() => {
    if (!image) return [];
    return [{
      id: 'init',
      ...image,
      hosted: !!image.url && !image.dataUrl,
    }];
  });
  // Convenience accessor for backward-compat code paths that still
  // read `imageData?.dataUrl || imageData?.url`.
  const imageData = images[0] || null;
  const setImageData = (next) => {
    if (!next) setImages([]);
    else setImages([{
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...next,
      hosted: !!next.url && !next.dataUrl,
    }]);
  };
  // Add (not replace) — used by the modal-wide drop overlay so each
  // dropped file becomes a NEW row in the attached-images list.
  const addImage = (next) => {
    setImages((arr) => [...arr, {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...next,
      hosted: !!next.url && !next.dataUrl,
    }]);
  };
  const removeImage = (id) => setImages((arr) => arr.filter((x) => x.id !== id));
  const hasUnhostedImage = images.some((img) => !img.hosted);

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
  // customNames[index] = string — per-block overrides for the proof name.
  // When unset (or empty), we use the autogenerated default:
  //   `${proofName} - ${item}${suffix}`
  // The Field shows the editable input pre-filled with the default so
  // the user can tweak instead of retyping the whole name.
  const [customNames, setCustomNames] = useState({});

  // Autogenerated per-block proof names. Duplicates get " - 2" / " - 3".
  // Memoized so the per-block input can use them as defaults.
  const autoProofNames = useMemo(() => {
    const totals = {};
    const seen = {};
    for (const it of selectedItems) totals[it] = (totals[it] || 0) + 1;
    return selectedItems.map((it) => {
      seen[it] = (seen[it] || 0) + 1;
      const suffix = totals[it] > 1 ? ` - ${seen[it]}` : '';
      return `${(proofName || '').trim()} - ${it}${suffix}`;
    });
  }, [selectedItems, proofName]);
  // Effective name for submission — custom override > autogenerated.
  const effectiveProofName = (idx) => {
    const c = customNames[idx];
    return c && c.trim() ? c.trim() : autoProofNames[idx];
  };

  // Required-field touched + invalid (same pattern as CRMCreateContact).
  const [invalid, setInvalid] = useState({ proofName: false, items: false, customerId: false, salesRep: false, artist: false });
  const [touched, setTouched] = useState({ proofName: false, items: false, customerId: false, salesRep: false, artist: false });
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

  // Fetch dropdowns + gallery EXACTLY ONCE per mount. The effect used
  // to re-fire whenever `stage` changed (e.g. failed submit → 'form'
  // again), which re-issued both network calls and re-surfaced the
  // "unavailable" toasts. Now gated on a ran-once ref so retries
  // don't spam notifications.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
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
        // Action toast — primary CTA "Use template data" swaps in the
        // mock rep + artist lists so the dropdowns repopulate and the
        // user can keep working as if the call had succeeded. This is
        // a CHOICE, not a fix: the live server is still down, so a
        // real submit will still fail, but the form is now demo-able.
        toast?.action?.({
          tone: 'warning',
          title: 'Couldn’t load reps & artists',
          message: 'The CRM directory didn’t respond. Switched to text input — or use template data instead.',
          primary: 'Use template data',
          secondary: 'Keep text input',
          icon: <I.alert />,
          duration: null, // sticky — user must dismiss
          onPrimary: () => {
            setReps(MOCK_REPS);
            setArtists(MOCK_ARTISTS);
            setDropdownsFailed(false);
          },
        });
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
        toast?.action?.({
          tone: 'warning',
          title: 'Couldn’t load previous proofs',
          message: 'The customer’s proof history didn’t respond. Want to see what the gallery would look like?',
          primary: 'Use template data',
          secondary: 'Skip gallery',
          icon: <I.alert />,
          duration: null,
          onPrimary: () => setGallery(MOCK_GALLERY),
        });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      proofName:  !proofName.trim(),
      items:      selectedItems.length === 0,
      customerId: !customerId.trim(),
      salesRep:   !salesRepId.trim(),
      artist:     !artistId.trim(),
    };
    setInvalid(nextInvalid);
    setTouched((t) => ({
      ...t,
      proofName: true, items: true,
      customerId: true, salesRep: true, artist: true,
    }));
    const anyInvalid = Object.values(nextInvalid).some(Boolean);
    if (anyInvalid) {
      const msg = nextInvalid.items
        ? 'Pick at least one item to proof'
        : nextInvalid.customerId
          ? 'Customer ID is required'
          : nextInvalid.salesRep
            ? 'Sales rep is required'
            : nextInvalid.artist
              ? 'Artist is required'
              : 'Required fields are missing';
      toast?.warning?.(msg);
      return;
    }

    setSubmitting(true);
    setStage('submitting');

    // Per-item proof names — user-customised override wins over the
    // autogenerated default.
    const proofNames = selectedItems.map((_, idx) => effectiveProofName(idx));

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

  // ── Modal-wide drag-and-drop. Hovering a file anywhere over the
  // modal raises an absolute overlay. Drop adds the file to the
  // attached-images list. dragDepth counts enter/leave events so
  // crossing child element boundaries doesn't flicker the overlay. */
  const [dropOver, setDropOver] = useState(false);
  const dropDepthRef = useRef(0);
  const onModalDragEnter = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dropDepthRef.current += 1;
    if (dropDepthRef.current === 1) setDropOver(true);
  };
  const onModalDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onModalDragLeave = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropOver(false);
  };
  const onModalDrop = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dropDepthRef.current = 0;
    setDropOver(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      toast?.warning?.('Only image files can be attached');
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => addImage({ dataUrl: String(reader.result) });
      reader.onerror = () => toast?.error?.(`Could not read ${file.name}`);
      reader.readAsDataURL(file);
    });
  };

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
      <div
        onDragEnter={onModalDragEnter}
        onDragOver={onModalDragOver}
        onDragLeave={onModalDragLeave}
        onDrop={onModalDrop}
        style={{
          position: 'relative',
          // Inherit FloatingPanel's column flex from ModalCard so the
          // header / body / footer keep their original layout.
          display: 'flex', flexDirection: 'column',
          minHeight: 0, flex: 1,
        }}
      >
        {/* Modal-wide drop overlay — only paints while a file is
            being dragged over the modal. pointer-events:auto so the
            drop registers on the overlay itself (children's dropEffect
            isn't reliable). */}
        <AnimatePresence>
          {dropOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 50,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10,
                // Neutral transparent backdrop — theme-aware via
                // text-primary mix-in, no brand tint.
                background: 'color-mix(in srgb, var(--gb-text-primary) 25%, transparent)',
                border: '1.5px dashed color-mix(in srgb, var(--gb-text-primary) 35%, transparent)',
                borderRadius: 'var(--gb-r-md)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                color: 'var(--gb-text-primary)',
                pointerEvents: 'none',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
                Drop image to attach
              </div>
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: 'var(--gb-text-tertiary)',
              }}>Adds to the proof request</div>
            </motion.div>
          )}
        </AnimatePresence>

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
        {/* LEFT — form. Tightened spacing + xs Input sizing so the
            modal stays compact (was ballooning to 620px tall). */}
        <div style={{
          flex: 1, minWidth: 0,
          maxHeight: 'min(62vh, 520px)',
          overflowY: 'auto', overflowX: 'hidden',
          padding: 12,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Order #">
              <Input size="xs" value={orderId} onChange={setOrderId} placeholder="123456" />
            </Field>
            <Field
              label="Customer ID"
              required
              hint={dropdownsFailed ? undefined : 'Drives the previous-proofs gallery'}
              error={showErr('customerId', !customerId.trim()) ? 'Required' : null}
            >
              <Input
                size="xs"
                value={customerId}
                onChange={(v) => {
                  setCustomerId(v);
                  setInvalid((i) => ({ ...i, customerId: false }));
                  if (v) setTouched((t) => ({ ...t, customerId: false }));
                }}
                onBlur={markTouched('customerId')}
                placeholder="4650030"
                error={showErr('customerId', !customerId.trim())}
              />
            </Field>
          </div>
          <Field
            label="Proof link name"
            required
            error={showErr('proofName', !proofName.trim()) ? 'Required' : null}
          >
            <Input
              size="xs"
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <Field label="Logo status">
              <Dropdown size="xs" value={status} onChange={setStatus} options={STATUS_OPTS} />
            </Field>
            <Field
              label="Sales rep"
              required
              hint={dropdownsFailed ? 'Server unavailable — enter ID' : undefined}
              error={showErr('salesRep', !salesRepId.trim()) ? 'Required' : null}
            >
              {dropdownsFailed ? (
                <Input
                  size="xs"
                  value={salesRepId}
                  onChange={(v) => {
                    setSalesRepId(v);
                    setInvalid((i) => ({ ...i, salesRep: false }));
                    if (v) setTouched((t) => ({ ...t, salesRep: false }));
                  }}
                  onBlur={markTouched('salesRep')}
                  placeholder="Rep ID"
                  error={showErr('salesRep', !salesRepId.trim())}
                />
              ) : reps == null ? (
                <SkeletonBox />
              ) : (
                <Dropdown
                  size="xs"
                  value={salesRepId}
                  onChange={(v) => {
                    setSalesRepId(v);
                    setInvalid((i) => ({ ...i, salesRep: false }));
                    setTouched((t) => ({ ...t, salesRep: !v }));
                  }}
                  options={repOptions}
                  placeholder="Select a rep…"
                  searchable
                  error={showErr('salesRep', !salesRepId.trim())}
                />
              )}
            </Field>
            <Field
              label="Artist"
              required
              hint={dropdownsFailed ? 'Server unavailable — enter ID' : undefined}
              error={showErr('artist', !artistId.trim()) ? 'Required' : null}
            >
              {dropdownsFailed ? (
                <Input
                  size="xs"
                  value={artistId}
                  onChange={(v) => {
                    setArtistId(v);
                    setInvalid((i) => ({ ...i, artist: false }));
                    if (v) setTouched((t) => ({ ...t, artist: false }));
                  }}
                  onBlur={markTouched('artist')}
                  placeholder="Artist ID"
                  error={showErr('artist', !artistId.trim())}
                />
              ) : artists == null ? (
                <SkeletonBox />
              ) : (
                <Dropdown
                  size="xs"
                  value={artistId}
                  onChange={(v) => {
                    setArtistId(v);
                    setInvalid((i) => ({ ...i, artist: false }));
                    setTouched((t) => ({ ...t, artist: !v }));
                  }}
                  options={artistOptions}
                  placeholder="Select an artist…"
                  searchable
                  error={showErr('artist', !artistId.trim())}
                />
              )}
            </Field>
          </div>

          {/* Order type / value — Segmented (sliding-pill exclusive
              select) so the UX matches the rest of the system. Only
              one option per field can be selected. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Order type">
              <Segmented
                full
                size="sm"
                value={orderType}
                onChange={setOrderType}
                options={[
                  { id: 'Live Order',       label: 'Live'      },
                  { id: 'Potential Order',  label: 'Potential' },
                  { id: 'Jardine Order',    label: 'Jardine'   },
                ]}
              />
            </Field>
            <Field label="Order value">
              <Segmented
                full
                size="sm"
                value={orderValue}
                onChange={setOrderValue}
                options={[
                  { id: 'Under $2k', label: 'Under $2k' },
                  { id: 'Over $2k',  label: 'Over $2k'  },
                ]}
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

          {/* Per-item dynamic fields — one block per selected item.
              Duplicates render with " · 2"-style instance counters,
              each block has its own delete button. Sits right after
              Flags so it picks up where the static questions end. */}
          <DynamicFieldsList
            selectedItems={selectedItems}
            dynData={dynData}
            autoNames={autoProofNames}
            customNames={customNames}
            onUpdate={updateDyn}
            onRenameItem={(idx, name) => setCustomNames((m) => ({ ...m, [idx]: name }))}
            onRemove={(idx) => {
              setSelectedItems((s) => {
                const next = s.slice();
                next.splice(idx, 1);
                return next;
              });
              // Re-key dynData AND customNames so indices stay tight.
              const rekey = (d) => {
                const next = {};
                Object.keys(d).forEach((k) => {
                  const ki = parseInt(k, 10);
                  if (ki < idx) next[ki] = d[k];
                  else if (ki > idx) next[ki - 1] = d[k];
                });
                return next;
              };
              setDynData((d) => rekey(d));
              setCustomNames((m) => rekey(m));
            }}
          />

          {/* Links + notes */}
          <Field label="Item link" hint="N/A for white balls unless special alignment">
            <Input size="xs" value={itemLink} onChange={setItemLink} placeholder="https://…" />
          </Field>
          <Field label="Reference logo link" hint="Previous proofs · one link per line">
            <Textarea
              value={refLink}
              onChange={setRefLink}
              rows={2}
              resize="vertical"
              placeholder={'https://…\nhttps://…'}
            />
          </Field>
          <Field label="Special instructions">
            <Textarea
              value={notes}
              onChange={setNotes}
              rows={3}
              resize="vertical"
              placeholder="Write N/A if unneeded"
            />
          </Field>

          {/* Attached images — INSIDE the form scroll container,
              below the last question. Whole section + each row
              animates in/out via opacity + y slide. */}
          <AnimatePresence initial={false}>
            {images.length > 0 && (
              <motion.div
                key="image-list"
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: 'var(--gb-text-muted)',
                }}>
                  <span>Attached images</span>
                  <Tag tone="neutral" size="xs" mono>{images.length}</Tag>
                </div>
                {/* Inline non-hosted warning — sits ABOVE the image
                    chips so the user reads it before the list. */}
                {hasUnhostedImage && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px',
                      background: 'var(--gb-warning-tint-soft)',
                      border: '1px solid var(--gb-warning-tint-border)',
                      borderRadius: 'var(--gb-r-sm)',
                      color: 'var(--gb-warning-fg)',
                      fontSize: 10.5, fontWeight: 600,
                    }}
                  >
                    <I.alert size={11} />
                    <span>Non-hosted images won&apos;t render in email templates — only embedded link previews will.</span>
                  </motion.div>
                )}
                <AnimatePresence initial={false}>
                  {images.map((img) => (
                    <motion.div
                      key={img.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <SourceImageChip
                        imageData={img}
                        onRemove={() => removeImage(img.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results panel (shown after a successful submit) */}
          {stage === 'results' && results.length > 0 && (
            <ResultsPanel results={results} onClose={() => bindCloseRef.current?.()} />
          )}
        </div>

        {/* RIGHT — gallery (column inside the body row) */}
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
              <GalleryItem key={i} proof={p} index={i} />
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
      </div>
    </FloatingPanel>
  );
}

/* ───────────────────────────────────────────────────────────────
   Subcomponents
─────────────────────────────────────────────────────────────── */

/* SourceImageChip — in-form chip listed under the last question.
   Thumbnail + caption + Remove. No upload UI — image acquisition
   lives entirely in ImagePreview. */
function SourceImageChip({ imageData, onRemove }) {
  const src = imageData.dataUrl || imageData.url;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: 6,
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
    }}>
      <img
        src={src}
        alt=""
        style={{
          width: 28, height: 28, objectFit: 'cover',
          borderRadius: 'var(--gb-r-xs)',
          border: '1px solid var(--gb-border-subtle)',
          flexShrink: 0,
        }}
      />
      <span style={{
        flex: 1, fontSize: 10.5,
        color: 'var(--gb-text-tertiary)',
        fontFamily: 'var(--gb-font-mono)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {imageData.dataUrl ? 'Custom image · attached' : (imageData.url || '')}
      </span>
      <Btn size="sm" variant="ghost" onClick={onRemove}>Remove</Btn>
    </div>
  );
}

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
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          height: 24, padding: '0 9px',
          background: 'var(--gb-surface-2)',
          border: '1px solid ' + (error ? 'var(--gb-error)' : 'var(--gb-border-default)'),
          borderRadius: 'var(--gb-r-sm)',
          fontSize: 11, fontWeight: 500,
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
                    onMouseDown={(e) => { e.preventDefault(); onAdd(it); }}
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
                        onMouseDown={(e) => { e.preventDefault(); onRemove(it); }}
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

/* DynamicFieldsList — renders one block per selected item, with
   instance counters when duplicates exist (e.g. "Ball · 2"). Items
   without a defined field group (e.g. "Pad to Digital Request") are
   skipped — they're a request, not a deliverable. Each block has its
   own delete button that pulls the item out of selectedItems. */
function DynamicFieldsList({
  selectedItems, dynData, autoNames, customNames,
  onUpdate, onRenameItem, onRemove,
}) {
  const counts = {};
  const seen = {};
  for (const it of selectedItems) counts[it] = (counts[it] || 0) + 1;
  const blocks = selectedItems.map((item, idx) => {
    const fields = getDynFieldsFor(item);
    seen[item] = (seen[item] || 0) + 1;
    const suffix = counts[item] > 1 ? ` · ${seen[item]}` : '';
    return { item, idx, fields, suffix };
  });
  if (blocks.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 4,
    }}>
      <AnimatePresence initial={false}>
        {blocks.map(({ item, idx, fields, suffix }) => (
          <DynamicItemBlock
            key={`${item}-${idx}`}
            item={item}
            suffix={suffix}
            fields={fields}
            data={dynData[idx] || {}}
            autoName={autoNames?.[idx] || ''}
            customName={customNames?.[idx] || ''}
            onRename={(v) => onRenameItem?.(idx, v)}
            onChange={(fieldId, v) => onUpdate(idx, fieldId, v)}
            onRemove={() => onRemove(idx)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function DynamicItemBlock({ item, suffix, fields, data, autoName, customName, onRename, onChange, onRemove }) {
  // Items without field groups (Pad to Digital Request) still get a
  // tiny chip-style block so the user sees the item is acknowledged
  // and has a delete affordance.
  const hasFields = !!fields && fields.length > 0;
  return (
    <motion.div
      layout
      // Opacity + y slide only — avoid `height: auto` here because
      // it measures 0 inside scrollable parents and the block stays
      // collapsed. Layout animation handles neighbor reflow.
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      <div style={{
        padding: 10,
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-surface-1)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 8,
        }}>
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 10, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--gb-brand-label)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item}{suffix}</span>
          {!hasFields && (
            <span style={{
              fontSize: 9.5, fontWeight: 600,
              color: 'var(--gb-text-ghost)',
              fontStyle: 'italic',
            }}>No extra details needed</span>
          )}
          <Btn
            size="sm"
            variant="ghost"
            icon={<I.close size={10} />}
            onClick={onRemove}
            title="Remove this item"
            style={{ width: 22, height: 22, padding: 0 }}
          />
        </div>

        {/* Editable proof name — pre-filled with the autogenerated
            default. User can override per block, or clear back to "" to
            re-use the default. */}
        <Field
          label="Proof name"
          hint={!customName ? 'Auto-generated — edit to override' : 'Custom name'}
          style={{ marginBottom: hasFields ? 8 : 0 }}
        >
          <Input
            size="xs"
            value={customName || autoName}
            onChange={(v) => onRename?.(v === autoName ? '' : v)}
            placeholder={autoName}
          />
        </Field>

        {hasFields && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {fields.map((f) => {
              if (f.dependsOn && data[f.dependsOn] === f.dependsNotValue) return null;
              const val = data[f.id] ?? f.default ?? '';
              return (
                <Field key={f.id} label={f.label} hint={f.hint}>
                  {f.type === 'select' ? (
                    <Dropdown
                      size="xs"
                      value={val}
                      onChange={(v) => onChange(f.id, v)}
                      options={f.options.map((o) => ({ id: o, label: o }))}
                    />
                  ) : (
                    <Input
                      size="xs"
                      value={val}
                      onChange={(v) => onChange(f.id, v)}
                      placeholder={f.hint || ''}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* GalleryItem — square thumbnail card with the 3D-sphere faux logo
   when no real thumbnail is available. Sphere uses brand + canvas
   tokens (theme-aware), with an inset shadow for depth and a centered
   monospace label (e.g. "v3"). Below the thumbnail sits a pill row
   with the proof name + status badge + open-arrow.
   Adapted from SubmitProofView in the design handoff
   (surfaces-3.jsx ~line 519). */
function GalleryItem({ proof, index = 0 }) {
  const label = proof.label || (proof.name?.match(/v\d+/i)?.[0] || '');
  // Alternating bg gradient so adjacent thumbnails read as distinct.
  const bg = index % 2
    ? 'linear-gradient(135deg, var(--gb-surface-2) 0%, var(--gb-surface-canvas) 50%, var(--gb-surface-2) 100%)'
    : 'linear-gradient(135deg, var(--gb-surface-2) 0%, var(--gb-surface-canvas) 100%)';
  return (
    <a
      href={proof.proofLink || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        textDecoration: 'none',
        marginBottom: 14,
      }}
    >
      {/* Square thumbnail container */}
      <div style={{
        width: '100%', aspectRatio: '1',
        borderRadius: 'var(--gb-r-md)',
        background: bg,
        border: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {proof.thumbUrl ? (
          <img
            src={proof.thumbUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          // Faux 3D sphere — radial gradient gives the highlight on
          // the upper-left, inset shadow rounds the bottom. Brand
          // color blended into surface for the sphere body so it
          // recolors across themes. Label sits dead-center.
          <div style={{
            width: '60%', aspectRatio: '1',
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%,
              color-mix(in srgb, var(--gb-brand-label) 28%, var(--gb-surface-canvas)) 0%,
              var(--gb-surface-canvas) 75%)`,
            boxShadow: 'inset 0 -10px 30px rgba(0,0,0,0.45)',
            position: 'relative',
          }}>
            {label && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 18, fontWeight: 800,
                color: 'color-mix(in srgb, var(--gb-brand-label) 70%, transparent)',
                fontFamily: 'var(--gb-font-mono)',
                letterSpacing: -0.5,
                whiteSpace: 'nowrap',
              }}>{label}</div>
            )}
          </div>
        )}
      </div>

      {/* Info pill — name + status badge + chevron */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 18, padding: '4px 6px 4px 10px',
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{proof.name}</div>
          {proof.status && (
            <Tag tone={statusTone(proof.status)} size="xs">{proof.status}</Tag>
          )}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          color: 'var(--gb-text-muted)',
        }}>
          <I.chevr size={11} />
        </span>
      </div>
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
