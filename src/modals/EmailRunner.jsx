import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, DraggablePopup, PopupDragContext, Dot, Field, RangeSlider, Tag, TemplatePicker, TemplateSplits, I, Spinner, Switch, Input, variationLabel } from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { pickFromAddress } from '../lib/sender.js';
import { sendEmail } from '../lib/emailSender.js';
import { useDevSetting } from '../lib/devSettings.js';
import { renderTemplate } from '../lib/variableResolution.js';
import { directContactVariables } from '../lib/contactImport.js';

/* ───────────────────────────────────────────────────────────────
   EmailRunner — draggable bottom-anchored panel that drives a bulk
   email send.

   UX
   --
   The panel slides up from the bottom of the viewport (initial
   position is centred horizontally, hugging the bottom edge with
   24px of breathing room). A drag handle (six dots) on the header
   lets the user reposition it anywhere on screen — same pattern as
   the Color Swap popover in ImagePreview.

   Template picker
   ---------------
   Ports the popup.jsx dropdown shape: each template with variations
   renders an inline-expanding parent row whose sub-options are
   "(original) + every variation". Selecting:
     - just the parent template  → random variation per contact
     - a specific variation row  → that variation pinned for ALL contacts
   Composite ids (`${tplId}::${varId}`) drive the selection so the
   dropdown's active highlight + check mark land on the chosen row.

   Orchestration runs in background.js: we send the list of
   { url, name, id } contacts plus the chosen template and delay
   bounds. Progress events come back via chrome.runtime.onMessage
   filtered by a per-run runId so a stray older run can't bleed in.
─────────────────────────────────────────────────────────────── */

/* Width matches the popup-popover footprint so the template picker
   has the same visual proportions the rep is used to from the
   toolbar popup. Less squeezed-looking dropdown trigger + roomier
   menu. */
const PANEL_W = 380;
/* Vertical budget: header + template field + (variation weights
   when present) + delay range + footer all stack inside an
   overflow:auto body. At 480 the form was clipping the delay
   slider and the footer's Send button when the template
   dropdown was open OR when variation weights expanded. 620
   fits the full idle form comfortably and leaves the dropdown
   room to expand under its 240-cap without spilling. */
const PANEL_H = 620;

/* Hide the inner body scrollbar in WebKit too — scrollbar-width:none
   handles Firefox. Injected once at first EmailRunner mount. */
const SCROLLBAR_STYLE_ID = '__gb-email-runner-noscroll';
function ensureNoScrollStyle() {
  if (typeof document === 'undefined' || document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SCROLLBAR_STYLE_ID;
  el.textContent = `
    .gb-email-runner-body::-webkit-scrollbar { width: 0; height: 0; display: none; }
    @keyframes gb-er-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    /* Quick Send redesign keyframes (verbatim from the design bundle). */
    @keyframes qs-rotate { to { transform: rotate(360deg); } }
    @keyframes qs-breathe { 0%,100% { opacity: .75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
    @keyframes qs-ripple { from { transform: scale(.62); opacity: .85; } to { transform: scale(1.55); opacity: 0; } }
    @keyframes qs-pop { from { transform: scale(.4); } to { transform: scale(1); } }
    @keyframes qs-burst {
      from { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
      to   { transform: translate(-50%,-50%) translate(var(--qs-x), var(--qs-y)) scale(.4); opacity: 0; }
    }
    @keyframes qs-now-in { from { transform: translateY(7px); } to { transform: none; } }
    @keyframes qs-bump { 0% { transform: scale(1); } 32% { transform: scale(1.38); } 100% { transform: scale(1); } }
    @keyframes qs-fade-in { from { transform: translateY(4px); } to { transform: none; } }
    @keyframes qs-state-in { from { transform: translateY(9px); } to { transform: none; } }
    @keyframes qs-center-in { from { transform: scale(.86); } to { transform: scale(1); } }
    @keyframes qs-grow-up { from { transform: scaleY(.05); opacity: .3; } to { transform: scaleY(1); opacity: .85; } }
  `;
  document.head.appendChild(el);
}
const fmtSeconds = (n) => `${n}s`;

/* Weighted random pick over `items` using `weights[item.id]`. Items
   with zero (or missing) weight are effectively excluded — set a
   slider to 0% to take a variation out of the pool. Falls back to a
   uniform pick when every weight is zero so a misconfigured weights
   map still rotates between variations instead of always returning
   the first. */
function pickWeighted(items, weights) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const total = items.reduce((s, it) => s + Math.max(0, weights?.[it.id] || 0), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * total;
  for (const it of items) {
    const w = Math.max(0, weights?.[it.id] || 0);
    if (roll < w) return it;
    roll -= w;
  }
  return items[items.length - 1];
}

/* Promise wrapper around chrome.runtime.sendMessage so the orchestrator
   reads top-to-bottom. Resolves null on lastError instead of throwing
   so the loop can decide what to do per-step. */
const sendBg = (msg) => new Promise((resolve) => {
  try {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  } catch { resolve(null); }
});

/* Per-recipient send log (email → last-sent ms), persisted so the "skip if
   emailed in the last N days" rule survives across runs/sessions. Keyed by the
   lowercased recipient address. */
const EMAIL_LOG_KEY = 'gbEmailSendLog';
const DAY_MS = 86400000;
function readEmailLog() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve({}); return; }
      chrome.storage.local.get(EMAIL_LOG_KEY, (d) => resolve((d && d[EMAIL_LOG_KEY]) || {}));
    } catch { resolve({}); }
  });
}
function writeEmailLog(log) { try { chrome.storage.local.set({ [EMAIL_LOG_KEY]: log }); } catch { /* */ } }
const _dnc = (s) => /do\s*not\s*contact/i.test(String(s || ''));

/* Delegates to the shared renderer so OR-blocks (`{{a|b}}`) and
   conditional drop-out behave identically to the popup's
   single-contact path. `defs` (the template's variable definitions)
   MUST be passed so renderTemplate runs dropConditional — without it
   the smart.conditional "drop the sentence when empty" option silently
   no-ops on the bulk path. Unknown / fully-unresolved tokens still pass
   through as `{{...}}` so the rep notices missing data instead of
   silently sending blanks. */
const renderStr = (str, vars, defs) => renderTemplate(str, vars, defs);

