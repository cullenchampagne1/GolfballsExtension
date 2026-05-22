// popup.js

let currentTab    = null;
let templates     = [];
let selectedId    = null;
let resolvedVars  = {};
let resolvedTo    = '';
let dropdownOpen  = false;
let pageInfo      = {};
let capturedAmount = 0;
let apiOrderTotal  = 0;

// ── Watch List State ──────────────────────────────────────────────────────────
let watchList = [];
let _wlPendingOrderId   = '';
let _wlPendingOrderUrl  = '';
let _wlPendingEntityType = 'order'; // 'order' | 'contact' | 'account'

// SVG inner-path markup for each entity type, used to swap modal icons
const _WL_ENTITY_SVG = {
  order:   `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
  contact: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  account: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
};
const _WL_ENTITY_LABELS = {
  order:   { btn: 'Watch Order',   title: 'Watch Order',   field: 'Order #',      placeholder: 'What needs attention on this order?' },
  contact: { btn: 'Watch Contact', title: 'Watch Contact', field: 'Contact ID',   placeholder: 'What needs attention for this contact?' },
  account: { btn: 'Watch Account', title: 'Watch Account', field: 'Account ID',   placeholder: 'What needs attention for this account?' },
};

const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

// Drop sentences containing unresolved variables that opted in to
// smart.conditional, so an empty placeholder doesn't leak into the output.
// Mirrors `dropConditional` in content/variable-resolution.js — duplicated
// here because popup.js runs in a separate context from the content scripts.
function _dropConditional(text, defs, resolved) {
  if (!text || !defs) return text || '';
  let out = String(text);
  for (const [name, def] of Object.entries(defs)) {
    const smart = def && def.smart;
    if (!smart || !smart.conditional) continue;
    const val = resolved ? resolved[name] : '';
    if (val != null && String(val).length > 0) continue;
    const placeholder = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scope = smart.conditionalScope || 'sentence';
    let rx;
    if (scope === 'paragraph') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*(\\n\\n|\\n?$)`, 'g');
    } else if (scope === 'line') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*\\n?`, 'g');
    } else {
      rx = new RegExp(`[^.!?\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^.!?\\n]*[.!?]?\\s*`, 'g');
    }
    out = out.replace(rx, '');
  }
  return out;
}

function renderStr(str, vars, defs) {
  const text = defs ? _dropConditional(str, defs, vars) : (str || '');
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
function buildMailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ADD THIS FUNCTION
function toPlainText(html) {
  if (!html) return '';

  // 1. Drop trailing <br> inside </p> — editors inject these as cursor anchors,
  //    and without this they stack with the </p> newline to produce triple line breaks.
  let text = html.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');

  // 2. Replace block endings with Carriage Return + Line Feed (what Outlook expects)
  text = text.replace(/<br\s*\/?>/gi, '\r\n')
             .replace(/<\/p>/gi, '\r\n\r\n')
             .replace(/<\/li>/gi, '\r\n')
             .replace(/<\/[ou]l>/gi, '\r\n');

  // 3. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 4. Decode HTML entities (e.g., &nbsp; → space, &amp; → &)
  const decoder = document.createElement('textarea');
  decoder.innerHTML = text;

  // 5. Collapse any leftover runs of 3+ newlines and trim
  return decoder.value.replace(/(\r\n|\n){3,}/g, '\r\n\r\n').trim();
}

// ── Custom dropdown ───────────────────────────────────────────────────────────

function buildDropdown(templates, matchedIds) {
  const menu = $('dropdown-menu');
  menu.innerHTML = '';
  const sorted = [
    ...templates.filter(t =>  matchedIds.includes(t.id)),
    ...templates.filter(t => !matchedIds.includes(t.id))
  ];
  sorted.forEach(t => {
    const matched = matchedIds.includes(t.id);
    const opt = document.createElement('div');
    opt.className = 'dropdown-option' + (t.id === selectedId ? ' selected' : '');
    opt.dataset.id = t.id;
    opt.innerHTML = `
      <span class="match-dot ${matched ? 'green' : 'gray'}"></span>
      <span class="opt-name">${t.name || 'Untitled'}</span>
      ${matched ? '<span class="opt-matched-label">matched</span>' : ''}
    `;
    opt.addEventListener('click', () => { selectTemplate(t.id, matchedIds); closeDropdown(); });
    menu.appendChild(opt);
  });
}

function updateDropdownBtn(id, matchedIds) {
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;
  const matched = matchedIds.includes(id);
  $('active-dot').className = 'match-dot ' + (matched ? 'green' : 'gray');
  $('active-label').textContent = tpl.name || 'Untitled';
}

function openDropdown()  { $('dropdown-btn').classList.add('open'); $('dropdown-menu').classList.add('open'); dropdownOpen = true; }
function closeDropdown() { $('dropdown-btn').classList.remove('open'); $('dropdown-menu').classList.remove('open'); dropdownOpen = false; }

$('dropdown-btn').addEventListener('click', () => dropdownOpen ? closeDropdown() : openDropdown());
document.addEventListener('click', (e) => { if (!$('dropdown-wrap').contains(e.target)) closeDropdown(); });

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  await chrome.storage.local.set({ orderTabId: currentTab.id });

  const data = await chrome.storage.local.get(['templates', 'watchList', 'featureFlags']);
  // Load ALL enabled non-case templates; we filter by pageType later in renderMain
  // so the same array is available regardless of what page we're on.
  const allTemplates = (data.templates || []).filter(t => t.enabled !== false && t.type !== 'case');
  templates = allTemplates; // may be narrowed in renderMain once pageType is known
  watchList = data.watchList || [];
  const flags = { watchListEnabled: true, ...(data.featureFlags || {}) };
  renderWatchBadge();

  // Gate watch list UI
  const watchRow = document.querySelector('.btn-row-watch');
  if (watchRow) watchRow.style.display = flags.watchListEnabled ? '' : 'none';

  if (allTemplates.length === 0) {
    hide('view-loading');
    show('view-empty');
    return;
  }

  // Probe whether all content scripts are fully live in this tab.
  // Checks both the ready flag (set by main.js) AND the existence of the
  // watchlist function (from watchlist-modal.js) to catch any partial-load
  // scenarios where main.js ran but a dependency script failed.
  chrome.scripting.executeScript(
    { target: { tabId: currentTab.id },
      func: () => !!window.__gbContentReady && typeof __gbShowWatchListModal === 'function' },
    (probeResults) => {
      if (chrome.runtime.lastError) { /* tab not scriptable — will try inject */ }
      const alreadyLoaded = probeResults?.[0]?.result === true;

      const sendGetPageInfo = () => {
        chrome.tabs.sendMessage(currentTab.id, {
          action: 'getPageInfo',
          templates: templates.map(t => ({ id: t.id, rules: t.rules, type: t.type, accountConditions: t.accountConditions || [] }))
        }, (info) => {
          hide('view-loading');
          show('view-main');
          renderMain(info || {});
        });
      };

      if (alreadyLoaded) {
        // Scripts already injected — just send the message
        sendGetPageInfo();
      } else {
        // First open on a fresh page load — inject the full bundle once
        chrome.scripting.executeScript(
          { target: { tabId: currentTab.id }, files: [
              'theme.js', 'libs/flatpickr.js', 'content/notifications.js',
              'content/calendar.js', 'content/smart-detection.js',
              'content/variable-resolution.js', 'content/logo-extractor.js',
              'content/charge-modal.js', 'content/order-edit-modal.js',
              'content/email-preview.js', 'content/page-utils.js',
              'content/watchlist-modal.js', 'content/crm-query-builder.js', 'content/main.js'
            ] },
          sendGetPageInfo
        );
      }
    }
  );
}

function renderMain(info) {
  const { matchedTemplateIds = [] } = info;
  pageInfo = info;

  // Narrow visible templates to those relevant for this page type.
  // Legacy 'email' type is treated as 'order' for backwards compatibility.
  const pageType = info.pageType || 'other';
  const allLoaded = templates;
  if (pageType === 'order') {
    templates = allLoaded.filter(t => t.type === 'order' || t.type === 'email' || !t.type);
  } else if (pageType === 'account' || pageType === 'contact') {
    templates = allLoaded.filter(t => t.type === 'account');
  } else {
    templates = [];
  }

  if (templates.length === 0) {
    hide('view-loading');
    show('view-empty');
    checkChargeButton();
    checkOrderEditButton();
    checkWatchAddButton();
    return;
  }

  selectedId = matchedTemplateIds.find(id => templates.some(t => t.id === id))
    || templates[0]?.id || null;
  buildDropdown(templates, matchedTemplateIds);
  updateDropdownBtn(selectedId, matchedTemplateIds);
  loadTemplate(selectedId, matchedTemplateIds);
  checkChargeButton();
  checkOrderEditButton();
  checkWatchAddButton();
}

function selectTemplate(id, matchedIds) {
  selectedId = id;
  $('dropdown-menu').querySelectorAll('.dropdown-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.id === id);
  });
  updateDropdownBtn(id, matchedIds);
  loadTemplate(id, matchedIds);
}

function loadTemplate(id, matchedIds = []) {
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;
  $('btn-send').disabled = true;
  $('info-grid').innerHTML = '';
  show('vars-loading');
  hide('info-grid');
  chrome.tabs.sendMessage(currentTab.id, {
    action: 'resolveVars',
    vars: tpl.vars || {},
    toField: tpl.toField || { type: 'auto' }
  }, (result) => {
    hide('vars-loading');
    show('info-grid');
    resolvedVars = result?.resolved || {};
    resolvedTo   = result?.toEmail  || '';
    renderInfo(tpl);
  });
}

function renderInfo(tpl) {
  const grid = $('info-grid');
  grid.innerHTML = '';
  const addRow = (key, val, ok) => {
    const row = document.createElement('div');
    row.className = 'info-row';
    row.innerHTML = `<span class="info-key">${key}</span><span class="info-val ${ok ? 'ok' : 'warn'}">${val || 'Not found'}</span>`;
    grid.appendChild(row);
  };
  addRow('To', resolvedTo, !!(resolvedTo && resolvedTo.includes('@')));
  for (const [name, val] of Object.entries(resolvedVars)) {
    addRow(name, val ? val.slice(0, 40) : '', !!val);
  }

  const canSend = !!(resolvedTo && resolvedTo.includes('@'));
  const sendBtn = $('btn-send');
  sendBtn.disabled = !canSend;
  document.getElementById('graph-auth-hint')?.remove();

  if (!canSend) return;

  // tpl.replyMode drives behavior for ALL template types, not just account.
  // 'reply'      → find prior email, thread the reply (file or PA)
  // 'standalone' → fresh email (file or PA)
  // If unset, default: account = reply, others = standalone
  const replyMode = tpl.replyMode || 'standalone';
  const isReply   = replyMode === 'reply';

  chrome.storage.local.get('featureFlags', ({ featureFlags }) => {
    const flags  = featureFlags || {};
    const paReady = !!(flags.replyWithTemplateEnabled && flags.powerAutomateUrl);

    // Button mode:
    // PA ready + reply → 'pa-reply'  (Send as reply via Power Automate)
    // PA ready + fresh → 'pa-send'   (Send fresh email via Power Automate)
    // no PA, reply     → 'reply-file' (download .eml in reply mode)
    // no PA, fresh     → 'mailto'     (open in Outlook, new email)
    let mode = 'mailto';
    if (paReady && isReply)  mode = 'pa-reply';
    else if (paReady)        mode = 'pa-send';
    else if (isReply)        mode = 'reply-file';

    const icons = {
      'pa-send':    `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
      'pa-reply':   `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
      'reply-file': `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
      'mailto':     `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,
    };
    const labels = {
      'pa-send':    'Send',
      'pa-reply':   'Reply',
      'reply-file': 'Reply in Outlook',
      'mailto':     'Open in Outlook',
    };
    sendBtn.innerHTML = `${icons[mode]} ${labels[mode]}`;

    sendBtn.onclick = () => {
      const subject  = renderStr(tpl.subject, resolvedVars, tpl.vars);
      const rawBody  = renderStr(tpl.body,    resolvedVars, tpl.vars); // The HTML version
      
      // Convert HTML to plain text specifically for Outlook mailto links
      const plainBody = toPlainText(rawBody);

      if (mode === 'pa-send' || mode === 'pa-reply') {
        // Fire and close — PA is async, flow handles delivery.
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (!tabs[0]) return;
          chrome.tabs.sendMessage(tabs[0].id, {
            action:          'sendViaPA',
            replyMode:       tpl.replyMode || replyMode,
            templateHtml:    rawBody, // PA needs HTML
            templateSubject: subject,
            contactEmail:    resolvedTo,
            paUrl:           flags.powerAutomateUrl,
          });
        });
        window.close();
      } else if (mode === 'reply-file') {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (!tabs[0]) return;
          chrome.tabs.sendMessage(tabs[0].id, {
            action:          'replyWithTemplate',
            templateHtml:    rawBody, // .eml generator needs HTML
            templateSubject: subject,
            contactEmail:    resolvedTo,
          }, (resp) => {
            if (resp?.fallbackToMailto) {
              // Fallback Mailto gets the Plain Text
              chrome.tabs.create({ url: buildMailto(resolvedTo, subject, plainBody), active: false });
            }
          });
        });
      } else {
        // Standard Mailto gets the Plain Text
        chrome.tabs.create({ url: buildMailto(resolvedTo, subject, plainBody), active: false });
      }

      // Preset task (all modes)
      if (tpl.presetTaskId && (pageInfo.contactId || pageInfo.accountId)) {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (!tabs[0]) return;
          chrome.tabs.sendMessage(tabs[0].id, {
            action:    'executePresetTask',
            taskId:    tpl.presetTaskId,
            contactId: pageInfo.contactId || pageInfo.accountId || '',
            employeeId: pageInfo.userId || '0',
          });
        });
      }
    };
  });
}

// ── Charge Button ─────────────────────────────────────────────────────────────

function checkChargeButton() {
  const btn   = $('btn-charge');
  const label = $('btn-charge-label');
  if (!pageInfo.orderNo) { label.textContent = 'Charge Card'; btn.disabled = true; return; }
  const orderTotal  = pageInfo.pageOrderTotal  || 0;
  const chargeTotal = pageInfo.pageChargeTotal || 0;
  capturedAmount = chargeTotal;
  apiOrderTotal  = orderTotal;
  const diff = orderTotal - chargeTotal;
  if (Math.abs(diff) < 0.005) {
    btn.disabled = true; btn.classList.remove('ready', 'refund'); label.textContent = 'Charge Card';
  } else if (diff > 0) {
    btn.disabled = false; btn.classList.add('ready'); btn.classList.remove('refund');
    label.textContent = `Charge Card  ($${diff.toFixed(2)})`;
  } else {
    btn.disabled = false; btn.classList.remove('ready'); btn.classList.add('refund');
    label.textContent = `Refund  ($${Math.abs(diff).toFixed(2)})`;
  }
}

$('btn-charge').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageInfo' }, resp => {
      if (chrome.runtime.lastError || !resp) {
        alert('Cannot read order data. Please ensure you are on an order page and refresh.');
        return;
      }
      const pageTotal   = resp.pageOrderTotal  || 0;
      const chargeTotal = resp.pageChargeTotal || 0;
      const diff        = pageTotal - chargeTotal;
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showChargeModal',
        context: {
          orderId: resp.orderNo, userId: resp.userId,
          pageTotal, captured: chargeTotal, apiOrderTotal: pageTotal,
          diffAmount: diff, isRefund: diff < -0.005, isZeroDiff: Math.abs(diff) < 0.005,
          chargeRows: resp.pageChargeRows || []
        }
      });
      window.close();
    });
  });
});

// ── Manage button ─────────────────────────────────────────────────────────────

$('btn-manage').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openEditor' }));
$('btn-new-empty')?.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openEditor' }));

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'GB_FEATURE_FLAGS' && msg.flags) {
    if ('chargeEnabled'    in msg.flags) $('btn-charge')?.classList.toggle('hidden', !msg.flags.chargeEnabled);
    if ('orderEditEnabled' in msg.flags) $('btn-order-edit')?.classList.toggle('hidden', !msg.flags.orderEditEnabled);
    if ('watchListEnabled' in msg.flags) {
      const watchRow = document.querySelector('.btn-row-watch');
      if (watchRow) watchRow.style.display = msg.flags.watchListEnabled ? '' : 'none';
    }
    // Re-evaluate the send button if PA flags changed while the popup is open
    if ('replyWithTemplateEnabled' in msg.flags || 'powerAutomateUrl' in msg.flags) {
      const tpl = templates?.find(t => t.id === selectedId);
      if (tpl && resolvedTo) renderInfo(tpl);
    }
  }
});

// ── Order Edit Button ─────────────────────────────────────────────────────────

function checkOrderEditButton() { $('btn-order-edit').disabled = !pageInfo.messageId; }

$('btn-order-edit').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'showOrderEditModal' });
    window.close();
  });
});

// ── Watch List ────────────────────────────────────────────────────────────────

function checkWatchAddButton() {
  const btn   = $('btn-watch-add');
  const label = $('btn-watch-add-label');
  const type  = pageInfo.pageType || 'other';

  let entityId = '';
  if (type === 'order')   entityId = pageInfo.orderNo   || '';
  if (type === 'contact') entityId = pageInfo.contactId || '';
  if (type === 'account') entityId = pageInfo.accountId || '';

  const knownType = (type === 'order' || type === 'contact' || type === 'account');
  btn.disabled = !(knownType && entityId);

  const meta = _WL_ENTITY_LABELS[type] || _WL_ENTITY_LABELS.order;
  if (label) label.textContent = meta.btn;

  // Submit Proof: enabled on order, contact, and account pages
  const proofBtn = $('btn-submit-proof');
  if (proofBtn) {
    const hasContext = knownType && (pageInfo.contactId || pageInfo.accountId || pageInfo.orderNo);
    proofBtn.disabled = !hasContext;
  }
}

/**
 * Updates the badge on the Watch List button in the popup.
 * Goes critical-red if any item has been open ≥ 6h.
 */
function renderWatchBadge() {
  const badge   = $('watch-badge');
  const showBtn = $('btn-watch-show');
  if (!badge || !showBtn) return;

  const count   = watchList.length;
  const hasCrit = watchList.some(i => (Date.now() - i.addedAt) >= 6 * 3600000);

  if (count > 0) {
    const prev = badge.textContent;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden', 'critical');
    if (hasCrit) badge.classList.add('critical');
    if (prev !== badge.textContent) {
      badge.classList.remove('pop');
      void badge.offsetWidth;
      badge.classList.add('pop');
    }
  } else {
    badge.classList.add('hidden');
  }

  showBtn.classList.toggle('has-critical', hasCrit && count > 0);
}

// ── Add Modal ─────────────────────────────────────────────────────────────────

function openAddModal() {
  const type = pageInfo.pageType || 'order';
  const knownType = (type === 'order' || type === 'contact' || type === 'account')
    ? type : 'order';

  let entityId = '';
  if (knownType === 'order')   entityId = pageInfo.orderNo   || '';
  if (knownType === 'contact') entityId = pageInfo.contactId || '';
  if (knownType === 'account') entityId = pageInfo.accountId || '';

  _wlPendingOrderId   = entityId;
  _wlPendingOrderUrl  = currentTab?.url || '';
  _wlPendingEntityType = knownType;

  const meta = _WL_ENTITY_LABELS[knownType];

  // Swap modal icon SVG paths
  const iconSvg = $('wl-modal-icon-svg');
  if (iconSvg) iconSvg.innerHTML = _WL_ENTITY_SVG[knownType];
  const confirmSvg = $('wl-confirm-icon-svg');
  if (confirmSvg) confirmSvg.innerHTML = _WL_ENTITY_SVG[knownType];

  // Update title and field label
  const titleEl = $('wl-modal-title-text');
  if (titleEl) titleEl.textContent = meta.title;
  const fieldLabelEl = $('wl-add-entity-label');
  if (fieldLabelEl) fieldLabelEl.textContent = meta.field;

  // Update ID field and reason textarea
  $('wl-add-order-id').value = entityId || '—';
  const reasonEl = $('wl-add-reason');
  reasonEl.value = '';
  reasonEl.placeholder = meta.placeholder;
  reasonEl.classList.remove('error');

  $('modal-watch-add').classList.add('open');
  setTimeout(() => reasonEl.focus(), 310);
}

function closeAddModal() {
  $('modal-watch-add').classList.remove('open');
}

function submitAddModal() {
  const reason = $('wl-add-reason').value.trim();
  if (!reason) {
    const f = $('wl-add-reason');
    f.classList.remove('error'); void f.offsetWidth; f.classList.add('error');
    f.focus();
    return;
  }
  const entry = {
    id:         Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    orderId:    _wlPendingOrderId,
    orderUrl:   _wlPendingOrderUrl,
    entityType: _wlPendingEntityType || 'order',
    reason,
    addedAt:    Date.now()
  };
  watchList.push(entry);
  chrome.storage.local.set({ watchList });
  renderWatchBadge();
  closeAddModal();
}

$('btn-watch-add').addEventListener('click', openAddModal);
$('modal-add-close').addEventListener('click', closeAddModal);
$('wl-add-cancel').addEventListener('click', closeAddModal);
$('wl-add-confirm').addEventListener('click', submitAddModal);
$('modal-watch-add').addEventListener('click', e => { if (e.target === $('modal-watch-add')) closeAddModal(); });
$('wl-add-reason').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddModal(); }
  if (e.key === 'Escape') closeAddModal();
});

// ── Task List button ──────────────────────────────────────────────────────────

$('btn-task-list')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'showTaskListModal' });
    window.close();
  });
});

// ── CRM Search button ─────────────────────────────────────────────────────────

$('btn-crm-search')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'showCrmSearchModal' });
    window.close();
  });
});

// ── Show Watch List button → open dedicated window ────────────────────────────

$('btn-watch-show').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'showWatchListModal' });
    window.close();
  });
});

// ── Submit Proof ──────────────────────────────────────────────────────────────

async function openSubmitProofModal() {
  const btn = $('btn-submit-proof');
  const origHTML = btn.innerHTML;
  btn.innerHTML = `<div class="spin" style="width:12px;height:12px;display:inline-block;"></div> Loading…`;
  btn.disabled = true;

  try {
    const pageType  = pageInfo.pageType || 'other';
    const orderId   = pageInfo.orderNo   || '';
    const contactId = pageInfo.contactId || pageInfo.accountId || '';

    // Fetch live dropdowns from Page=128
    const html = await fetch(
      `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=128${contactId ? '&customerID=' + contactId : ''}`,
      { credentials: 'include' }
    ).then(r => r.text());

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scrape = id => Array.from(doc.getElementById(id)?.options || []).map(o => ({ val: o.value, txt: o.text.trim() }));

    const liveReps    = scrape('ctl00_DropDownSalesRep');
    const liveArtists = scrape('ctl00_DropDownArtist');

    // Fetch existing proofs for this contact if available
    let existingProofs = [];
    if (contactId) {
      try {
        const crmHtml = await fetch(
          `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}`,
          { credentials: 'include' }
        ).then(r => r.text());
        const cDoc = new DOMParser().parseFromString(crmHtml, 'text/html');
        for (const row of cDoc.querySelectorAll('tr')) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 5) continue;
          const anchor = cells[4].querySelector('a[href*="logoProofing"]');
          const img    = cells[4].querySelector('img');
          if (!anchor || !img) continue;
          const m = (anchor.getAttribute('href')||'').match(/logoGUID=([a-f0-9-]+)/i);
          if (!m) continue;
          const guid = m[1];
          let name = '';
          for (let i = 0; i <= 3 && !name; i++) {
            const t = cells[i]?.textContent.trim();
            if (t && t.length > 2) name = t;
          }
          existingProofs.push({
            name:      name || anchor.textContent.trim() || `Proof ${guid.slice(0,8)}`,
            proofLink: `https://www.golfballs.com/golfballs/logoProofing/?logoGUID=${guid}`,
            thumbUrl:  `https://d1tp32r8b76g0z.cloudfront.net/logo/${guid.slice(0,2)}/${guid}-150.jpg`,
            status:    cells[3]?.textContent.trim() || '',
          });
        }
      } catch(e) { /* proofs not critical */ }
    }

    // Send message to content script to open the full-page proof modal
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        action:        'showSubmitProofModal',
        orderId,
        customerId:    contactId,
        liveReps,
        liveArtists,
        existingProofs,
      });
      window.close();
    });
  } catch(e) {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    console.error('[GB] Failed to load proof modal:', e);
  }
}

function initSubmitProofModal() {
  $('btn-submit-proof')?.addEventListener('click', openSubmitProofModal);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('featureFlags', (data) => {
    const flags = {
      chargeEnabled:    true,
      orderEditEnabled: true,
      submitProofEnabled: true,
      taskListEnabled:  true,
      crmSearchEnabled: true,
      ...(data.featureFlags || {})
    };
    if (!flags.chargeEnabled)      $('btn-charge')?.classList.add('hidden');
    if (!flags.orderEditEnabled)   $('btn-order-edit')?.classList.add('hidden');
    if (!flags.submitProofEnabled) $('btn-submit-proof')?.classList.add('hidden');
    if (!flags.taskListEnabled)    $('btn-task-list')?.classList.add('hidden');
    if (!flags.crmSearchEnabled)   $('btn-crm-search')?.classList.add('hidden');

    // Calculate popup height based on visible buttons.
    // Each button is ~30px tall + ~6px margin = ~36px per button.
    // Fixed parts: header (~54px) + body padding (~18px) + bottom-section padding-top (14px)
    //              + hr (17px) + 5 variable rows (~18px each = 90px) + send button (~32px) + bottom padding (8px)
  });
  initSubmitProofModal();
  init();
});
