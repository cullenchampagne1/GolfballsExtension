import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, DraggablePopup, Dot, Dropdown, Field, RangeSlider, Tag, I, Spinner } from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { pickFromAddress } from '../lib/sender.js';
import { useDevSetting } from '../lib/devSettings.js';

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
  el.textContent = '.gb-email-runner-body::-webkit-scrollbar{width:0;height:0;display:none}';
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

/* Same {{var}} substitution the popup uses for single-contact sends.
   Unknown tokens pass through in their original {{form}} so the rep
   at least sees a placeholder is missing rather than getting silent
   blanks in their outbound email. */
const renderStr = (str, vars) => {
  if (!str) return '';
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) => vars?.[k] ?? `{{${k}}}`);
};

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

  /* Dropdown option shape — ported from popup.jsx. Templates with
     variations expose an inline-expanding parent + sub-options.
     Three modes per template:

       Random per contact   id = t.id (no ::)         selectedVariationId = null
       Original             id = t.id::__original     selectedVariationId = '__original'
       Variation X          id = t.id::<v.id>         selectedVariationId = '<v.id>'

     Picking the parent ROW in the open picker expands it (Dropdown
     component behavior) — it doesn't pick. To send "just the
     original template, no random pick" the user picks the
     explicit Original sub-option. */
  const dropdownOptions = useMemo(() => templates.map((t) => {
    const variations = Array.isArray(t.variations) ? t.variations : [];
    const subOptions = variations.length > 0 ? [
      /* Brand accent on Random so it's visually distinct from the
         specific picks below — it's the default mode, not just
         another item in the list. */
      { id: t.id, label: 'Random per contact', accent: 'brand' },
      { id: `${t.id}::${ORIGINAL_PIN}`, label: 'Original (no variation)' },
      ...variations.map((v) => ({
        id: `${t.id}::${v.id}`,
        label: v.label || 'Variation',
      })),
    ] : undefined;
    return {
      id: t.id,
      label: t.name || 'Untitled',
      sub: variations.length ? `${variations.length} variation${variations.length === 1 ? '' : 's'}` : null,
      subOptions,
    };
  }), [templates]);

  /* Composite id when a variation is pinned so the dropdown's active
     row lands on the chosen sub-option. */
  const dropdownValue = selectedVariationId
    ? `${selectedId}::${selectedVariationId}`
    : selectedId;
  const selectedTpl = templates.find((t) => t.id === selectedId);
  /* True when the selected template has variations AND no specific
     one is pinned — the bulk loop will randomly pick a variation
     per contact using `variationWeights` below. Drives both the
     dropdown label suffix and the sliders section's visibility. */
  const isRandomMode = !!selectedTpl
    && Array.isArray(selectedTpl.variations) && selectedTpl.variations.length > 0
    && !selectedVariationId;
  const dropdownDisplayLabel = (() => {
    if (!selectedTpl) return '';
    const baseName = selectedTpl.name || 'Untitled';
    if (selectedVariationId === ORIGINAL_PIN) return `${baseName} · Original`;
    if (selectedVariationId) {
      const v = (selectedTpl.variations || []).find((x) => x.id === selectedVariationId);
      return `${baseName} · ${v?.label || 'Variation'}`;
    }
    /* No pin — if the template has variations, the picker defaulted
       to Random; surface that in the header so the user can tell
       what the bulk loop will do without re-opening the picker. */
    if (isRandomMode) return `${baseName} · Random`;
    return baseName;
  })();

  /* Initialize variation weights to an equal split when the
     template's variation set changes. We preserve user-tuned weights
     across unrelated re-renders by checking whether the current key
     set already matches the template's variation ids — that lets
     reps tweak the sliders without losing their balance on every
     state update. */
  useEffect(() => {
    const variations = Array.isArray(selectedTpl?.variations) ? selectedTpl.variations : [];
    if (variations.length === 0) {
      setVariationWeights((cur) => (Object.keys(cur).length === 0 ? cur : {}));
      return;
    }
    setVariationWeights((cur) => {
      const ids = variations.map((v) => v.id);
      const sameSet = ids.length === Object.keys(cur).length && ids.every((id) => id in cur);
      if (sameSet) return cur;
      const equal = 100 / ids.length;
      return Object.fromEntries(ids.map((id) => [id, equal]));
    });
  }, [selectedId, selectedTpl]);

  /* Drag handler — A goes to `raw`, the rest split the remainder
     in proportion to their CURRENT values (relative balance among
     them is preserved). When the others sum to zero (everyone was
     at 0) we fall back to an equal split so the bar moves
     predictably instead of getting stuck. */
  const onWeightChange = (targetId, raw) => {
    if (!selectedTpl) return;
    const variations = Array.isArray(selectedTpl.variations) ? selectedTpl.variations : [];
    const clamped = Math.max(0, Math.min(100, Number(raw) || 0));
    const others = variations.filter((v) => v.id !== targetId).map((v) => v.id);
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

  const onDropdownChange = (id) => {
    if (typeof id === 'string' && id.includes('::')) {
      const [parentId, variationId] = id.split('::');
      setSelectedId(parentId);
      setSelectedVariationId(variationId);
      return;
    }
    setSelectedId(String(id || ''));
    setSelectedVariationId(null);
  };

  const canRun = !!selectedTpl && contacts.length > 0 && status !== 'running';

  const onRun = async () => {
    if (!canRun) return;
    if (!paUrl) {
      toast?.error?.('Power Automate URL not set in Settings — enable PA to send.');
      return;
    }
    /* Reset row UI on the parent list, bump the run token (older
       in-flight loops will see the mismatch and bail before their
       next iteration), and kick off a fresh local orchestrator. */
    onResetRowStates?.();
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
        /* Random mode rolls a fresh variation per contact using the
           rep's slider weights. Equal weights → uniform random;
           skewed weights → that distribution. ORIGINAL_PIN sends the
           bare template (no variation), pinnedV sends one specific
           variation to everyone. */
        const v = selectedVariationId === ORIGINAL_PIN
          ? null
          : pinnedV || (variations.length ? pickWeighted(variations, variationWeights) : null);
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
        const next = [...cur, { name: displayName, status: outcome.status, email: outcome.email }];
        // Cap to last 4 so the list never grows past the rendered slot
        // height — also kills the panel scrollbar.
        return next.length > 4 ? next.slice(next.length - 4) : next;
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
                if (selectedVariationId) {
                  /* User picked a specific variation in the dropdown
                     — every contact gets that one. */
                  return 'Only this variation will send to every contact';
                }
                /* Parent template selected — bulk loop picks a random
                   variation per contact. The hint nudges the user
                   that the dropdown can be opened to pin one. */
                return `Click the dropdown and pick a variation to send only that one${
                  variationCount === 1 ? '' : ` (1 of ${variationCount})`
                }`;
              })()}
            >
              {/* Match the popup.js template picker exactly: size sm
                  (28px row), brand-glow dot for leading indicator,
                  searchable only when the list is meaningfully long,
                  and the 280px ceiling for the open menu so it
                  doesn't dominate a small panel. */}
              <Dropdown
                size="sm"
                value={dropdownValue}
                displayLabel={dropdownDisplayLabel}
                onChange={onDropdownChange}
                options={dropdownOptions}
                placeholder={templates.length ? 'Pick a template' : 'No templates'}
                searchable={templates.length > 6}
                leading={<Dot tone={selectedTpl ? 'brand' : 'muted'} size={7} glow={!!selectedTpl} />}
                disabled={status === 'running'}
                maxHeight={280}
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
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: 10,
                      background: 'var(--gb-surface-1)',
                      border: '1px solid var(--gb-border-subtle)',
                      borderRadius: 'var(--gb-r-sm)',
                    }}>
                      {(selectedTpl.variations || []).map((v, idx) => (
                        <motion.div
                          key={v.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.2 }}
                        >
                          <VariationWeightRow
                            label={v.label || `Variation ${idx + 1}`}
                            value={variationWeights[v.id] || 0}
                            onChange={(val) => onWeightChange(v.id, val)}
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

            {/* Aggregate progress only — per-row status (spinner /
                sent / fail) is rendered on the parent list via the
                onRowStart / onRowDone callbacks, matching the Quick
                Actions UX. Listing each contact in the panel itself
                would get unwieldy fast on a 100-row blast. */}
            {status !== 'idle' && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: 12,
                background: 'var(--gb-surface-1)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {status === 'running' ? <Spinner size={12} /> : <I.check size={12} />}
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>
                    {status === 'running'
                      ? `Sending ${progress.current} of ${progress.total}…`
                      : `Done — ${sentCount} sent${failedCount ? `, ${failedCount} failed` : ''}`}
                  </div>
                </div>
                <div style={{
                  height: 4, borderRadius: 999,
                  background: 'var(--gb-surface-2)', overflow: 'hidden',
                }}>
                  <motion.div
                    animate={{ width: progress.total
                      ? `${Math.min(100, (progress.current / progress.total) * 100)}%`
                      : '0%' }}
                    transition={{ duration: 0.3 }}
                    style={{ height: '100%', background: 'var(--gb-brand-fg)' }}
                  />
                </div>
                {/* Last-4 trail. Capped so the panel doesn't need to
                    scroll. AnimatePresence + layout makes new entries
                    slide in and old ones slide off the top smoothly. */}
                {trail.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <AnimatePresence initial={false}>
                      {trail.map((r, i) => (
                        <motion.div
                          key={`${r.name}-${i}-${r.email || ''}`}
                          layout
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10, height: 0 }}
                          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 10.5, color: 'var(--gb-text-secondary)',
                          }}
                        >
                          <Tag size="xs" tone={r.status === 'sent' ? 'brand' : 'error'}>
                            {r.status === 'sent' ? 'sent' : 'fail'}
                          </Tag>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
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
            <Btn size="sm" variant="secondary" onClick={onClose} disabled={status === 'running'}>
              {status === 'done' ? 'Close' : 'Cancel'}
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
function VariationWeightRow({ label, value, onChange, disabled }) {
  const rounded = Math.round(value);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) 36px',
      gap: 10,
      alignItems: 'center',
    }}>
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
