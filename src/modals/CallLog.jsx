import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Dropdown, Textarea, SectionLabel,
  I, useToast,
} from '../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   CallLog — quick-action modal for logging an outbound sales call.

   The flow that opens this modal:
     1. Rep clicks the "Call {name}" smart action on a contact or
        account page.
     2. The action handler fires `window.open('tel:…', '_blank')` to
        hand the dial off to whichever app owns the tel: protocol
        (3CX desktop, the 3CX PWA, or FaceTime on macOS).
     3. THEN it opens this modal so the rep can log the outcome
        without having to navigate away.

   Modal anatomy:
     • Header — phone-icon tile + "Log call" + contact / phone subtitle.
     • Quick log section — buttons for the rep's preset outcomes (set
       up from the settings page, with sensible defaults if none are
       saved). Picking a preset saves the record + closes immediately;
       this is the one-tap fast path for the common cases.
     • Custom log section — a category dropdown + freeform notes for
       cases the presets don't cover. Hitting "Save custom log" persists
       the entry + closes.

   Storage:
     • `chrome.storage.local.callLogPresets` — Array<Preset>; the
       rep-editable presets. Falls back to DEFAULT_PRESETS if the key
       is missing or empty so a fresh install still has rows.
     • `chrome.storage.local.callLogs`        — Array<Entry>; the
       persisted record of every logged call (newest first).

   Outside an extension context (e.g. the playground in a regular tab)
   we fall back to localStorage so the modal still demos end-to-end.
─────────────────────────────────────────────────────────────── */

const PRESETS_STORAGE_KEY = 'callLogPresets';
const LOGS_STORAGE_KEY    = 'callLogs';

/* Default preset outcomes — used when the user hasn't customized
   anything in settings yet. Order matches the order a rep usually
   considers them in: "did they pick up?" → "did the call go well?"
   → "couldn't reach them" → exceptions at the bottom. */
const DEFAULT_PRESETS = [
  { id: 'reached-interested',   label: 'Reached — interested',        tone: 'success' },
  { id: 'reached-not-now',      label: 'Reached — not interested',    tone: 'warning' },
  { id: 'voicemail',            label: 'Left voicemail',              tone: 'info'    },
  { id: 'no-answer',            label: 'No answer',                   tone: 'neutral' },
  { id: 'callback-requested',   label: 'Customer requested callback', tone: 'info'    },
  { id: 'wrong-number',         label: 'Wrong number',                tone: 'error'   },
];

/* Custom-log category options. These are stable (not user-editable
   like the presets) because the storage shape downstream — task list,
   analytics, etc. — depends on a known set of category ids. */
const CATEGORY_OPTIONS = [
  { id: 'spoke',        label: 'Spoke with customer'         },
  { id: 'voicemail',    label: 'Left voicemail'              },
  { id: 'no-answer',    label: 'No answer'                   },
  { id: 'wrong-number', label: 'Wrong number'                },
  { id: 'callback',     label: 'Customer requested callback' },
  { id: 'follow-up',    label: 'Follow-up needed'            },
  { id: 'other',        label: 'Other'                       },
];

/* Tone → tint mapping for the preset row's left icon tile.
   Mirrors the ModalHeader tone table but pulls the soft tints so the
   tile reads as a chip rather than a status badge. Neutral is for
   preset outcomes that don't carry an emotional valence (e.g. "No
   answer" — it's neither good nor bad, just a fact). */
const TONE_COLORS = {
  success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)' },
  warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)' },
  error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)'   },
  info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)'    },
  brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)'   },
  neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',       bd: 'var(--gb-border-default)'      },
};

/* ── Storage helpers ────────────────────────────────────────── */

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; } catch { return false; }
};

/** Load the rep's preset list, falling back to DEFAULT_PRESETS if
 *  nothing's stored yet. Returns a Promise that always resolves with
 *  a non-empty array — the modal will never render an empty Quick
 *  Log section. */
function loadPresets() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.get(PRESETS_STORAGE_KEY, (data) => {
        const stored = Array.isArray(data?.[PRESETS_STORAGE_KEY]) ? data[PRESETS_STORAGE_KEY] : null;
        resolve(stored && stored.length > 0 ? stored : DEFAULT_PRESETS);
      });
      return;
    }
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      resolve(parsed && parsed.length > 0 ? parsed : DEFAULT_PRESETS);
    } catch { resolve(DEFAULT_PRESETS); }
  });
}

/** Append a new call log entry to the persisted list. Newest first
 *  so downstream consumers (task list integration, call history)
 *  can render the timeline without sorting. */
function appendCallLog(entry) {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.get(LOGS_STORAGE_KEY, (data) => {
        const arr = Array.isArray(data?.[LOGS_STORAGE_KEY]) ? data[LOGS_STORAGE_KEY] : [];
        const next = [entry, ...arr];
        chrome.storage.local.set({ [LOGS_STORAGE_KEY]: next }, () => resolve(next));
      });
      return;
    }
    try {
      const raw = localStorage.getItem(LOGS_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const next = [entry, ...arr];
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(next));
      resolve(next);
    } catch { resolve([entry]); }
  });
}

/* ── Component ──────────────────────────────────────────────── */

/**
 * Props
 *   contactName   string         — display name shown in subtitle + stored on the entry
 *   contactType   'contact' | 'account'   — categorizes the entry; defaults to 'contact'
 *   phone         string         — the number that was dialed; shown in subtitle for confirmation
 *   onClosed      () => void     — fires after the close animation finishes (FloatingPanel-driven)
 *   bindClose     (fn) => void   — receives the animated-close fn; lets parents close imperatively
 */