/* The vanilla sendViaPA handler appends emailSignature for the popup's
   single-contact path; the orchestrator hits paAutomate directly so we
   match the same behaviour ourselves. */
const readSignature = () => new Promise((resolve) => {
  try {
    chrome.storage.local.get('emailSignature', (out) => resolve(out?.emailSignature || ''));
  } catch { resolve(''); }
});

/* Hard-coded templates used when the modal is in mock mode (playground
   demo, CRMSearch's useMock branch). Three flavours so the variations
   dropdown has something interesting to render and the per-contact
   random-variation pick is visibly different across the run. */
const MOCK_TEMPLATES = [
  {
    id: 'mock-followup',
    name: 'Follow-up nudge',
    type: 'email',
    enabled: true,
    subject: 'Quick follow-up — {{contactFirstName}}',
    body: '<p>Hi {{contactFirstName}},</p><p>Just checking in on the order from last month — anything else you need from us?</p>',
    toField: { type: 'auto' },
    vars: {
      contactFirstName: { type: 'builtin', builtin: 'firstName', smart: { fallback: 'there' } },
    },
    variations: [],
  },
  {
    id: 'mock-quote',
    name: 'Updated quote',
    type: 'email',
    enabled: true,
    subject: 'Updated quote ready · {{accountName}}',
    body: '<p>Hey {{contactFirstName}},</p><p>We pulled together a fresh quote based on last week\'s call. Let me know if anything looks off.</p>',
    toField: { type: 'auto' },
    vars: {
      contactFirstName: { type: 'builtin', builtin: 'firstName', smart: { fallback: 'there' } },
      accountName: { type: 'builtin', builtin: 'accountName', smart: { fallback: 'your team' } },
    },
    variations: [
      { id: 'short', label: 'Short version', body: '<p>Hi {{contactFirstName}}, fresh quote is in. Let me know if it works.</p>' },
      { id: 'long',  label: 'Long version',  body: '<p>Hi {{contactFirstName}}, attached is the updated quote with the volume break we discussed. Happy to walk through it whenever.</p>' },
    ],
  },
  {
    id: 'mock-checkin',
    name: 'Annual check-in',
    type: 'email',
    enabled: true,
    subject: 'Quick check-in',
    body: '<p>Hi {{contactFirstName}},</p><p>Been a minute since we last talked — wanted to see how things are going on your end.</p>',
    toField: { type: 'auto' },
    vars: {
      contactFirstName: { type: 'builtin', builtin: 'firstName', smart: { fallback: 'there' } },
    },
    variations: [],
  },
];

/* Mock sendBg: fakes the chrome.runtime round-trip with realistic
   timing so the playground can drive the entire send animation
   (Sending → Sent / Failed badges, trail of names, progress bar)
   without an extension context. ~85% success rate so a small share
   of rows show up as failures and the rep can see how those land. */
const mockSendBg = (msg) => new Promise((resolve) => {
  const a = msg?.action;
  if (a === 'fetchRaw') {
    setTimeout(() => resolve({ ok: true, text: '<html><body>(mock contact page)</body></html>' }), 380 + Math.random() * 220);
  } else if (a === 'resolveVarsForHtml') {
    setTimeout(() => resolve({
      resolved: { contactFirstName: 'Friend', accountName: 'your team' },
      toEmail: `mock-${Math.random().toString(36).slice(2, 7)}@example.com`,
    }), 180 + Math.random() * 140);
  } else if (a === 'paAutomate') {
    setTimeout(() => {
      const ok = Math.random() > 0.15;
      resolve(ok ? { ok: true } : { ok: false, error: 'Mock 500 (random)' });
    }, 420 + Math.random() * 320);
  } else {
    resolve(null);
  }
});

