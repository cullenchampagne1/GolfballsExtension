import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, DraggablePopup, Dot, Field, RangeSlider, Tag, TemplatePicker, I, Spinner } from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { pickFromAddress } from '../lib/sender.js';
import { useDevSetting } from '../lib/devSettings.js';
import { renderTemplate } from '../lib/variableResolution.js';

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
const PANEL_H = 480;

/* Hide the inner body scrollbar in WebKit too — scrollbar-width:none
   handles Firefox. Injected once at first EmailRunner mount. */
const SCROLLBAR_STYLE_ID = '__gb-email-runner-noscroll';
function ensureNoScrollStyle() {
  if (typeof document === 'undefined' || document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SCROLLBAR_STYLE_ID;
  el.textContent = `
    .gb-email-runner-body::-webkit-scrollbar { width: 0; height: 0; display: none; }
    /* Sweeping scan light on the run-status card while a blast is
       in flight. The animation is global because a CSS animation
       can't be expressed inline via Motion without a child component
       eating every frame. */
    @keyframes gb-er-scan {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
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

/* Delegates to the shared renderer so OR-blocks (`{{a|b}}`) and
   conditional drop-out behave identically to the popup's
   single-contact path. Unknown / fully-unresolved tokens still pass
   through as `{{...}}` so the rep notices missing data instead of
   silently sending blanks. */
const renderStr = (str, vars) => renderTemplate(str, vars);

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
  const [status, setStatus] = useState('idle');  // 'idle' | 'running' | 'done'
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [counts, setCounts] = useState({ sent: 0, failed: 0 });
  /* Per-row tail shown inside the panel — last 4 names with status
     badges. Kept short on purpose; the full per-row truth lives on
     the parent list (CRMSearch / TaskList) via the row callbacks. */
  const [trail, setTrail] = useState([]); // [{ name, status, email? }]
  const [paUrl, setPaUrl] = useState('');
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
      });
    } catch {}
  }, [open, useMock]);

  /* Cancel in-flight run when the panel closes — bumps the token so
     the orchestrator's between-iteration guard short-circuits, and
     drops the running-state signal so the parent list's scan beam
     fades out instead of staying stuck on the last sending row. */
  useEffect(() => {
    if (!open) {
      runTokenRef.current += 1;
      onRunStateChange?.(false);
    }
  }, [open, onRunStateChange]);

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
      { id: ORIGINAL_PIN, label: 'Variation 1', variation: null },
      ...variations.map((v, i) => ({
        id: v.id,
        label: v.label || `Variation ${i + 2}`,
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

  /* Drag handler — A goes to `raw`, the rest split the remainder
     in proportion to their CURRENT values (relative balance among
     them is preserved). When the others sum to zero (everyone was
     at 0) we fall back to an equal split so the bar moves
     predictably instead of getting stuck. */
  const onWeightChange = (targetId, raw) => {
    const clamped = Math.max(0, Math.min(100, Number(raw) || 0));
    const others = weightableItems.filter((it) => it.id !== targetId).map((it) => it.id);
    if (others.length === 0) {
      setVariationWeights({ [targetId]: 100 });
      return;
    }
    setVariationWeights((cur) => {
      const oldOthersSum = others.reduce((s, id) => s + (cur[id] || 0), 0);
      const remainder = 100 - clamped;
      const next = { [targetId]: clamped };
      if (oldOthersSum <= 0) {
        const each = remainder / others.length;
        for (const id of others) next[id] = each;
      } else {
        for (const id of others) next[id] = remainder * ((cur[id] || 0) / oldOthersSum);
      }
      return next;
    });
  };

  const canRun = !!selectedTpl && contacts.length > 0 && status !== 'running';

  const onRun = async () => {
    if (!canRun) return;
    if (!paUrl) {
      toast?.error?.('Power Automate URL not set in Settings — enable PA to send.');
      return;
    }
    /* Reset row UI on the parent list, mark every contact in the
       blast as queued so the row badges flip from new → queued
       immediately, then bump the run token and kick off the loop.
       The per-row onRowStart that runs inside the loop will then
       transition each queued row to sending in turn. */
    onResetRowStates?.();
    onRowsQueued?.(contacts.map((c) => c.contactId));
    runTokenRef.current += 1;
    const token = runTokenRef.current;
    setCounts({ sent: 0, failed: 0 });
    setProgress({ current: 0, total: contacts.length });
    setTrail([]);
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

    for (let i = 0; i < contacts.length; i++) {
      if (runTokenRef.current !== token) return; // cancelled
      const c = contacts[i];
      setProgress({ current: i + 1, total: contacts.length });
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

        // 1. Fetch the contact page HTML through the background proxy.
        const fetched = await dispatchBg({ action: 'fetchRaw', url: c.contactUrl });
        if (!fetched) {
          /* sendBg resolved null — most likely chrome.runtime.lastError
             ("Could not establish connection. Receiving end does not
             exist."). Surface that explicitly so the row badge tells
             the user what to debug rather than a generic "Fetch failed". */
          throw new Error('Background not reachable (extension reloaded?)');
        }
        if (!fetched.ok || typeof fetched.text !== 'string') {
          throw new Error(fetched.error || `Fetch failed (HTTP ${fetched.status || '?'})`);
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
        const directResolve = useMock ? null : window.__gbResolveVarsForHtml;
        const resolved = directResolve
          ? await directResolve(fetched.text, tplVars, tplToField)
          : await dispatchBg({
              action:  'resolveVarsForHtml',
              html:    fetched.text,
              vars:    tplVars,
              toField: tplToField,
            });
        const resolvedVars = resolved?.resolved || {};
        const toEmail      = resolved?.toEmail  || '';
        /* The resolver pulls contact.firstName + lastName off the
           fetched page via the schema engine and ships it as
           displayName. We prefer that over the caller-supplied
           contactName because the page is the source of truth — if
           the row came from an account-page list with no contact
           text, this still produces a real name for the trail. */
        const pageName = (resolved?.displayName || '').trim();
        if (resolved?.error) {
          /* Bubble the resolver's own message up so a parse / engine
             failure shows the cause instead of "No recipient email". */
          outcome = { status: 'error', error: `Resolve failed: ${resolved.error}`, name: pageName };
        } else if (!toEmail) {
          outcome = { status: 'error', error: 'No recipient email resolved', name: pageName };
        } else {
          // 3. Render template strings.
          const subject  = renderStr(rawSubject, resolvedVars);
          // Signature is appended by the existing paAutomate path in
          // vanilla/main.js's sendViaPA handler — we go direct to
          // paAutomate here, so append it ourselves to match.
          const signature = await readSignature();
          const htmlBody  = renderStr(rawBody, resolvedVars)
                          + (signature ? '<br><div>' + signature + '</div>' : '');

          /* 4. Send via Power Automate.
             `from` resolves per-row: when the template has
             senderRandomize=true, pickFromAddress fires a fresh
             random pick for each contact so a 50-row blast varies
             between the configured senders. The local part comes
             from the rep's devSetting so the rest of the address
             ends up like cullen@golfballs.com. */
          const from = pickFromAddress(selectedTpl, emailLocalPart);
          const paPayload = {
            emails: [{ from, to: toEmail, subject, htmlBody, replyMode }],
          };
          /* Eyes-on log so the rep can copy the EXACT payload going
             to PA and compare against the popup's network call.
             Helps diagnose flow-side rejections like "Failed to
             send standalone email" — usually a from/to/replyMode
             mismatch the flow validates against. Remove once the
             bulk path matches the popup path 1:1. */
          // eslint-disable-next-line no-console
          console.log('[gb] EmailRunner → paAutomate payload:', paPayload);
          const send = await dispatchBg({
            action: 'paAutomate',
            paUrl,
            payload: paPayload,
          });
          // eslint-disable-next-line no-console
          console.log('[gb] EmailRunner ← paAutomate response:', send);
          if (send?.ok) {
            outcome = { status: 'sent', email: toEmail, name: pageName };
          } else {
            outcome = { status: 'error', error: send?.error || 'PA send failed', email: toEmail, name: pageName };
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
        }];
        /* Keep a short buffer for the count chips upstream — the
           render slice below caps the visible window at 2. */
        return next.length > 8 ? next.slice(next.length - 8) : next;
      });

      // 5. Random delay between sends — skip after the last one.
      if (i < contacts.length - 1) {
        const ms = (lo + Math.random() * (hi - lo)) * 1000;
        const wait = await new Promise((res) => setTimeout(() => res(true), ms));
        if (runTokenRef.current !== token) return;
      }
    }

    setStatus('done');
    onRunStateChange?.(false);
  };

  const sentCount   = counts.sent;
  const failedCount = counts.failed;
  const variationCount = selectedTpl?.variations?.length || 0;

  return (
    <DraggablePopup
      open={open}
      onClose={onClose}
      anchorHostId={anchorHostId}
      cursorAnchor={cursor}
      width={PANEL_W}
      maxHeight={PANEL_H}
      icon={<I.mail size={13} />}
      title="Email selected"
      subtitle={`${contacts.length} contact${contacts.length === 1 ? '' : 's'} queued`}
      closeDisabled={status === 'running'}
      enterFrom="right"
    >
      {/* Body */}
          <div
            className="gb-email-runner-body"
            style={{
              padding: '14px',
              display: 'flex', flexDirection: 'column', gap: 14,
              overflow: 'auto', flex: 1, minHeight: 0,
              userSelect: 'auto',
              WebkitUserSelect: 'auto',
              // Hide the scrollbar visually — the body needs to scroll
              // when progress + trail expand beyond the panel cap, but
              // a visible bar inside this small panel reads as
              // clutter. ::-webkit-scrollbar rule is injected on mount
              // below.
              scrollbarWidth: 'none',
            }}
          >
            <Field
              label="Template"
              hint={(() => {
                if (!templates.length) return 'No email templates saved yet';
                if (variationCount === 0) return null;
                /* Variation pinning moved to the weights panel below
                   (set a variation to 100% to lock it). The hint here
                   nudges that there's a meaningful pool to balance. */
                return `Each contact gets a weighted random pick (1 of ${variationCount + 1} variations)`;
              })()}
            >
              {/* TemplatePicker (shared with popup.jsx). mode='random'
                  flags the parent click as "weighted random across the
                  pool" so the right-edge state badge shows a shuffle
                  glyph when variations exist. Picking a sub-row pins
                  that variation (`${tplId}::${varId}`) and the
                  orchestrator's pinnedV branch short-circuits the
                  weighted pick. */}
              <TemplatePicker
                mode="random"
                templates={templates}
                value={dropdownValue}
                onChange={onTemplatePickerChange}
                placeholder={templates.length ? 'Pick a template' : 'No templates'}
                disabled={status === 'running'}
              />
            </Field>

            {/* Variation weights — only renders in Random mode.
                Sliders animate in one-by-one; dragging one redistributes
                the remainder across the others so the total stays at
                100%. The orchestrator's per-row pick uses these
                weights via pickWeighted(). */}
            <AnimatePresence initial={false}>
              {isRandomMode && (
                <motion.div
                  key="variation-weights"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <Field
                    label="Variation weights"
                    hint="Sliders always sum to 100% — each contact gets a roll weighted by these."
                  >
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 10,
                      padding: 12,
                      background: 'var(--gb-surface-1)',
                      border: '1px solid var(--gb-border-subtle)',
                      borderRadius: 'var(--gb-r-md)',
                    }}>
                      {/* Stacked proportion bar — the visual fold-up of
                          every slider. Tints step down per item so the
                          eye can read which slot owns which segment.
                          Widths tween on weight change so the bar
                          breathes with the user's edits. */}
                      <div style={{
                        display: 'flex',
                        height: 10, borderRadius: 999, overflow: 'hidden',
                        border: '1px solid var(--gb-border-subtle)',
                      }}>
                        {weightableItems.map((it, idx) => (
                          <motion.div
                            key={it.id}
                            animate={{ flex: variationWeights[it.id] || 0.0001 }}
                            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                            style={{
                              background: weightStripeColor(idx),
                              minWidth: 0,
                            }}
                            title={`${it.label}: ${Math.round(variationWeights[it.id] || 0)}%`}
                          />
                        ))}
                      </div>
                      {weightableItems.map((it, idx) => (
                        <motion.div
                          key={it.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.2 }}
                        >
                          <VariationWeightRow
                            colorIndex={idx}
                            label={it.label}
                            value={variationWeights[it.id] || 0}
                            onChange={(val) => onWeightChange(it.id, val)}
                            disabled={status === 'running'}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Delay between sends" hint={`${fmtSeconds(delay[0])}–${fmtSeconds(delay[1])} (random per contact)`}>
              <RangeSlider
                values={delay}
                min={5}
                max={80}
                step={5}
                unit="s"
                onChange={(next) => setDelay(next)}
                disabled={status === 'running'}
              />
            </Field>

            {/* Run progress card. While running, the rep sees a radial
                progress, the current recipient, a sweeping scan light,
                and live count chips. The trail collapses to status-
                tagged rows. When the run finishes, the card swaps to a
                "Done" state with the final counts. */}
            {status !== 'idle' && (
              <RunStatusCard
                status={status}
                progress={progress}
                sentCount={sentCount}
                failedCount={failedCount}
                trail={trail}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-surface-1)',
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <Btn
              size="sm"
              variant={status === 'running' ? 'tinted' : 'secondary'}
              status={status === 'running' ? 'error' : undefined}
              icon={status === 'running' ? <StopIcon size={11} /> : undefined}
              onClick={() => {
                if (status === 'running') {
                  /* Mid-run cancel — bumping the token short-circuits
                     the orchestrator's between-iteration guard so it
                     returns out of the for-loop without sending the
                     remaining contacts. We also flip status to 'done'
                     and signal run-state false so the parent list's
                     scan beam fades out. The panel stays open with
                     the trail intact so the rep sees what HAD sent
                     before they pulled the brake. */
                  runTokenRef.current += 1;
                  setStatus('done');
                  onRunStateChange?.(false);
                  return;
                }
                onClose?.();
              }}
            >
              {status === 'running' ? 'Cancel run' : status === 'done' ? 'Close' : 'Cancel'}
            </Btn>
            <div style={{ flex: 1 }} />
            <Btn
              size="sm"
              variant="tinted"
              status="brand"
              icon={status === 'running' ? <Spinner size={11} /> : <I.send size={11} />}
              onClick={onRun}
              disabled={!canRun}
            >
              {status === 'running'
                ? 'Sending…'
                : status === 'done'
                  ? 'Send again'
                  : `Run · ${contacts.length}`}
            </Btn>
          </div>
    </DraggablePopup>
  );
}

/* One row in the Random-mode weights panel: variation label,
   horizontal range slider, percentage readout. `accent-color`
   tints the native range thumb + track so the control reads
   brand without a custom thumb implementation — the rounded
   numeric on the right is what the rep watches when balancing
   the split. */
function VariationWeightRow({ colorIndex = 0, label, value, onChange, disabled }) {
  const rounded = Math.round(value);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '10px minmax(0, 1fr) minmax(0, 1.4fr) 36px',
      gap: 10,
      alignItems: 'center',
    }}>
      {/* Color swatch — matches the corresponding segment in the
          stacked proportion bar above so the rep can map the slider
          back to the bar without reading the label. */}
      <div style={{
        width: 8, height: 8, borderRadius: 2,
        background: weightStripeColor(colorIndex),
      }} />
      <div style={{
        fontSize: 11,
        color: 'var(--gb-text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={rounded}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{
          width: '100%',
          accentColor: 'var(--gb-brand-fg)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--gb-text-primary)',
        textAlign: 'right',
      }}>{rounded}%</div>
    </div>
  );
}

/* Map a per-row index to a tint of the brand color. First row gets
   the full brand label color; subsequent rows step down by ~40% per
   index so a 4-variation pool still reads as distinct stripes. */
function weightStripeColor(idx) {
  const pcts = [100, 60, 30, 18, 12, 8];
  const pct = pcts[idx] ?? Math.max(6, 100 - idx * 18);
  return pct === 100
    ? 'var(--gb-brand-label)'
    : `color-mix(in srgb, var(--gb-brand-label) ${pct}%, transparent)`;
}

/* ────────────────────────────────────────────────────────────
   RunStatusCard — running / done state UI

   While `status === 'running'`:
     • Radial progress (stroke-dashoffset tween) — central glance
     • "Now sending" — name + email of the most recent trail entry
     • Count chips: sent · queued · fail
     • Sweeping scan-light overlay so the card reads as alive
     • Trail list — each row a status-tagged entry (sent / fail)

   When `status === 'done'`:
     • Radial fills to 100% in success tone
     • Header switches to "Done — N sent" so the card stays useful
       through the post-send glance before the rep closes the panel
─────────────────────────────────────────────────────────────── */
function RunStatusCard({ status, progress, sentCount, failedCount, trail }) {
  const total = progress.total || 0;
  const settled = sentCount + failedCount;
  const pct = total > 0 ? Math.min(1, settled / total) : (status === 'done' ? 1 : 0);
  const queued = Math.max(0, total - settled);
  const isRunning = status === 'running';
  const current = trail[trail.length - 1] || null;

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: 14, borderRadius: 'var(--gb-r-md)',
      background: 'linear-gradient(180deg, var(--gb-surface-1) 0%, var(--gb-surface-modal, var(--gb-surface-2)) 100%)',
      border: '1px solid ' + (isRunning ? 'var(--gb-brand-tint-border)' : 'var(--gb-success-tint-border)'),
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
        <RadialProgress pct={pct} tone={isRunning ? 'brand' : 'success'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: isRunning ? 'var(--gb-brand-label)' : 'var(--gb-success-fg)',
          }}>{isRunning ? 'Now sending' : `Done · ${sentCount} sent`}</div>
          {isRunning && current ? (
            <motion.div
              key={current.name + (current.email || '')}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: 'var(--gb-text-primary)',
                marginTop: 3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{current.name || '(resolving…)'}</div>
              {current.email && (
                <div style={{
                  fontSize: 10.5, color: 'var(--gb-text-muted)',
                  fontFamily: 'var(--gb-font-mono)',
                  marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{current.email}</div>
              )}
            </motion.div>
          ) : !isRunning ? (
            <div style={{
              fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 3,
            }}>
              {failedCount > 0
                ? `${sentCount} sent · ${failedCount} failed`
                : `${sentCount} of ${total} delivered`}
            </div>
          ) : (
            <div style={{
              fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 3,
              fontStyle: 'italic',
            }}>preparing first contact…</div>
          )}
          <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
            <CountChip tone="success" value={sentCount} label="sent" />
            <CountChip tone="neutral" value={queued} label="queued" />
            {failedCount > 0 && (
              <CountChip tone="error" value={failedCount} label="fail" />
            )}
          </div>
        </div>
      </div>

      {/* Sweeping scan light — only while running. Pure decorative;
          pointer-events disabled so it never eats a click. */}
      {isRunning && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, var(--gb-brand-tint-soft) 50%, transparent 100%)',
            mixBlendMode: 'plus-lighter',
            pointerEvents: 'none',
            animation: 'gb-er-scan 2.4s linear infinite',
          }}
        />
      )}

      {/* Trail — shows the latest two completed sends. Each row
          slides UP into place: the newest enters from below the
          card (y: +rowHeight → 0), the previous one layout-shifts
          up to make room, and the oldest exits by sliding up
          above the card (y: 0 → -rowHeight, fades out). The
          card's overflow:hidden clips entering + exiting rows so
          the animation reads as a single continuous scroll
          rather than items popping in/out. mode="popLayout"
          removes exiting items from layout flow immediately so
          the remaining row's layout shift starts at the same
          frame as the new row's enter. */}
      {trail.length > 0 && (
        <div style={{
          background: 'var(--gb-surface-2)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-sm)',
          overflow: 'hidden',
          position: 'relative', zIndex: 1,
        }}>
          <AnimatePresence initial={false} mode="popLayout">
            {trail.slice(-2).map((r, i, arr) => (
              <motion.div
                key={r.seq}
                layout
                initial={{ opacity: 0, y: 36 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -36 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto',
                  gap: 10, alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
                }}
              >
                <TrailIcon status={r.status} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    color: 'var(--gb-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.name || '(unknown)'}</div>
                  {r.email && (
                    <div style={{
                      fontSize: 9.5, color: 'var(--gb-text-muted)',
                      fontFamily: 'var(--gb-font-mono)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.email}</div>
                  )}
                </div>
                <Tag size="xs" tone={r.status === 'sent' ? 'success' : 'error'} mono>
                  {r.status === 'sent' ? 'sent' : 'fail'}
                </Tag>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* SVG radial progress with stroke-dashoffset tween. Centered % readout.
   Tone switches the stroke + glow color so done states feel resolved. */
function RadialProgress({ pct, tone = 'brand' }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const stroke = tone === 'success' ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)';
  return (
    <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
      <svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={28} cy={28} r={r} fill="none"
          stroke="var(--gb-surface-2)" strokeWidth={4} />
        <motion.circle
          cx={28} cy={28} r={r} fill="none"
          stroke={stroke}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800,
        fontFamily: 'var(--gb-font-mono)',
        color: 'var(--gb-text-primary)',
      }}>{Math.round(pct * 100)}%</div>
    </div>
  );
}

function CountChip({ tone, value, label }) {
  const tones = {
    success: { bg: 'var(--gb-success-tint-medium)', fg: 'var(--gb-success-fg)' },
    neutral: { bg: 'var(--gb-fill-subtle)',         fg: 'var(--gb-text-tertiary)' },
    error:   { bg: 'var(--gb-error-tint-medium)',   fg: 'var(--gb-error-fg)' },
  }[tone] || { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 6px', borderRadius: 4,
      background: tones.bg, color: tones.fg,
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase',
      fontFamily: 'var(--gb-font-mono)',
    }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {label}
    </span>
  );
}


/* Status icon for a single trail row: filled success disc with a
   check for sent, error disc with X for fail. Mirrors the design's
   gb-bounce-in entrance. */
function TrailIcon({ status }) {
  const isSent = status === 'sent';
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.34, 1.3, 0.64, 1] }}
      style={{
        width: 16, height: 16, borderRadius: '50%',
        background: isSent ? 'var(--gb-success-tint-medium)' : 'var(--gb-error-tint-medium)',
        color: isSent ? 'var(--gb-success-fg)' : 'var(--gb-error-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {isSent ? (
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
    </motion.div>
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