export function CallLog({
  contactName = 'Contact',
  contactType = 'contact',
  phone = '',
  onClosed,
  bindClose,
}) {
  const toast = useToast();
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [category, setCategory] = useState('spoke');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Bridge the FloatingPanel's animated-close fn so internal handlers
  // can dismiss with the proper transition (vs unmounting outright,
  // which would skip the close anim).
  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => {
    bindCloseRef.current = fn;
    if (bindClose) bindClose(fn);
  };
  const animatedClose = () => bindCloseRef.current?.();

  // Pull the rep's preset list on mount. Stays in sync if the user
  // edits presets from the settings page mid-modal because each open
  // re-mounts and re-fetches; live updates aren't needed for a modal
  // this short-lived.
  useEffect(() => { loadPresets().then(setPresets); }, []);

  /* Build the persisted entry shape. Both preset + custom logs share
     core fields (id, timestamp, contact info, phone) and diverge on
     the `mode` discriminator + mode-specific fields. */
  const buildEntry = (extras) => ({
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    contactName,
    contactType,
    phone,
    ...extras,
  });

  /* Quick-path: a preset row was clicked. Single click → record →
     close. No confirmation step — the preset itself IS the user's
     decision. */
  const savePreset = async (preset) => {
    if (saving) return;
    setSaving(true);
    const entry = buildEntry({
      mode:       'preset',
      presetId:   preset.id,
      label:      preset.label,
      tone:       preset.tone,
    });
    await appendCallLog(entry);
    toast?.success?.(`Logged: ${preset.label}`, { duration: 2200 });
    animatedClose();
  };

  /* Custom path: rep filled in the category + notes. Notes are
     required (empty custom log is meaningless), category defaults
     to 'spoke' so a rep who just types a note + hits save still
     produces a categorized entry. */
  const saveCustom = async () => {
    if (saving) return;
    if (!notes.trim()) {
      toast?.warning?.('Add a note, or pick a preset above', { duration: 2400 });
      return;
    }
    setSaving(true);
    const entry = buildEntry({
      mode:          'custom',
      category,
      categoryLabel: CATEGORY_OPTIONS.find((c) => c.id === category)?.label || category,
      notes:         notes.trim(),
    });
    await appendCallLog(entry);
    toast?.success?.('Call logged', { duration: 2200 });
    animatedClose();
  };

  return (
    <FloatingPanel
      width={440}
      backdrop
      draggable
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<I.phone />}
        title="Log call"
        subtitle={`${contactName}${phone ? ' · ' + phone : ''}`}
      />

      <div style={{
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '70vh', overflowY: 'auto',
      }}>
        {/* ── Quick log — preset rows ─────────────────────── */}
        <div>
          <SectionLabel>Quick log</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {presets.map((p) => (
              <PresetRow key={p.id} preset={p} disabled={saving} onPick={savePreset} />
            ))}
          </div>
        </div>

        {/* ── "or" divider ────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--gb-text-muted)',
          fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
          <span>or custom</span>
          <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        </div>

        {/* ── Custom log — category dropdown + freeform notes ─ */}
        <div>
          <SectionLabel>Custom log</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Dropdown
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
                placeholder="Select category…"
              />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <Textarea
                value={notes}
                onChange={setNotes}
                placeholder="Describe what happened on the call…"
                rows={4}
                resize="vertical"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer — context hint on the left, actions on the right ── */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{
          fontSize: 10.5, color: 'var(--gb-text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {phone ? `Dialing ${phone} via tel:` : 'No phone — log only'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={saving}>Cancel</Btn>
          <Btn size="sm" variant="primary"   onClick={saveCustom}    disabled={saving}>Save custom log</Btn>
        </div>
      </div>
    </FloatingPanel>
  );
}

/* Small label component for the form fields — matches the uppercase
   micro-label pattern used elsewhere (CRMCreateContact field heads). */
function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.6,
      color: 'var(--gb-text-muted)',
      marginBottom: 4,
    }}>{children}</div>
  );
}

/* A single preset row in the Quick Log section. Clickable button so
   keyboard activation works (Enter/Space), styled as a row with:
     • tone-tinted icon tile on the left (matches preset.tone)
     • bold preset label centered
     • chevron on the right that brightens on hover, signaling
       "click does something"
   Hover state is local — no need for a global hover bus. */
function PresetRow({ preset, disabled, onPick }) {
  const [hover, setHover] = useState(false);
  const tone = TONE_COLORS[preset.tone] || TONE_COLORS.neutral;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(preset)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr 14px',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        background: hover && !disabled ? 'var(--gb-fill-soft)' : 'transparent',
        border: '1px solid ' + (hover && !disabled ? 'var(--gb-border-default)' : 'transparent'),
        borderRadius: 'var(--gb-r-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        transition: 'background var(--gb-anim-fast), border-color var(--gb-anim-fast)',
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 'var(--gb-r-sm)',
        background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <I.phone size={11} />
      </span>
      <span style={{
        fontSize: 12.5, fontWeight: 600,
        color: 'var(--gb-text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {preset.label}
      </span>
      <span style={{
        color: hover && !disabled ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        display: 'flex',
        transition: 'color var(--gb-anim-fast)',
      }}>
        <I.chevr size={11} />
      </span>
    </button>
  );
}