export function EmailRunner({
  open, contacts, onClose, anchorHostId,
  /* Optional cursor { x, y } from the click that opened the
     panel — when set, DraggablePopup spawns the panel near the
     cursor instead of relative to the parent modal. */
  cursor,
  // Row-level loading-state hooks. CRMSearch / TaskList wire these to
  // render per-row spinners + sent/fail badges, mirroring the Quick
  // Actions UX. EmailRunner's own UI shows ONLY the aggregate progress
  // (counts + bar) — per-row detail belongs on the list.
  onRowStart,
  onRowDone,
  onResetRowStates,
  /* Fires once at the start of a run with the full id list so the
     parent list can flip every contact to a "queued" state badge
     immediately. Without this, rows sit on their natural "new"
     status until each one's onRowStart lands — which is wrong
     because the user has already committed the run and the rows
     are demonstrably queued for send. */
  onRowsQueued,
  /* Fires `true` when the orchestrator starts a run, `false` when it
     finishes (cleanly OR via cancel). TaskList uses this so its scan
     beam dwells on the just-sent row through the inter-send delay
     instead of fading out the moment that row's status flips to
     'sent' — `allSettled` over the so-far-known rows would otherwise
     trigger the auto-clear between every send. */
  onRunStateChange,
  /* Mock mode: skip chrome.runtime calls + chrome.storage reads,
     wire in MOCK_TEMPLATES and a fake sendBg with realistic timings.
     CRMSearch flips this on when its own useMock dev flag is set so
     the playground can drive the full send animation end-to-end. */
  useMock = false,
}) {
  const toast = useToast();
  /* Per-rep mailbox name (devSettings 'email.localPart'). Glues
     onto the per-template domain at send time to form the From:
     address — e.g. 'cullen' + 'golfballs.com' → cullen@golfballs.com. */
  const emailLocalPart = useDevSetting('email.localPart');
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedVariationId, setSelectedVariationId] = useState(null);
  const [delay, setDelay] = useState([15, 45]); // seconds
  // Skip rules — contacts that match are quietly skipped (not emailed) and
  // counted/tagged as "skipped" rather than sent.
  const [skipDnc, setSkipDnc] = useState(true);            // name/email says "do not contact"
  const [skipRecent, setSkipRecent] = useState(false);     // emailed within N days
  const [skipRecentDays, setSkipRecentDays] = useState(30);
  const [status, setStatus] = useState('idle');  // 'idle' | 'running' | 'done'
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [counts, setCounts] = useState({ sent: 0, failed: 0, skipped: 0 });
  /* Per-row tail shown inside the panel — last 4 names with status
     badges. Kept short on purpose; the full per-row truth lives on
     the parent list (CRMSearch / TaskList) via the row callbacks. */
  const [trail, setTrail] = useState([]); // [{ name, status, email? }]
  const [paUrl, setPaUrl] = useState('');
  /* PA is "ready" only when the rep both enabled it AND saved a URL —
     matches the popup / email-preview predicate. When it's NOT ready the
     run still proceeds, but each send opens an Outlook window instead of
     hitting PA (see the send step + emailSender). */
  const [paEnabled, setPaEnabled] = useState(false);
  /* Live run telemetry the redesigned panel reads. `current` is the
     in-flight contact (drives the "Now sending" card); `delayState` is the
     between-sends countdown (drives the pacing bar); `meta` stamps the
     run's start/finish for the done-state elapsed readout. */
  const [current, setCurrent] = useState(null);       // { contactId, name, email } | null
  const [delayState, setDelayState] = useState(null); // { remaining, total } | null
  const [meta, setMeta] = useState({ startedAt: 0, finishedAt: 0 });
  /* Per-variation weights used by the Random-mode picker. Keys are
     variation ids; values sum to 100. Initialized to equal split
     when a template is picked and reset whenever the variation set
     changes; user drags on the sliders below redistribute the
     remainder proportionally. */
  const [variationWeights, setVariationWeights] = useState({});
  /* Run-cancellation token. Each onRun increments it; the loop checks
     it between iterations so closing the panel mid-send (or starting
     a fresh run) stops the orchestrator cleanly without leaving stale
     row spinners behind. */
  const runTokenRef = useRef(0);

  /* Load templates + PA URL on open. Filter matches the popup's
     visibleTemplates: drop disabled + case templates, keep email /
     account / untyped (which still resolve against a contact page
     in the background orchestrator). Mock mode skips the storage
     read entirely and uses the canned MOCK_TEMPLATES + a placeholder
     PA URL so canRun passes through. */
  useEffect(() => {
    if (!open) return;
    if (useMock) {
      setTemplates(MOCK_TEMPLATES);
      setPaUrl('mock://power-automate');
      setPaEnabled(true);
      return;
    }
    try {
      chrome.storage.local.get(['templates', 'featureFlags'], (out) => {
        const all = Array.isArray(out?.templates) ? out.templates : [];
        const eligible = all.filter((t) =>
          t.enabled !== false
          && t.type !== 'case'
          && (!t.type || t.type === 'email' || t.type === 'account'));
        setTemplates(eligible);
        setPaUrl(out?.featureFlags?.powerAutomateUrl || '');
        setPaEnabled(out?.featureFlags?.powerAutomateEnabled === true);
      });
    } catch {}
  }, [open, useMock]);

  /* Cancel in-flight run when the panel closes — bumps the token so
     the orchestrator's between-iteration guard short-circuits, and
     drops the running-state signal so the parent list's scan beam
     fades out instead of staying stuck on the last sending row. */
  useEffect(() => {
    if (!open) {
      /* Modal closing — cancel any in-flight run (token bump aborts
         the orchestrator's between-iteration guard) and wipe the
         run-only state so the next open lands on a fresh form. The
         previous version dropped the run signal but left status,
         counts, progress, and trail intact; reopening replayed the
         post-run state and the rep couldn't start a new run without
         hard-closing the parent list to remount us. */
      runTokenRef.current += 1;
      setStatus('idle');
      setCounts({ sent: 0, failed: 0, skipped: 0 });
      setProgress({ current: 0, total: 0 });
      setTrail([]);
      setCurrent(null);
      setDelayState(null);
      setMeta({ startedAt: 0, finishedAt: 0 });
      onRunStateChange?.(false);
    }
  }, [open, onRunStateChange]);

  /* Unmount cancel. When the PARENT modal closes (TaskList /
     CRMSearch shuts), EmailRunner unmounts without ever flipping
     `open` to false, so the open-effect above never fires and the
     orchestrator's async loop keeps walking the contact list in
     the background — sending the rest of the blast with no UI to
     stop it. Bump the token on unmount so the next between-
     iteration guard short-circuits. */
  useEffect(() => () => {
    runTokenRef.current += 1;
  }, []);

  useEffect(() => { ensureNoScrollStyle(); }, []);

  /* Sentinel composite-id suffix that pins the parent template
     itself (no variation applied) — distinct from "no pin" which
     means "random across variations per contact." */
  const ORIGINAL_PIN = '__original';

  const selectedTpl = templates.find((t) => t.id === selectedId);
  /* True whenever the parent template (no specific variation pinned)
     is the active selection and the template carries variations.
     The orchestrator's per-row pick rolls weighted across the pool
     in that case; otherwise it uses the pinned variation. */
  const isRandomMode = !!selectedTpl
    && Array.isArray(selectedTpl.variations) && selectedTpl.variations.length > 0
    && !selectedVariationId;

  /* Composite value the shared TemplatePicker reads/writes.
       `tplId`           → parent picked (Random mode)
       `tplId::varId`    → variation pinned (pinned mode)
     Empty string when nothing is selected so the picker shows its
     placeholder row. */
  const dropdownValue = selectedVariationId
    ? `${selectedId}::${selectedVariationId}`
    : (selectedId || '');
  const onTemplatePickerChange = (composite) => {
    if (typeof composite === 'string' && composite.includes('::')) {
      const [parentId, variationId] = composite.split('::');
      setSelectedId(parentId);
      setSelectedVariationId(variationId);
      return;
    }
    setSelectedId(String(composite || ''));
    setSelectedVariationId(null);
  };

  /* The weightable pool used by the Random-mode picker AND the
     sliders UI. The bare template is exposed as "Variation 1"
     (id = ORIGINAL_PIN, variation = null); saved variations follow
     numbered from 2. Building this once avoids re-deriving it at
     every render of the sliders + every pick in the orchestrator. */
  const weightableItems = useMemo(() => {
    const variations = Array.isArray(selectedTpl?.variations) ? selectedTpl.variations : [];
    if (variations.length === 0) return [];
    return [
      { id: ORIGINAL_PIN, label: selectedTpl?.baseLabel || 'Variation 1', variation: null },
      ...variations.map((v, i) => ({
        id: v.id,
        /* Show the variation's custom label when it has one; auto/empty
           labels fall back to positional numbering (the synthetic Variation
           1 above is the base body). */
        label: variationLabel(v, i),
        variation: v,
      })),
    ];
  }, [selectedTpl]);

  /* Initialize variation weights to an equal split when the pool
     changes (template swap OR variations added/removed). User-tuned
     weights are preserved across unrelated re-renders by checking
     whether the current key set already matches the pool ids. */
  useEffect(() => {
    if (weightableItems.length === 0) {
      setVariationWeights((cur) => (Object.keys(cur).length === 0 ? cur : {}));
      return;
    }
    setVariationWeights((cur) => {
      const ids = weightableItems.map((it) => it.id);
      const sameSet = ids.length === Object.keys(cur).length && ids.every((id) => id in cur);
      if (sameSet) return cur;
      const equal = 100 / ids.length;
      return Object.fromEntries(ids.map((id) => [id, equal]));
    });
  }, [weightableItems]);

  const canRun = !!selectedTpl && contacts.length > 0 && status !== 'running';

  const onRun = async () => {
    if (!canRun) return;
    /* PA-ready → send through Power Automate; otherwise the run still goes,
       opening one Outlook window per contact (mailto, stripped, no sig).
       Mock mode forces the PA path so the playground drives the animation. */
    const paReady = useMock ? true : (paEnabled && !!paUrl);
    /* Reset row UI on the parent list, mark every contact in the
       blast as queued so the row badges flip from new → queued
       immediately, then bump the run token and kick off the loop.
       The per-row onRowStart that runs inside the loop will then
       transition each queued row to sending in turn. */
    onResetRowStates?.();
    onRowsQueued?.(contacts.map((c) => c.contactId));
    runTokenRef.current += 1;
    const token = runTokenRef.current;
    setCounts({ sent: 0, failed: 0, skipped: 0 });
    setProgress({ current: 0, total: contacts.length });
    setTrail([]);
    setCurrent(null);
    setDelayState(null);
    setMeta({ startedAt: Date.now(), finishedAt: 0 });
    setStatus('running');
    onRunStateChange?.(true);

    /* In mock mode the orchestrator runs against in-process timers
       instead of chrome.runtime — lets the playground exercise the
       send animation (Sending → Sent / Failed badges, trail, the
       progress bar) without an extension context. */
    const dispatchBg = useMock ? mockSendBg : sendBg;

    const variations = Array.isArray(selectedTpl.variations) ? selectedTpl.variations : [];
    /* Pinned variation? Use its subject/body for everyone. Otherwise
       we pick one at random per contact below. */
    const pinnedV = selectedVariationId
      ? variations.find((v) => v.id === selectedVariationId)
      : null;
    const tplVars    = selectedTpl.vars    || {};
    const tplToField = selectedTpl.toField || { type: 'auto' };
    const replyMode  = selectedTpl.replyMode || 'standalone';

    /* Per-contact pipeline. All network I/O routes through background
       messages (fetchRaw to grab HTML without opening a tab,
       resolveVarsForHtml to drive resolveAllVarsAsync against the
       parsed document, paAutomate for the actual send). The CRM list
       row drives loading state via onRowStart / onRowDone — same UX
       as Quick Actions. */
    const lo = Math.max(0, Number(delay[0]) || 0);
    const hi = Math.max(lo, Number(delay[1]) || lo);

    // Skip-rule inputs, read once per run. The send log is loaded up front and
    // updated in memory as we go so "emailed in N days" reflects this run too.
    const emailLog = useMock ? {} : await readEmailLog();
    const recentCutoff = Math.max(1, Number(skipRecentDays) || 30) * DAY_MS;

    for (let i = 0; i < contacts.length; i++) {
      if (runTokenRef.current !== token) return; // cancelled
      const c = contacts[i];
      setProgress({ current: i + 1, total: contacts.length });
      setDelayState(null);
      setCurrent({ contactId: c.contactId, name: c.contactName || c.name || '', email: '' });
      onRowStart?.(c.contactId);

      let outcome = { status: 'error', error: 'unknown' };
      try {
        /* Pick subject/body for this contact.
             ORIGINAL_PIN  → use parent only, no random pick
             pinnedV       → use that specific variation
             null + vars   → random variation per contact
             null + no vars → parent only */
        /* Random mode rolls a fresh pick per contact using the
           rep's slider weights. The pool is `weightableItems`
           which includes the bare template ("Variation 1") AND
           every saved variation — so the original is in the rotation
           and the rep can weight it directly. Equal weights →
           uniform random; skewed weights → that distribution.
           ORIGINAL_PIN forces the bare template; pinnedV pins one
           specific variation for every contact. */
        let v;
        if (selectedVariationId === ORIGINAL_PIN) {
          v = null;
        } else if (pinnedV) {
          v = pinnedV;
        } else if (weightableItems.length) {
          v = pickWeighted(weightableItems, variationWeights)?.variation ?? null;
        } else {
          v = null;
        }
        const rawSubject = v?.subject || selectedTpl.subject || '';
        const rawBody    = v?.body    || selectedTpl.body    || '';

        // 1. Fetch the contact page when one exists. Spreadsheet rows that
        // only carry account_id intentionally have no contact URL; their
        // explicit email/name columns are the safe source of truth.
        let fetchedText = '';
        if (c.contactUrl) {
          const fetched = await dispatchBg({ action: 'fetchRaw', url: c.contactUrl });
          if (!fetched) {
            if (!c.email) throw new Error('Background not reachable (extension reloaded?)');
          } else if (!fetched.ok || typeof fetched.text !== 'string') {
            if (!c.email) throw new Error(fetched.error || `Fetch failed (HTTP ${fetched.status || '?'})`);
          } else {
            fetchedText = fetched.text;
          }
        }

        /* 2. Resolve template vars against the fetched HTML. Prefer
           the direct window global exposed by vanilla/main.js — it
           runs in this same content-script realm with a parsed
           Document, no cross-context message routing. Falls back to
           the runtime message (which round-trips through the
           background) when the global isn't on the page yet (e.g.
           main.js hasn't finished loading). The global is the path
           the user wants — the message route was the fragile one
           reported as "every send fails to evaluate." */
        const directVars = directContactVariables(c, tplVars);
        let resolved = null;
        if (fetchedText) {
          const directResolve = useMock ? null : window.__gbResolveVarsForHtml;
          resolved = directResolve
            ? await directResolve(fetchedText, tplVars, tplToField, c.contactUrl)
            : await dispatchBg({
                action:  'resolveVarsForHtml',
                html:    fetchedText,
                vars:    tplVars,
                toField: tplToField,
                url:     c.contactUrl,
              });
        }
        const resolvedVars = c.imported
          ? { ...(resolved?.resolved || {}), ...directVars }
          : { ...directVars, ...(resolved?.resolved || {}) };
        const toEmail      = c.imported ? (c.email || resolved?.toEmail || '') : (resolved?.toEmail || c.email || '');
        /* The resolver pulls contact.firstName + lastName off the
           fetched page via the schema engine and ships it as
           displayName. We prefer that over the caller-supplied
           contactName because the page is the source of truth — if
           the row came from an account-page list with no contact
           text, this still produces a real name for the trail. */
        const pageName = (c.imported
          ? (c.contactName || c.name || resolved?.displayName)
          : (resolved?.displayName || c.contactName || c.name || '')).trim();
        /* Last time this contact was emailed — the more recent of the contact
           page's Email-history date (the rep's real CRM record, extracted by the
           page engine) and our own local send log. Drives the "recently emailed"
           skip rule. */
        const lastEmailedMs = Math.max(Number(resolved?.lastEmailMs) || 0, (toEmail && emailLog[toEmail.toLowerCase()]) || 0);
        /* Enrich the "Now sending" card with the resolved name + recipient
           as soon as they're known (the row started with just the task-row
           text). */
        setCurrent((cur) => (cur && cur.contactId === c.contactId)
          ? { ...cur, name: pageName || cur.name, email: toEmail || cur.email }
          : cur);
        if (resolved?.error && !toEmail) {
          /* Bubble the resolver's own message up so a parse / engine
             failure shows the cause instead of "No recipient email". */
          outcome = { status: 'error', error: `Resolve failed: ${resolved.error}`, name: pageName };
        } else if (!toEmail) {
          outcome = { status: 'error', error: 'No recipient email resolved', name: pageName };
        } else if (skipDnc && (_dnc(pageName) || _dnc(toEmail))) {
          // Do-not-contact flag baked into the name or email → never send.
          outcome = { status: 'skipped', reason: 'Do not contact', email: toEmail, name: pageName };
        } else if (skipRecent && lastEmailedMs && (Date.now() - lastEmailedMs) < recentCutoff) {
          const days = Math.floor((Date.now() - lastEmailedMs) / DAY_MS);
          outcome = { status: 'skipped', reason: days <= 0 ? 'Emailed today' : `Emailed ${days}d ago`, email: toEmail, name: pageName };
        } else {
          // 3. Render template strings. The signature is applied by
          //    emailSender on the PA path (and dropped on the mailto
          //    fallback), so render the body WITHOUT it here.
          const subject  = renderStr(rawSubject, resolvedVars, tplVars);
          const signature = await readSignature();
          const htmlBody  = renderStr(rawBody, resolvedVars, tplVars);

          /* 4. Send. `from` resolves per-row: senderRandomize=true makes
             pickFromAddress fire a fresh random pick per contact so a
             50-row blast varies between senders; the local part comes
             from the rep's devSetting (→ cullen@golfballs.com). emailSender
             picks the transport — PA-ready → paAutomate (HTML + sig);
             PA-off → open one Outlook window for this contact (stripped,
             no sig). We inject dispatchBg so mock mode + cancel routing
             survive, and pass an explicit config so mock mode (paReady
             forced true above) stays on the PA animation path. */
          const from = pickFromAddress(selectedTpl, emailLocalPart);
          /* Last-chance cancel guard before the actual send — catches a
             cancel that arrived DURING the variable-resolution await
             above, which would otherwise fire one more send. */
          if (runTokenRef.current !== token) return;
          const res = await sendEmail(
            { from, to: toEmail, subject, htmlBody, replyMode, signature, config: { paReady, powerAutomateUrl: paUrl } },
            { dispatch: dispatchBg },
          );
          if (res.state === 'sent' || res.state === 'opened') {
            outcome = { status: 'sent', email: toEmail, name: pageName };
            if (!useMock && toEmail) { emailLog[toEmail.toLowerCase()] = Date.now(); writeEmailLog(emailLog); }
          } else {
            outcome = { status: 'error', error: res.error || 'Send failed', email: toEmail, name: pageName };
          }
        }
      } catch (e) {
        outcome = { status: 'error', error: e?.message || 'failed' };
      }

      if (runTokenRef.current !== token) return; // cancelled mid-iteration
      onRowDone?.(c.contactId, outcome);
      setCounts((cur) => (
        outcome.status === 'sent'
          ? { ...cur, sent: cur.sent + 1 }
          : outcome.status === 'skipped'
            ? { ...cur, skipped: cur.skipped + 1 }
            : { ...cur, failed: cur.failed + 1 }
      ));
      setTrail((cur) => {
        /* Display name preference: engine-extracted (firstName +
           lastName off the fetched page) → caller-supplied
           contactName → '(unknown)'. The first wins because the page
           is canonical; the second is the task-row text we get when
           the engine couldn't run (e.g. fetch failed before resolve). */
        const displayName = outcome.name || c.contactName || c.name || '(unknown)';
        /* Stable monotonic seq so AnimatePresence keys persist
           across the rolling slice window we show in the trail
           card (latest two). Without it, a moving window would
           reassign keys and break the layout-shift animation. */
        const seq = (cur[cur.length - 1]?.seq ?? 0) + 1;
        const next = [...cur, {
          seq,
          name: displayName,
          status: outcome.status,
          email: outcome.email,
          reason: outcome.reason,
        }];
        /* Keep a short buffer for the count chips upstream — the
           render slice below caps the visible window at 2. */
        return next.length > 8 ? next.slice(next.length - 8) : next;
      });

      // 5. Random delay between sends — skip after the last one, and skip
      //    entirely for a skipped contact (no message went out, no need to
      //    pace). Drive a live countdown so the panel's pacing bar animates.
      if (i < contacts.length - 1 && outcome.status !== 'skipped') {
        setCurrent(null);
        const ms = (lo + Math.random() * (hi - lo)) * 1000;
        const waitStart = Date.now();
        setDelayState({ remaining: ms, total: ms });
        await new Promise((res) => {
          const tick = setInterval(() => {
            if (runTokenRef.current !== token) { clearInterval(tick); res(true); return; }
            const remaining = Math.max(0, ms - (Date.now() - waitStart));
            setDelayState({ remaining, total: ms });
            if (remaining <= 0) { clearInterval(tick); res(true); }
          }, 80);
        });
        setDelayState(null);
        if (runTokenRef.current !== token) return;
      }
    }

    setStatus('done');
    setCurrent(null);
    setDelayState(null);
    setMeta((m) => ({ ...m, finishedAt: Date.now() }));
    onRunStateChange?.(false);
  };

  const sentCount   = counts.sent;
  const failedCount = counts.failed;
  const variationCount = selectedTpl?.variations?.length || 0;

  const settled = counts.sent + counts.failed + (counts.skipped || 0);
  const running = status === 'running';
  const panelW = status === 'idle' ? 384 : 424;
  const subtitle = status === 'idle'
    ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'} selected`
    : running
      ? `Sending… · ${settled} of ${contacts.length}`
      : [counts.sent ? `${counts.sent} sent` : '', counts.skipped ? `${counts.skipped} skipped` : '', counts.failed ? `${counts.failed} failed` : ''].filter(Boolean).join(' · ') || `All ${counts.sent} delivered`;

  return (
    <DraggablePopup
      open={open}
      onClose={onClose}
      anchorHostId={anchorHostId}
      cursorAnchor={cursor}
      width={panelW}
      maxHeight={760}
      icon={<I.send size={13} />}
      title="Quick Send"
      subtitle={subtitle}
      closeDisabled={status === 'running'}
      enterFrom="right"
    >
      {/* Hero — the persistent shared ring; only its centre cross-dissolves
          (count → live % → check) and its accent tweens brand→success. */}
      <div style={{ flexShrink: 0, display: 'grid', placeItems: 'center', padding: '22px 0 16px', background: 'linear-gradient(180deg, var(--gb-surface-1) 0%, transparent 100%)' }}>
        <HeroRing status={status} settled={settled} total={contacts.length} count={contacts.length} />
      </div>

      {/* Body — keyed cross-fade; the surface + hero persist, the content
          slides in (qs-state-in) on every state change. */}
      <div className="gb-email-runner-body" style={{ flex: 1, minHeight: 0, overflow: 'auto', scrollbarWidth: 'none' }}>
        <div key={status} style={{ padding: '2px 14px 14px', animation: 'qs-state-in .36s cubic-bezier(.34,1.2,.64,1) both' }}>
          {status === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field
                label="Template"
                hint={(() => {
                  if (!templates.length) return 'No email templates saved yet';
                  if (variationCount === 0) return 'Pick the email these contacts receive';
                  return `Each contact gets a weighted random pick · 1 of ${variationCount + 1} variations`;
                })()}
              >
                <TemplatePicker
                  mode="random"
                  templates={templates}
                  value={dropdownValue}
                  onChange={onTemplatePickerChange}
                  placeholder={templates.length ? 'Pick a template' : 'No templates'}
                  disabled={status === 'running'}
                  floating={false}
                  /* Cap the open list so a long template library scrolls inside
                     the dropdown (like a dropdown should) instead of stretching
                     the whole popup. */
                  listMaxHeight={300}
                />
              </Field>

              {/* Variation weights — revealed via a max-height tween when the
                  picked template has variations (matches the design). */}
              <div style={{ overflow: 'hidden', maxHeight: isRandomMode ? 360 : 0, opacity: isRandomMode ? 1 : 0, transition: 'max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease' }}>
                {isRandomMode && (
                  <Field label="Variation weights" hint="Sliders always sum to 100% — each contact rolls weighted by these.">
                    <TemplateSplits
                      items={weightableItems}
                      weights={variationWeights}
                      onChange={setVariationWeights}
                      disabled={status === 'running'}
                    />
                  </Field>
                )}
              </div>

              <Field label="Delay between sends" hint={`${fmtSeconds(delay[0])}–${fmtSeconds(delay[1])}, random per contact — keeps the blast looking human.`}>
                <RangeSlider values={delay} min={0} max={80} step={5} unit="s" onChange={(next) => setDelay(next)} disabled={status === 'running'} />
              </Field>

              <Field label="Skip rules" hint="Matching contacts are quietly skipped — not emailed — and counted as skipped.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SkipRow
                    on={skipDnc} onChange={setSkipDnc} disabled={status === 'running'}
                    title="Do-not-contact"
                    desc={'Skip when the first name, last name, or email contains “do not contact”.'}
                  />
                  <SkipRow
                    on={skipRecent} onChange={setSkipRecent} disabled={status === 'running'}
                    title="Recently emailed"
                    desc="Skip when the contact's last email (from their CRM email history) is within the window."
                    trailing={(
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Input
                          size="sm" type="number" min={1} max={365} value={String(skipRecentDays)}
                          onChange={(val) => setSkipRecentDays(Math.max(1, Math.min(365, Number(val) || 1)))}
                          disabled={status === 'running'}
                          style={{ width: 52, textAlign: 'center' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>days</span>
                      </div>
                    )}
                  />
                </div>
              </Field>
            </div>
          )}
          {running && <RunningView current={current} delay={delayState} counts={counts} progress={progress} trail={trail} />}
          {status === 'done' && <DoneView counts={counts} trail={trail} meta={meta} />}
        </div>
      </div>

      {/* Footer — morphs role per state. */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {status === 'idle' && (
          <>
            <Btn size="sm" variant="secondary" onClick={onClose}>Cancel</Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" variant="tinted" status="brand" icon={<I.send size={11} />} onClick={onRun} disabled={!canRun}>Run · {contacts.length}</Btn>
          </>
        )}
        {running && (
          <>
            <Btn size="sm" variant="tinted" status="error" icon={<StopIcon size={11} />} onClick={() => {
              runTokenRef.current += 1;
              setStatus('idle');
              setCounts({ sent: 0, failed: 0, skipped: 0 });
              setProgress({ current: 0, total: 0 });
              setTrail([]);
              setCurrent(null);
              setDelayState(null);
              setMeta({ startedAt: 0, finishedAt: 0 });
              onRunStateChange?.(false);
            }}>Cancel run</Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" variant="tinted" status="brand" icon={<Spinner size={11} />} disabled>Sending…</Btn>
          </>
        )}
        {status === 'done' && (
          <>
            <Btn size="sm" variant="secondary" onClick={onClose}>Close</Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" variant="tinted" status="brand" icon={<I.refresh size={11} />} onClick={onRun} disabled={!canRun}>Send again</Btn>
          </>
        )}
      </div>
    </DraggablePopup>
  );
}

/* Stop square glyph used by the mid-run Cancel button. Filled
   instead of stroked so the "this terminates the run" affordance
   reads at the 11px size where a stroked square loses fidelity. */
function StopIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
      style={{ display: 'block' }}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/* ───────────────────────────────────────────────────────────────
   Quick Send redesign — the persistent HeroRing + the three
   cross-dissolving content views (idle handled inline in the render).
   Ported faithfully from the design bundle (hero.jsx + states.jsx);
   CSS keyframes injected by ensureNoScrollStyle().
─────────────────────────────────────────────────────────────── */

function qsInitials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const QS_CLOCK = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

const RING_BOX = 132, RING_R = 56, RING_SW = 7, RING_CIRC = 2 * Math.PI * RING_R;

function HeroRing({ status, settled, total, count }) {
  const running = status === 'running';
  const done = status === 'done';
  const pct = total > 0 ? Math.min(1, settled / total) : (done ? 1 : 0);
  const accent = done ? 'var(--gb-success)' : 'var(--gb-brand-label)';
  const offset = RING_CIRC * (1 - (done ? 1 : pct));
  return (
    <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flexShrink: 0 }}>
      <div aria-hidden style={{
        position: 'absolute', inset: -10, borderRadius: '50%',
        background: `radial-gradient(circle, ${done ? 'var(--gb-success-tint-strong)' : 'var(--gb-brand-tint-strong)'} 0%, transparent 68%)`,
        opacity: running ? 0.9 : done ? 1 : 0.32, filter: 'blur(6px)',
        transition: 'opacity .5s ease, background .6s ease',
        animation: running ? 'qs-breathe 2.4s ease-in-out infinite' : 'none',
      }} />
      {running && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 250deg, var(--gb-brand-label) 340deg, transparent 360deg)',
          WebkitMask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)',
          mask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)',
          mixBlendMode: 'plus-lighter', opacity: 0.85, animation: 'qs-rotate 1.5s linear infinite',
        }} />
      )}
      <svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
        <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_R} fill="none" stroke="var(--gb-surface-3)" strokeWidth={RING_SW} />
        <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_R} fill="none" stroke={accent} strokeWidth={RING_SW} strokeLinecap="round"
          strokeDasharray={RING_CIRC} strokeDashoffset={status === 'idle' ? RING_CIRC : offset}
          style={{ transition: 'stroke-dashoffset .55s cubic-bezier(.34,1.4,.64,1), stroke .6s ease', filter: (running || done) ? `drop-shadow(0 0 5px ${accent})` : 'none', opacity: status === 'idle' ? 0 : 1 }} />
      </svg>
      {status === 'idle' && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0 78%, var(--gb-brand-tint-strong) 90%, transparent 100%)',
          WebkitMask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)',
          mask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)',
          opacity: 0.5, animation: 'qs-rotate 6s linear infinite',
        }} />
      )}
      {running && settled > 0 && (
        <span key={settled} aria-hidden style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid var(--gb-brand-label)', animation: 'qs-ripple .7s cubic-bezier(.2,.7,.3,1) forwards', pointerEvents: 'none' }} />
      )}
      {done && <QsBurst />}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 2 }}>
        <div key={status} style={{ display: 'grid', placeItems: 'center', animation: 'qs-center-in .4s cubic-bezier(.34,1.4,.64,1) both' }}>
          {status === 'idle' && (
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', letterSpacing: -1 }}>{count}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 5 }}>queued</div>
            </div>
          )}
          {running && (
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(pct * 100)}<span style={{ fontSize: 15, color: 'var(--gb-text-tertiary)' }}>%</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{settled} / {total}</div>
            </div>
          )}
          {done && (
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--gb-success-tint-medium)', color: 'var(--gb-success)', display: 'grid', placeItems: 'center', animation: 'qs-pop .5s cubic-bezier(.34,1.5,.64,1) both' }}>
              <I.check size={28} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QsBurst() {
  const N = 10;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
      {Array.from({ length: N }).map((_, i) => {
        const ang = (i / N) * Math.PI * 2, dist = 52 + (i % 3) * 8;
        const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
        const c = i % 2 === 0 ? 'var(--gb-success)' : 'var(--gb-brand-label)';
        return <span key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 5, height: 5, borderRadius: '50%', background: c, '--qs-x': `${x}px`, '--qs-y': `${y}px`, animation: `qs-burst .72s cubic-bezier(.2,.7,.3,1) ${0.04 * i}s both` }} />;
      })}
    </div>
  );
}

function NowSending({ current, delay }) {
  if (!current && delay) {
    const frac = delay.total > 0 ? delay.remaining / delay.total : 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--gb-text-tertiary)', background: 'var(--gb-fill-subtle)', flexShrink: 0 }}>{QS_CLOCK}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Pacing</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)', marginTop: 2 }}>Next send in {(delay.remaining / 1000).toFixed(1)}s</div>
          <div style={{ height: 3, borderRadius: 999, background: 'var(--gb-surface-3)', marginTop: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(1 - frac) * 100}%`, background: 'var(--gb-text-muted)', borderRadius: 999 }} />
          </div>
        </div>
      </div>
    );
  }
  const c = current || {};
  return (
    <div key={c.contactId || 'idle'} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', animation: 'qs-now-in .35s cubic-bezier(.34,1.3,.64,1) both' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-medium)', flexShrink: 0, fontFamily: 'var(--gb-font-sans)' }}>{qsInitials(c.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Now sending</span> <span style={{ display: 'inline-flex', color: 'var(--gb-brand-label)' }}><Spinner size={10} /></span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'resolving…'}</div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || ''}</div>
      </div>
    </div>
  );
}

/* One skip-rule row: a switch + title/description, with an optional trailing
   control (e.g. the days input) that only shows when the rule is on. Tints amber
   when active so it reads as "this will quietly skip contacts." */
function SkipRow({ on, onChange, title, desc, disabled, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-subtle)'), background: on ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)', transition: 'background .2s, border-color .2s' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{title}</div>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'var(--gb-text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      {on && trailing}
      <Switch on={on} onChange={onChange} disabled={disabled} size="sm" tone="warning" />
    </div>
  );
}

function CountChip({ tone, value, label }) {
  const tones = {
    success: { bg: 'var(--gb-success-tint-medium)', fg: 'var(--gb-success-fg)' },
    neutral: { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' },
    warning: { bg: 'var(--gb-warning-tint-medium)', fg: 'var(--gb-warning-fg)' },
    error: { bg: 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)' },
  }[tone] || { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: tones.bg, color: tones.fg, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', fontFamily: 'var(--gb-font-mono)' }}>
      <span key={value} style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-block', animation: 'qs-bump .3s cubic-bezier(.34,1.5,.64,1)' }}>{value}</span>
      {label}
    </span>
  );
}

const QS_ROW_H = 46;

function Trail({ trail }) {
  const rows = trail.slice().reverse().slice(0, 4);
  const innerRef = useRef(null);
  const lastLen = useRef(trail.length);
  React.useLayoutEffect(() => {
    if (trail.length > lastLen.current && innerRef.current) {
      const el = innerRef.current;
      el.style.transition = 'none';
      el.style.transform = `translateY(-${QS_ROW_H}px)`;
      void el.offsetHeight;
      el.style.transition = 'transform .36s cubic-bezier(.22,1,.36,1)';
      el.style.transform = 'translateY(0)';
    }
    lastLen.current = trail.length;
  }, [trail.length]);
  if (rows.length === 0) return null;
  return (
    <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
      <div ref={innerRef}>
        {rows.map((r, i) => <TrailRow key={r.seq} r={r} dim={i / rows.length} last={i === rows.length - 1} fresh={i === 0} />)}
      </div>
    </div>
  );
}

function TrailRow({ r, dim, last, fresh }) {
  const tone = r.status === 'sent' ? 'success' : r.status === 'skipped' ? 'warning' : 'error';
  const C = {
    success: { dot: 'var(--gb-success-tint-medium)', ic: 'var(--gb-success)', tag: 'var(--gb-success-tint-soft)', fg: 'var(--gb-success-fg)', label: 'sent', icon: <I.check size={10} /> },
    warning: { dot: 'var(--gb-warning-tint-medium)', ic: 'var(--gb-warning-fg)', tag: 'var(--gb-warning-tint-soft)', fg: 'var(--gb-warning-fg)', label: 'skip', icon: <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1 }}>–</span> },
    error:   { dot: 'var(--gb-error-tint-medium)', ic: 'var(--gb-error)', tag: 'var(--gb-error-tint-soft)', fg: 'var(--gb-error-fg)', label: 'fail', icon: <I.close size={10} /> },
  }[tone];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto', gap: 10, alignItems: 'center', height: QS_ROW_H, padding: '0 13px', borderBottom: last ? 'none' : '1px solid var(--gb-border-subtle)', opacity: 1 - dim * 0.5, animation: fresh ? 'qs-fade-in .4s ease both' : 'none' }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C.dot, color: C.ic, animation: fresh ? 'qs-pop .42s cubic-bezier(.34,1.5,.64,1) both' : 'none' }}>
        {C.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.status === 'skipped' && r.reason ? r.reason : r.email}</div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'var(--gb-font-mono)', padding: '2px 7px', borderRadius: 4, background: C.tag, color: C.fg }}>
        {C.label}
      </span>
    </div>
  );
}

function RunningView({ current, delay, counts, progress, trail }) {
  const queued = Math.max(0, progress.total - counts.sent - counts.failed - (counts.skipped || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NowSending current={current} delay={delay} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <CountChip tone="success" value={counts.sent} label="sent" />
        <CountChip tone="neutral" value={queued} label="queued" />
        {counts.skipped > 0 && <CountChip tone="warning" value={counts.skipped} label="skip" />}
        {counts.failed > 0 && <CountChip tone="error" value={counts.failed} label="fail" />}
      </div>
      <Trail trail={trail} />
    </div>
  );
}

function StatTile({ value, label, tone = 'neutral' }) {
  const fg = { success: 'var(--gb-success)', error: 'var(--gb-error)', warning: 'var(--gb-warning-fg)', brand: 'var(--gb-brand-label)', neutral: 'var(--gb-text-primary)' }[tone];
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '12px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: fg, fontFamily: 'var(--gb-font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function DoneView({ counts, trail, meta }) {
  const skipped = counts.skipped || 0;
  const attempted = counts.sent + counts.failed;
  const secs = meta.finishedAt && meta.startedAt ? (meta.finishedAt - meta.startedAt) / 1000 : 0;
  const rate = attempted > 0 ? Math.round((counts.sent / attempted) * 100) : 100;
  const mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  const timeStr = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : `${ss}s`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ textAlign: 'center', animation: 'qs-fade-in .45s ease both' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.3 }}>{counts.failed === 0 ? 'All sent' : 'Run complete'}</div>
        <div style={{ fontSize: 12, color: 'var(--gb-text-tertiary)', marginTop: 3 }}>
          {counts.sent} message{counts.sent === 1 ? '' : 's'} delivered{skipped > 0 ? ` · ${skipped} skipped` : ''}{counts.failed > 0 ? ` · ${counts.failed} need a retry` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <StatTile value={counts.sent} label="Sent" tone="success" />
        {skipped > 0 && <StatTile value={skipped} label="Skipped" tone="warning" />}
        {counts.failed > 0 && <StatTile value={counts.failed} label="Failed" tone="error" />}
        <StatTile value={`${rate}%`} label="Success" tone={counts.failed === 0 ? 'success' : 'neutral'} />
        <StatTile value={timeStr} label="Elapsed" tone="brand" />
      </div>
      <div style={{ padding: 12, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 9 }}>Send timeline</div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 30 }}>
          {trail.map((r, i) => (
            <div key={r.seq} style={{ flex: 1, minWidth: 0, borderRadius: 2, height: r.status === 'sent' ? '100%' : r.status === 'skipped' ? '70%' : '46%', background: r.status === 'sent' ? 'var(--gb-success)' : r.status === 'skipped' ? 'var(--gb-warning-fg)' : 'var(--gb-error)', opacity: 0.85, animation: `qs-grow-up .4s cubic-bezier(.34,1.3,.64,1) ${i * 0.02}s both`, transformOrigin: 'bottom' }} title={`${r.name} · ${r.status}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
