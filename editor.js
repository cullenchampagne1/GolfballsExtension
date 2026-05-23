// editor.js

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let templates     = [];
let noteTemplates = [];
let currentId     = null;
let currentNoteId = null;
let currentTab    = 'email';
let orderTabId    = null;
let rules             = [];
let accountConditions = [];
let caseRules         = [];
let caseVars      = [];
let caseTags      = [];
let vars          = {};
let varOrder      = [];

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

/**
 * Themed confirm/prompt that go through the global SettingNotification
 * centered overlay (mounted by editor-notifications.js). Falls back to
 * window.confirm/prompt if the bridge isn't ready yet.
 */
function gbConfirm(message, options = {}) {
  if (window.__gbNotify?.confirm) return window.__gbNotify.confirm(message, options);
  return Promise.resolve(window.confirm(message));
}
function gbPrompt(message, options = {}) {
  if (window.__gbNotify?.prompt) return window.__gbNotify.prompt(message, options);
  return Promise.resolve(window.prompt(message, options.defaultValue || ''));
}
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc  = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/**
 * Displays a brief status toast at the top of the editor.
 * @param {string} [msg='Saved'] - The message to display.
 * @param {boolean} [isError=false] - When true renders the toast in red.
 */
function toast(msg = 'Saved', isError = false) {
  // Prefer the React PillToast manager (mounted by editor-toasts.js) so
  // the legacy and React UIs surface the same bottom-right notifications.
  if (window.__gbToast) {
    return isError ? window.__gbToast.error(msg) : window.__gbToast.success(msg);
  }
  const t   = $('toast');
  if (!t) return;
  const dot = t.querySelector('.toast-dot');
  const msgEl = $('toast-msg');
  if (msgEl) msgEl.textContent = msg;
  if (dot) dot.style.background = isError ? 'var(--gb-error)' : 'var(--gb-brand-label)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/**
 * Transitions the editor to the specified view panel with a fade animation,
 * hiding all other view panels.
 * @param {string} viewId - The id of the view element to show.
 */
function animateView(viewId) {
  const view = $(viewId);
  if (!view) return;
  view.classList.remove('view-animate');
  void view.offsetWidth; // trigger reflow
  view.classList.add('view-animate');
}

const PICK_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>`;
const DEL_SVG  = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
const EMAIL_ICON = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
const NOTE_ICON  = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;

// ═══════════════════════════════════════════════════════════════
// CUSTOM DROPDOWN BINDING ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Wires keyboard-accessible custom dropdown controls inside a container.
 * Handles open/close toggling, option selection, click-outside dismissal,
 * and syncs the selected value to a paired hidden `<select>` element.
 * @param {HTMLElement} container - The root element containing the dropdowns.
 */
function bindCustomDropdowns(container) {
  const selects = container.querySelectorAll('select.custom-select-raw');
  
  selects.forEach(select => {
    if(select.dataset.bound) return;
    select.dataset.bound = true;
    select.style.display = 'none'; 
    
    const wrap = document.createElement('div');
    wrap.className = 'gb-dropdown-wrap';
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gb-dropdown-btn';
    
    const selectedOpt = select.options[select.selectedIndex];
    btn.innerHTML = `
      <span class="gb-btn-label">${esc(selectedOpt ? selectedOpt.text : '')}</span>
      <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
    `;
    
    const menu = document.createElement('div');
    menu.className = 'gb-dropdown-menu';
    
    Array.from(select.options).forEach((opt, idx) => {
      const optionEl = document.createElement('div');
      optionEl.className = 'gb-dropdown-option' + (opt.selected ? ' selected' : '');
      optionEl.dataset.value = opt.value;
      optionEl.textContent = opt.text;
      
      optionEl.addEventListener('click', (e) => {
        e.stopPropagation();
        
        btn.querySelector('.gb-btn-label').textContent = opt.text;
        menu.querySelectorAll('.gb-dropdown-option').forEach(o => o.classList.remove('selected'));
        optionEl.classList.add('selected');
        
        menu.classList.remove('open');
        btn.classList.remove('open');
        
        select.selectedIndex = idx;
        select.dispatchEvent(new Event('change'));
      });
      
      menu.appendChild(optionEl);
    });
    
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    select.parentNode.insertBefore(wrap, select.nextSibling);
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      
      document.querySelectorAll('.gb-dropdown-menu.open, .gb-dropdown-btn.open').forEach(el => el.classList.remove('open'));
      
      if (!isOpen) {
        menu.classList.add('open');
        btn.classList.add('open');
      }
    });
  });
}

/**
 * Synchronises a custom dropdown button's visible label with the currently
 * selected option in its paired hidden `<select>` element.
 * @param {HTMLSelectElement} select - The hidden native select element.
 */
function syncDropdown(select) {
  const wrap = select.nextElementSibling;
  if (wrap && wrap.classList.contains('gb-dropdown-wrap')) {
    const opt = select.options[select.selectedIndex];
    wrap.querySelector('.gb-btn-label').textContent = opt ? opt.text : '';
    wrap.querySelectorAll('.gb-dropdown-option').forEach(o => o.classList.remove('selected'));
    
    const activeOptEl = wrap.querySelector(`.gb-dropdown-option[data-value="${opt ? opt.value : ''}"]`);
    if (activeOptEl) activeOptEl.classList.add('selected');
  }
}

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

/**
 * Loads both email templates and note templates from chrome.storage.local
 * into the module-level arrays, then re-renders the editor UI.
 * @returns {Promise<void>}
 */
async function loadStorage() {
  return new Promise(res => chrome.storage.local.get(['templates', 'noteTemplates', 'orderTabId'], res));
}

/**
 * Persists the current in-memory email-template array to chrome.storage.local.
 * @returns {Promise<void>}
 */
async function saveTemplates() {
  return new Promise(res => chrome.storage.local.set({ templates }, res));
}

/**
 * Persists the current in-memory note-template array to chrome.storage.local.
 * @returns {Promise<void>}
 */
async function saveNoteTemplates() {
  return new Promise(res => chrome.storage.local.set({ noteTemplates }, res));
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════

/**
 * Refreshes the numeric badge on each editor tab to reflect the number of
 * templates in the corresponding list.
 */
function updateTabCounts() {
  $('tab-email-count').textContent = templates.length;
  $('tab-notes-count').textContent = noteTemplates.length;
}

/**
 * Switches the editor to the given top-level tab ('email' or 'notes'),
 * updating active styles and rendering the appropriate sidebar.
 * @param {'email'|'notes'} tab - The tab identifier to activate.
 */
function switchTab(tab) {
  const prevTab = currentTab;
  currentTab = tab;
  $('tab-email').classList.toggle('active', tab === 'email');
  $('tab-notes').classList.toggle('active', tab === 'notes');
  
  const btnNew = $('btn-new');
  const textNodes = [...btnNew.childNodes].filter(n => n.nodeType === 3);
  if(textNodes.length > 0) {
    textNodes[textNodes.length - 1].nodeValue = tab === 'email' ? ' New Template' : ' New Note Template';
  }
  
  hide('ed-form'); 
  hide('ed-note-form'); 
  show('ed-empty');
  animateView('ed-empty');
  
  const list = $('tpl-list');
  list.classList.remove('slide-from-right', 'slide-from-left');
  void list.offsetWidth; 
  
  if (prevTab !== currentTab) {
    list.classList.add(tab === 'notes' ? 'slide-from-right' : 'slide-from-left');
  }
  
  renderSidebar();
}

$('tab-email').addEventListener('click', () => { if (!$('ed-settings').classList.contains('hidden')) closeSettings(); switchTab('email'); });
$('tab-notes').addEventListener('click', () => { if (!$('ed-settings').classList.contains('hidden')) closeSettings(); switchTab('notes'); });

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════

/**
 * Renders the template list in the sidebar for the currently active tab,
 * including matched-rule indicators and selection highlighting.
 */
// Returns variation grouping maps for the sidebar.
function _getVariationMap(tpls) {
  const childToParent    = new Map();
  const parentToChildren = new Map();
  tpls.forEach(t => {
    const m = (t.name || '').match(/^(.+?)\s+Variation\s+#?\d+$/i);
    if (!m) return;
    const baseName = m[1].trim();
    const parent = tpls.find(p => p.name === baseName && p.type === t.type && p.id !== t.id);
    if (!parent) return;
    childToParent.set(t.id, parent.id);
    if (!parentToChildren.has(parent.id)) parentToChildren.set(parent.id, []);
    parentToChildren.get(parent.id).push(t.id);
  });
  return { childToParent, parentToChildren };
}

function renderSidebar() {
  const list = $('tpl-list');
  list.innerHTML = '';
  updateTabCounts();

  const renderItem = (t, isActive, isNote, onClick) => {
    const div = document.createElement('div');
    div.className = 'tpl-item' + (isActive ? ' active' : '');
    const disabled = t.enabled === false;
    const TYPE_BADGE = { order: '', account: 'Account · ', case: '⬟ Case · ' };
    const typeBadge = isNote ? '' : (TYPE_BADGE[t.type] ?? (t.type === 'email' ? '' : ''));
    const meta = isNote 
      ? (disabled ? '' : `${t.subType && t.subType !== 'note' ? t.subType.charAt(0).toUpperCase() + t.subType.slice(1) + ' · ' : ''}enabled`) 
      : `${typeBadge}${(t.rules||[]).length} rule${(t.rules||[]).length!==1?'s':''} · ${Object.keys(t.vars||{}).length} var${Object.keys(t.vars||{}).length!==1?'s':''}`;

    div.innerHTML = `
      <div class="tpl-icon">${isNote ? NOTE_ICON : EMAIL_ICON}</div>
      <div class="tpl-info">
        <div class="tpl-name">${esc(t.name || 'Untitled')}</div>
        <div class="tpl-meta">${meta}</div>
      </div>
      ${disabled ? '<span class="tpl-disabled-badge">off</span>' : ''}
    `;
    div.addEventListener('click', onClick);
    list.appendChild(div);
  };

  if (currentTab === 'email') {
    const orders   = templates.filter(t => t.type === 'order' || t.type === 'email' || !t.type);
    const accounts = templates.filter(t => t.type === 'account');
    const cases    = templates.filter(t => t.type === 'case');

    const allEmailTpls = [...orders, ...accounts, ...cases];
    const { childToParent, parentToChildren } = _getVariationMap(allEmailTpls);

    const renderSection = (list, labelText) => {
      if (!list.length) return;
      // Only show parents (non-children) in main list
      const roots = list.filter(t => !childToParent.has(t.id));
      if (!roots.length) return;
      const lbl = document.createElement('div');
      lbl.className = 'tpl-section-label';
      lbl.textContent = labelText;
      $('tpl-list').appendChild(lbl);
      roots.forEach(t => {
        const varIds  = parentToChildren.get(t.id) || [];
        const varTpls = varIds.map(id => allEmailTpls.find(x => x.id === id)).filter(Boolean);

        if (!varTpls.length) {
          renderItem(t, t.id === currentId, false, () => openTemplate(t.id));
          return;
        }

        // Parent with variations — render as collapsible group
        const group     = document.createElement('div');
        group.className = 'tpl-var-group';
        const isChildActive = varIds.includes(currentId);
        const isParentActive = t.id === currentId;
        const startExpanded  = isParentActive || isChildActive;

        // Parent row (has arrow + var badge)
        const parentDiv = document.createElement('div');
        parentDiv.className = 'tpl-item tpl-item-parent' + (isParentActive ? ' active' : '') + (startExpanded ? ' expanded' : '');
        const disabled  = t.enabled === false;
        const TYPE_BADGE = { order: '', account: 'Account · ', case: '⬟ Case · ' };
        const typeBadge = TYPE_BADGE[t.type] ?? '';
        const meta = `${typeBadge}${(t.rules||[]).length} rule${(t.rules||[]).length!==1?'s':''} · ${Object.keys(t.vars||{}).length} var${Object.keys(t.vars||{}).length!==1?'s':''}`;
        parentDiv.innerHTML = `
          <span class="tpl-parent-arrow">▶</span>
          <div class="tpl-icon">${EMAIL_ICON}</div>
          <div class="tpl-info">
            <div class="tpl-name">${esc(t.name || 'Untitled')}</div>
            <div class="tpl-meta">${meta}</div>
          </div>
          <span class="tpl-var-badge">${varTpls.length + 1}v</span>
          ${disabled ? '<span class="tpl-disabled-badge">off</span>' : ''}
        `;

        // Children container
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tpl-var-children' + (startExpanded ? ' open' : '');

        // Parent click: open template OR toggle if clicking the arrow area
        parentDiv.addEventListener('click', (e) => {
          const expanded = parentDiv.classList.toggle('expanded');
          childrenDiv.classList.toggle('open', expanded);
          openTemplate(t.id);
        });

        // Render variation children
        varTpls.forEach(v => {
          const child = document.createElement('div');
          child.className = 'tpl-item tpl-var-child' + (v.id === currentId ? ' active' : '');
          const vMeta = `${typeBadge}${(v.rules||[]).length} rule${(v.rules||[]).length!==1?'s':''} · ${Object.keys(v.vars||{}).length} var${Object.keys(v.vars||{}).length!==1?'s':''}`;
          const vName = (v.name || 'Untitled').replace(/^.+?\s+(Variation\s+#?\d+)$/i, '$1');
          child.innerHTML = `
            <div class="tpl-icon">${EMAIL_ICON}</div>
            <div class="tpl-info">
              <div class="tpl-name">${esc(vName)}</div>
              <div class="tpl-meta">${vMeta}</div>
            </div>
            ${v.enabled === false ? '<span class="tpl-disabled-badge">off</span>' : ''}
          `;
          child.addEventListener('click', (e) => { e.stopPropagation(); openTemplate(v.id); });
          childrenDiv.appendChild(child);
        });

        group.appendChild(parentDiv);
        group.appendChild(childrenDiv);
        $('tpl-list').appendChild(group);
      });
    };

    renderSection(orders.filter(t => t.enabled !== false),   'Order — Active');
    renderSection(orders.filter(t => t.enabled === false),   'Order — Disabled');
    renderSection(accounts.filter(t => t.enabled !== false), 'Account — Active');
    renderSection(accounts.filter(t => t.enabled === false), 'Account — Disabled');
    renderSection(cases.filter(t => t.enabled !== false),    'Case — Active');
    renderSection(cases.filter(t => t.enabled === false),    'Case — Disabled');
  } else {
    const notes    = noteTemplates.filter(t => !t.subType || t.subType === 'note');
    const tasks    = noteTemplates.filter(t => t.subType === 'task');
    const callLogs = noteTemplates.filter(t => t.subType === 'call_log');
    const other    = noteTemplates.filter(t => t.subType && t.subType !== 'note' && t.subType !== 'task' && t.subType !== 'call_log');

    const renderNoteSection = (list, labelText) => {
      if (!list.length) return;
      const lbl = document.createElement('div');
      lbl.className = 'tpl-section-label';
      lbl.textContent = labelText;
      $('tpl-list').appendChild(lbl);
      list.forEach(t => renderItem(t, t.id === currentNoteId, true, () => openNoteTemplate(t.id)));
    };

    renderNoteSection(notes.filter(t => t.enabled !== false),    'Note — Active');
    renderNoteSection(notes.filter(t => t.enabled === false),    'Note — Disabled');
    renderNoteSection(tasks.filter(t => t.enabled !== false),    'Task — Active');
    renderNoteSection(tasks.filter(t => t.enabled === false),    'Task — Disabled');
    renderNoteSection(callLogs.filter(t => t.enabled !== false), 'Call Log — Active');
    renderNoteSection(callLogs.filter(t => t.enabled === false), 'Call Log — Disabled');
    if (other.length) renderNoteSection(other, 'Other');
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATE: OPEN / NEW
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a blank email template, appends it to the template list, selects
 * it, and opens it in the editor form.
 */
async function newTemplate() {
  // React owns #ed-form, so the legacy DOM-population path below is gone.
  // Create the blank template up-front and route through openTemplate so
  // the React TemplateEditor receives a real tpl object via __gbOpenTemplate.
  if (window.__gbOpenTemplate) {
    const id = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const blank = {
      id, type: 'order', name: 'New Template',
      enabled: true, subject: '', body: '',
      rules: [], vars: {}, varOrder: [],
      updatedAt: Date.now(),
    };
    templates.push(blank);
    await saveTemplates();
    hide('ed-empty');
    hide('ed-note-form');
    hide('ed-settings');
    show('ed-form');
    show('btn-del');
    animateView('ed-form');
    openTemplate(id);
    return;
  }

  // Legacy DOM path — bail if React already destroyed the form.
  if (!$('ed-title')) {
    console.warn('[gb-editor] React template bridge missing; reload editor.');
    return;
  }

  currentId = null;
  rules = [];
  vars = {};
  varOrder = [];

  hide('ed-empty');
  hide('ed-note-form');
  show('ed-form');
  hide('btn-del');
  animateView('ed-form');

  $('ed-title').textContent = 'New Template';
  $('f-name').value = '';
  $('f-subject').value = '';
  $('f-body').innerHTML = '';
  $('f-enabled').checked = true;
  if ($('f-tpl-type')) $('f-tpl-type').value = 'order';
  caseRules = [];
  caseVars  = [];
  caseTags  = [];
  switchTemplateType('email');
  
  const toTypeSelect = $('to-type');
  toTypeSelect.value = 'auto'; 
  $('to-val').value = '';
  syncDropdown(toTypeSelect);
  
  updateToVisibility(); 
  renderRules(); 
  renderVars(); 
  renderVarChips(); 
  renderSidebar();
}

/**
 * Opens an email template in the editor form by populating all form fields
 * from the stored template object.
 * @param {string} id - The template ID to open.
 */
function openTemplate(id) {
  if (currentId === id && !$('ed-form').classList.contains('hidden')) return;

  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;

  currentId = id;

  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  show('ed-form');
  show('btn-del');
  animateView('ed-form');

  // React template editor (react-dist/content/editor-templates.js) owns #ed-form.
  // Hand off template data and return — legacy form population below is inert.
  if (window.__gbOpenTemplate) {
    window.__gbOpenTemplate(tpl);
    return;
  }
  // Bridge isn't installed (React mount failed or torn down) AND the
  // legacy DOM is gone — bail before touching null. Without this guard
  // every click here throws on `$('ed-title').textContent`.
  if (!$('ed-title')) {
    console.warn('[gb-editor] React template bridge missing and legacy DOM is gone; reload the editor tab.');
    return;
  }

  rules              = JSON.parse(JSON.stringify(tpl.rules || []));
  accountConditions  = JSON.parse(JSON.stringify(tpl.accountConditions || []));
  vars     = JSON.parse(JSON.stringify(tpl.vars  || {}));
  varOrder = Object.keys(vars);
  
  $('ed-title').textContent = tpl.name || 'Template';
  $('f-name').value    = tpl.name    || '';
  $('f-subject').value = tpl.subject || '';
  // Load body — convert plain text (existing templates) to HTML
  const rawBody = tpl.body || '';
  if (rawBody && !rawBody.includes('<')) {
    // Plain text with \n — convert to HTML paragraphs
    $('f-body').innerHTML = rawBody.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<p><br></p>').join('');
  } else {
    $('f-body').innerHTML = rawBody;
  }
  // Highlight {{variables}} as styled tags
  _rteHighlightVars($('f-body'));
  $('f-enabled').checked = tpl.enabled !== false;
  if ($('f-tpl-type')) {
    // treat legacy 'email' type as 'order' for display purposes
    const rawType = tpl.type || 'order';
    $('f-tpl-type').value = (rawType === 'email') ? 'order' : rawType;
  }
  if (tpl.type === 'account' && $('f-preset-task')) {
    populatePresetTaskDropdown(tpl.presetTaskId || '');
  }
  caseRules = JSON.parse(JSON.stringify(tpl.caseRules || []));
  caseVars  = JSON.parse(JSON.stringify(tpl.caseVars  || []));
  caseTags  = JSON.parse(JSON.stringify(tpl.caseTags  || []));
  // Load reply mode toggle
  if ($('f-reply-mode-check')) {
    $('f-reply-mode-check').checked = (tpl.replyMode !== 'standalone');
  }
  switchTemplateType(tpl.type === 'email' ? 'order' : (tpl.type || 'order'));
  
  const toField = tpl.toField || { type: 'auto' };
  const toTypeSelect = $('to-type');
  toTypeSelect.value = toField.type || 'auto';
  $('to-val').value  = toField.type === 'selector' ? (toField.selector || '') : toField.type === 'literal' ? (toField.value || '') : '';
  syncDropdown(toTypeSelect);
  
  updateToVisibility(); 
  renderRules(); 
  renderVars(); 
  renderVarChips(); 
  renderSidebar(); 
  refreshHints();
}

// ═══════════════════════════════════════════════════════════════
// NOTE TEMPLATE: OPEN / NEW
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a blank quick-note template, appends it to the note list, selects
 * it, and opens it in the note editor form.
 */
async function newNoteTemplate() {
  // React owns #ed-note-form. Create the blank note, persist, then hand
  // off to openNoteTemplate which calls __gbOpenNote with the real tpl.
  if (!window.__gbOpenNote) {
    console.warn('[gb-editor] React note-template bridge missing; reload editor.');
    return;
  }
  const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = {
    id, name: 'New Note Template', subType: 'note',
    enabled: true, subject: '', body: '',
    audienceVal: '', daysOut: null,
    updatedAt: Date.now(),
  };
  noteTemplates.push(blank);
  await saveNoteTemplates();
  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  show('ed-note-form');
  animateView('ed-note-form');
  openNoteTemplate(id);
}

/**
 * Opens a quick-note template in the note editor form.
 * @param {string} id - The note template ID to open.
 */
function openNoteTemplate(id) {
  if (currentNoteId === id && !$('ed-note-form').classList.contains('hidden')) return;

  const tpl = noteTemplates.find(t => t.id === id);
  if (!tpl) return;

  currentNoteId = id;

  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  show('ed-note-form');
  animateView('ed-note-form');

  // React note editor (react-dist/content/editor-notes.js) owns #ed-note-form.
  if (window.__gbOpenNote) {
    window.__gbOpenNote(tpl);
    renderSidebar();
    return;
  }
  // Bridge missing AND legacy DOM is gone — nothing to do.
  console.warn('[gb-editor] React note-template bridge missing; reload editor.');
  renderSidebar();
}

// ═══════════════════════════════════════════════════════════════
// RULES BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Renders the auto-match rules list in the editor form for the currently
 * selected email template.
 */
function renderRules() {
  const el = $('rules-list'); 
  el.innerHTML = '';
  
  rules.forEach((rule, i) => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    
    const opOptions = ['contains','equals','startsWith','endsWith','exists','notExists']
      .map(o => `<option value="${o}" ${rule.operator===o?'selected':''}>${o}</option>`)
      .join('');
      
    card.innerHTML = `
      <div class="rule-top">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div class="rule-sel-disp" title="${esc(rule.selector)}">${esc(rule.selector)||'<no element selected>'}</div>
        </div>
        <select class="rule-op custom-select-raw" data-i="${i}">
          ${opOptions}
        </select>
        <input type="text" class="rule-val" data-i="${i}" value="${esc(rule.value||'')}" placeholder="value…">
        <button class="btn-icon rule-del" data-i="${i}" title="Remove">${DEL_SVG}</button>
      </div>
      <div class="rule-pick-row">
        <button class="btn-pick rule-pick-btn" data-i="${i}">${PICK_SVG} Pick element</button>
        <div class="resolved-hint" id="rule-hint-${i}"></div>
      </div>`;
    el.appendChild(card);
  });
  
  bindCustomDropdowns(el);
  
  el.querySelectorAll('.rule-op').forEach(s => {
    s.addEventListener('change', e => { rules[+e.target.dataset.i].operator = e.target.value; });
  });
  
  el.querySelectorAll('.rule-val').forEach(s => {
    s.addEventListener('input', e => { rules[+e.target.dataset.i].value = e.target.value; });
  });
  
  el.querySelectorAll('.rule-del').forEach(b => {
    b.addEventListener('click', e => { rules.splice(+e.currentTarget.dataset.i, 1); renderRules(); });
  });
  
  el.querySelectorAll('.rule-pick-btn').forEach(b => {
    b.addEventListener('click', e => { startPick(`rule:${e.currentTarget.dataset.i}`); });
  });
  
  refreshHints();
}

// ═══════════════════════════════════════════════════════════════
// VARIABLES BUILDER
// ═══════════════════════════════════════════════════════════════

const ORDER_BUILTINS = [
  { value: 'email',                   label: 'Customer Email'            },
  { value: 'order_number',            label: 'Order Number'              },
  { value: 'payment_link',            label: 'Payment Link'              },
  { value: 'oos_item',                label: 'OOS Item'                  },
  { value: 'recommended_replacement', label: 'Recommended Replacement'   },
];

const ACCOUNT_BUILTINS = [
  { value: 'firstName',          label: 'Contact: First Name' },
  { value: 'lastName',           label: 'Contact: Last Name' },
  { value: 'fullName',           label: 'Contact: Full Name' },
  { value: 'companyName',        label: 'Contact: Company' },
  { value: 'jobTitle',           label: 'Contact: Job Title' },
  { value: 'contactEmail',       label: 'Contact: Email' },
  { value: 'phoneNumber',        label: 'Contact: Phone' },
  { value: 'zipCode',            label: 'Contact: Zip' },
  { value: 'accountName',        label: 'Account: Name' },
  { value: 'webAddress',         label: 'Account: Web Address' },
  { value: 'mainAddress',        label: 'Account: Main Address' },
  { value: 'mainCity',           label: 'Account: City' },
  { value: 'mainState',          label: 'Account: State' },
  { value: 'mainZip',            label: 'Account: Zip' },
  { value: 'mainCountry',        label: 'Account: Country' },
  { value: 'salesRep',           label: 'Account: Sales Rep' },
  { value: 'orderCount',         label: 'Stats: Order Count' },
  { value: 'totalRevenue',       label: 'Stats: Total Revenue' },
  { value: 'lastOrderDate',      label: 'Stats: Last Order Date' },
  { value: 'priorYearRev',       label: 'Stats: Prior Year Rev' },
  { value: 'ytdRevenue',         label: 'Stats: YTD Revenue' },
  { value: 'avgOrderSize',       label: 'Stats: Avg Order Size' },
  { value: 'daysSinceLastOrder', label: 'Stats: Days Since Last Order' },
  { value: 'nextTaskName',       label: 'Tasks: Next Task Name' },
  { value: 'nextTaskDue',        label: 'Tasks: Next Task Due' },
  { value: 'lastEmailSubject',   label: 'Email: Last Subject' },
  { value: 'lastEmailDate',      label: 'Email: Last Date' },
  { value: 'today',              label: 'Date: Today' },
  { value: 'todayLong',          label: 'Date: Today (Long)' },
];

/**
 * Generates the HTML string for a single variable's editor row, with the
 * appropriate sub-fields displayed based on the variable type.
 * @param {string} name - The variable name.
 * @param {object} def - The variable definition object.
 * @returns {string} HTML string for the variable row.
 */
function varFieldsHTML(name, def) {
  const type = def.type || 'builtin';
  const tplType = $('f-tpl-type')?.value || 'order';
  const builtinList = tplType === 'account' ? ACCOUNT_BUILTINS : ORDER_BUILTINS;
  
  const builtinOptions = builtinList
    .map(o => `<option value="${o.value}" ${def.builtin===o.value?'selected':''}>${o.label}</option>`)
    .join('');
    
  return `
    <div class="var-fields" data-ftype="builtin" ${type!=='builtin'?'style="display:none"':''}>
      <select class="var-builtin-sel custom-select-raw" data-varname="${esc(name)}">
        ${builtinOptions}
      </select>
      ${def.builtin === 'recommended_replacement' ? `<div class="field-hint">Finds closest replacement by name similarity on golfballs.com.</div>` : ''}
    </div>
    
    <div class="var-fields" data-ftype="selector" ${type!=='selector'?'style="display:none"':''}>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" class="var-sel-inp" data-varname="${esc(name)}" value="${esc(def.selector||'')}" placeholder="CSS selector…" style="flex:1;">
        <button class="btn-pick var-sel-pick" data-varname="${esc(name)}">${PICK_SVG} Pick</button>
      </div>
      <div class="resolved-hint var-hint" id="vhint-sel-${esc(name)}"></div>
    </div>
    
    <div class="var-fields" data-ftype="regex" ${type!=='regex'?'style="display:none"':''}>
      <div style="display:grid;grid-template-columns:1fr 60px;gap:8px;margin-bottom:6px;">
        <input type="text" class="var-pat-inp" data-varname="${esc(name)}" value="${esc(def.pattern||'')}" placeholder="regex pattern, e.g. Order #(\\d+)" style="font-family:monospace;">
        <input type="number" class="var-grp-inp" data-varname="${esc(name)}" value="${def.group??1}" min="0" placeholder="grp" title="Capture group number">
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" class="var-scope-inp" data-varname="${esc(name)}" value="${esc(def.scope||'')}" placeholder="scope selector (optional)" style="flex:1;">
        <button class="btn-pick var-scope-pick" data-varname="${esc(name)}">${PICK_SVG} Pick scope</button>
      </div>
      <div class="resolved-hint var-hint" id="vhint-rx-${esc(name)}"></div>
    </div>
  `;
}

/**
 * Renders all variable rows for the currently selected email template into
 * the variables section of the editor form.
 */
function renderVars() {
  const el = $('vars-list'); 
  el.innerHTML = '';
  
  varOrder.forEach(name => {
    const def  = vars[name] || { type: 'builtin', builtin: 'email' };
    const type = def.type || 'builtin';
    const card = document.createElement('div');
    
    card.className = 'var-card'; 
    card.dataset.varname = name;
    card.innerHTML = `
      <div class="var-top">
        <input type="text" class="var-name-inp" value="${esc(name)}" data-old="${esc(name)}" placeholder="variable_name" style="font-family:monospace;font-weight:bold;">
        <select class="var-type-sel custom-select-raw" data-varname="${esc(name)}">
          <option value="builtin"  ${type==='builtin' ?'selected':''}>Built-in</option>
          <option value="selector" ${type==='selector'?'selected':''}>Selector</option>
          <option value="regex"    ${type==='regex'   ?'selected':''}>Regex</option>
        </select>
        <button class="btn-icon var-del" data-varname="${esc(name)}" title="Remove">${DEL_SVG}</button>
      </div>
      ${varFieldsHTML(name, def)}
    `;
    el.appendChild(card);
  });
  
  bindCustomDropdowns(el);
  wireVarEvents(el); 
  refreshHints();
}

/**
 * Attaches change/input event listeners to all interactive controls within
 * a variable row so that template data stays in sync with the form state.
 * @param {HTMLElement} el - The variable row container element.
 */
function wireVarEvents(el) {
  el.querySelectorAll('.var-name-inp').forEach(inp => {
    inp.addEventListener('change', e => {
      const old = e.target.dataset.old;
      let nw = e.target.value.trim().replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
      
      if (!nw || nw === old) { 
        e.target.value = old; 
        return; 
      }
      
      if (vars[nw]) { 
        e.target.value = old; 
        toast('Name already in use', true); 
        return; 
      }
      
      vars[nw] = vars[old]; 
      delete vars[old];
      varOrder[varOrder.indexOf(old)] = nw;
      e.target.dataset.old = nw;
      
      renderVars(); 
      renderVarChips();
    });
  });

  el.querySelectorAll('.var-type-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      const name = e.target.dataset.varname;
      const type = e.target.value;
      const old  = vars[name] || {};
      
      if (type === 'builtin')  vars[name] = { type, builtin: old.builtin || 'email' };
      if (type === 'selector') vars[name] = { type, selector: old.selector || '' };
      if (type === 'regex')    vars[name] = { type, pattern: old.pattern || '', group: old.group ?? 1, scope: old.scope || '' };
      
      const card = e.target.closest('.var-card');
      card.querySelectorAll('.var-fields').forEach(f => { 
        f.style.display = f.dataset.ftype === type ? '' : 'none'; 
      });
    });
  });

  el.querySelectorAll('.var-builtin-sel').forEach(sel => { 
    sel.addEventListener('change', e => { 
      const n = e.target.dataset.varname; 
      if (vars[n]) { 
        vars[n].builtin = e.target.value; 
        renderVars(); 
      } 
    }); 
  });

  el.querySelectorAll('.var-sel-inp').forEach(inp => { 
    inp.addEventListener('input', e => { 
      const n = e.target.dataset.varname; 
      if (vars[n]) vars[n].selector = e.target.value; 
    }); 
  });

  el.querySelectorAll('.var-sel-pick').forEach(btn => { 
    btn.addEventListener('click', e => startPick(`var-sel:${e.currentTarget.dataset.varname}`)); 
  });

  el.querySelectorAll('.var-pat-inp').forEach(inp => { 
    inp.addEventListener('input', e => { 
      const n = e.target.dataset.varname; 
      if (vars[n]) vars[n].pattern = e.target.value; 
    }); 
  });

  el.querySelectorAll('.var-grp-inp').forEach(inp => { 
    inp.addEventListener('input', e => { 
      const n = e.target.dataset.varname; 
      if (vars[n]) vars[n].group = +e.target.value; 
    }); 
  });

  el.querySelectorAll('.var-scope-inp').forEach(inp => { 
    inp.addEventListener('input', e => { 
      const n = e.target.dataset.varname; 
      if (vars[n]) vars[n].scope = e.target.value; 
    }); 
  });

  el.querySelectorAll('.var-scope-pick').forEach(btn => { 
    btn.addEventListener('click', e => startPick(`var-scope:${e.currentTarget.dataset.varname}`)); 
  });

  el.querySelectorAll('.var-del').forEach(btn => { 
    btn.addEventListener('click', e => { 
      const name = e.currentTarget.dataset.varname; 
      delete vars[name]; 
      varOrder.splice(varOrder.indexOf(name), 1); 
      renderVars(); 
      renderVarChips(); 
    }); 
  });
}

/**
 * Adds a new empty variable to the currently selected email template and
 * re-renders the variables section.
 */
function addVar() { 
  let name = 'var'; 
  let n = 1; 
  while (vars[name]) name = `var_${n++}`; 
  vars[name] = { type: 'builtin', builtin: 'email' }; 
  varOrder.push(name); 
  renderVars(); 
  renderVarChips(); 
}

/**
 * Renders the variable-chip insert buttons in the subject and body fields so
 * that clicking a chip inserts the corresponding `{{variable}}` placeholder
 * at the cursor position.
 */
function renderVarChips() {
  ['subject-var-bar', 'body-var-bar'].forEach(barId => {
    const bar = $(barId);
    if (!bar) return;
    
    bar.querySelectorAll('.var-chip').forEach(c => c.remove());
    bar.querySelectorAll('.var-builtin-group').forEach(c => c.remove());

    const target = barId === 'subject-var-bar' ? 'f-subject' : 'f-body';

    // Output strictly the custom vars defined by the user
    varOrder.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'var-chip';
      chip.textContent = name;
      chip.title = `Insert {{${name}}}`;
      chip.dataset.target = target;
      chip.dataset.insert = `{{${name}}}`;
      bar.appendChild(chip);
    });
  });
}

// wireNoteChips removed — React note editor owns {{date}}/{{time}} hints inline.

// ═══════════════════════════════════════════════════════════════
// TO FIELD
// ═══════════════════════════════════════════════════════════════

/**
 * Shows or hides the To-field sub-form in the email editor based on the
 * currently selected To-field type (auto / literal / selector).
 */
function updateToVisibility() {
  const type  = $('to-type').value;
  const right = $('to-right');
  
  if (type === 'auto') { 
    right.style.display = 'none'; 
  } else { 
    right.style.display = 'flex'; 
    $('to-val').placeholder = type === 'selector' ? 'CSS selector…' : 'fixed@email.com'; 
  }
}

$('to-type').addEventListener('change', updateToVisibility);
$('btn-pick-to').addEventListener('click', () => startPick('to-field'));

// ═══════════════════════════════════════════════════════════════
// PICK MODE
// ═══════════════════════════════════════════════════════════════

/**
 * Initiates the element-picker flow for a variable field. Sends a
 * `startPick` message to the background script and registers a storage
 * listener to apply the picked value when the user clicks an element on the
 * order page.
 * @param {string} fieldId - The ID of the form field to receive the picked selector.
 */
function startPick(fieldId) {
  if (!orderTabId) { 
    alert('No order page found.\n\nOpen an order page tab first, then click the extension popup.'); 
    return; 
  }
  
  $('pick-overlay').classList.add('visible'); 
  chrome.runtime.sendMessage({ action: 'startPick', fieldId });
}

$('btn-cancel-pick').addEventListener('click', () => { 
  $('pick-overlay').classList.remove('visible'); 
  chrome.runtime.sendMessage({ action: 'cancelPick' }); 
});

chrome.storage.onChanged.addListener((changes) => {
  // Keep our in-memory arrays in sync with storage so changes from the
  // React sidebar (folder moves, etc.) don't get clobbered on our next
  // saveTemplates() call.
  if (changes.templates)     templates     = changes.templates.newValue || [];
  if (changes.noteTemplates) noteTemplates = changes.noteTemplates.newValue || [];

  if (!changes.pickResult) return;

  const { fieldId, selector, text } = changes.pickResult.newValue;
  $('pick-overlay').classList.remove('visible');
  applyPick(fieldId, selector, text);
});

/**
 * Applies a picked element's CSS selector and sample text to a variable
 * field in the editor form, converting the variable type to `selector` and
 * populating the selector input.
 * @param {string} fieldId - The ID of the target form field.
 * @param {string} selector - The CSS selector for the picked element.
 * @param {string} text - The text content of the picked element (used for hints).
 */
function applyPick(fieldId, selector, text) {
  const ruleM = fieldId.match(/^rule:(\d+)$/);
  if (ruleM) { 
    const i = +ruleM[1]; 
    if (rules[i]) { 
      rules[i].selector = selector; 
      if (!rules[i].value) rules[i].value = text.slice(0, 60); 
      renderRules(); 
    } 
    return; 
  }
  
  const varSelM = fieldId.match(/^var-sel:(.+)$/);
  if (varSelM) { 
    const name = varSelM[1]; 
    if (vars[name] !== undefined) { 
      vars[name].selector = selector; 
      const inp = document.querySelector(`.var-sel-inp[data-varname="${name}"]`); 
      if (inp) inp.value = selector; 
      const hint = $(`vhint-sel-${name}`); 
      if (hint) { 
        hint.textContent = `"${text.slice(0, 50)}"`; 
        hint.className = 'resolved-hint ok'; 
      } 
    } 
    return; 
  }
  
  const varScopeM = fieldId.match(/^var-scope:(.+)$/);
  if (varScopeM) { 
    const name = varScopeM[1]; 
    if (vars[name] !== undefined) { 
      vars[name].scope = selector; 
      const inp = document.querySelector(`.var-scope-inp[data-varname="${name}"]`); 
      if (inp) inp.value = selector; 
    } 
    return; 
  }
  
  if (fieldId === 'to-field') { 
    $('to-val').value = selector; 
    const hint = $('to-resolved'); 
    if (hint) { 
      hint.textContent = `"${text.slice(0, 50)}"`; 
      hint.className = 'resolved-hint ok'; 
    } 
  }
}

// ═══════════════════════════════════════════════════════════════
// RESOLVED VALUE HINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Sends a `resolveVars` message to the content script with the current
 * editor form state and updates the live-preview hint values displayed next
 * to each variable field.
 */
function refreshHints() {
  if (!orderTabId) return;
  
  const varsToResolve = {}; 
  varOrder.forEach(n => { if (vars[n]) varsToResolve[n] = vars[n]; });
  
  const toType  = $('to-type').value;
  const toField = toType === 'auto' 
    ? { type: 'auto' } 
    : toType === 'selector' 
      ? { type: 'selector', selector: $('to-val').value } 
      : { type: 'literal', value: $('to-val').value };
  
  chrome.scripting.executeScript({ target: { tabId: orderTabId }, files: [
        'theme.js',
        'libs/flatpickr.js',
        'content/notifications.js',
        'content/calendar.js',
        'content/smart-detection.js',
        'content/variable-resolution.js',
        'content/logo-extractor.js',
        'content/charge-modal.js',
        'content/order-edit-modal.js',
        'content/page-utils.js',
        'content/main.js'
      ] }, () => {
    chrome.tabs.sendMessage(orderTabId, { action: 'resolveVars', vars: varsToResolve, toField }, (result) => {
      if (!result) return;
      
      const toH = $('to-resolved'); 
      if (toH) { 
        toH.textContent = result.toEmail ? `"${result.toEmail}"` : ''; 
        toH.className = 'resolved-hint' + (result.toEmail ? ' ok' : ''); 
      }
      
      Object.entries(result.resolved || {}).forEach(([name, val]) => {
        const hint = $(`vhint-sel-${name}`) || $(`vhint-rx-${name}`);
        if (hint) { 
          hint.textContent = val ? `"${val.slice(0, 60)}"` : 'Not found'; 
          hint.className = 'resolved-hint' + (val ? ' ok' : ''); 
        }
      });
      
      rules.forEach((rule, i) => {
        if (!rule.selector) return;
        chrome.tabs.sendMessage(orderTabId, { 
          action: 'resolveVars', 
          vars: { _: { type: 'selector', selector: rule.selector } }, 
          toField: { type: 'literal', value: '' } 
        }, (r) => {
          const h = $(`rule-hint-${i}`); 
          if (!h) return; 
          const v = r?.resolved?._ || ''; 
          h.textContent = v ? `"${v.slice(0, 45)}"` : 'Not found'; 
          h.className = 'resolved-hint' + (v ? ' ok' : '');
        });
      });
    });
  });
}

/**
 * Resolves a set of variables against the live order/account tab and returns
 * the content script's resolved-value map. Used by the React template editor
 * to populate its variable table with live values — the editor window itself
 * has no access to the page DOM.
 * @param {object} varsObj { name: { type, builtin|selector|pattern|value } }
 * @returns {Promise<{ resolved: object, toEmail?: string }>}
 */
function resolveVarsLive(varsObj) {
  return new Promise((resolve) => {
    if (!orderTabId || !varsObj || Object.keys(varsObj).length === 0) {
      resolve({ resolved: {} });
      return;
    }
    chrome.scripting.executeScript({ target: { tabId: orderTabId }, files: [
      'theme.js', 'libs/flatpickr.js', 'content/notifications.js', 'content/calendar.js',
      'content/smart-detection.js', 'content/variable-resolution.js', 'content/logo-extractor.js',
      'content/charge-modal.js', 'content/order-edit-modal.js', 'content/page-utils.js', 'content/main.js'
    ] }, () => {
      void chrome.runtime.lastError;
      chrome.tabs.sendMessage(
        orderTabId,
        { action: 'resolveVars', vars: varsObj, toField: { type: 'auto' } },
        (result) => { void chrome.runtime.lastError; resolve(result || { resolved: {} }); },
      );
    });
  });
}
window.__gbResolveVars = resolveVarsLive;

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATE: SAVE / DELETE
// ═══════════════════════════════════════════════════════════════

/**
 * Reads all email-template form fields and assembles them into a template
 * object ready for storage.
 * @returns {object} The assembled template object.
 */
function collectTemplate() {
  const toType  = $('to-type').value;
  const toField = toType === 'auto' 
    ? { type: 'auto' } 
    : toType === 'selector' 
      ? { type: 'selector', selector: $('to-val').value.trim() } 
      : { type: 'literal', value: $('to-val').value.trim() };
      
  return { 
    id: currentId || uid(), 
    name: $('f-name').value.trim() || 'Untitled', 
    enabled: $('f-enabled').checked, 
    type: $('f-tpl-type')?.value || 'order',
    replyMode: $('f-reply-mode-check')?.checked ? 'reply' : 'standalone',
    presetTaskId: ($('f-tpl-type')?.value === 'account') ? ($('f-preset-task')?.value || '') : undefined,
    rules:             JSON.parse(JSON.stringify(rules)),
    accountConditions: JSON.parse(JSON.stringify(accountConditions)),
    caseRules:  JSON.parse(JSON.stringify(caseRules)),
    caseVars:   JSON.parse(JSON.stringify(caseVars)),
    caseTags:   JSON.parse(JSON.stringify(caseTags)),
    toField, 
    subject: $('f-subject').value, 
    body: _rteStripVarTags($('f-body').innerHTML), 
    vars: JSON.parse(JSON.stringify(vars)), 
    updatedAt: Date.now() 
  };
}

/**
 * Saves the currently edited email template to storage, shows a toast, and
 * refreshes the sidebar.
 * @returns {Promise<void>}
 */
async function saveTemplate() {
  const tpl = collectTemplate(); 
  currentId = tpl.id; 
  varOrder = Object.keys(vars);
  
  const idx = templates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) {
    templates[idx] = tpl; 
  } else {
    templates.push(tpl);
  }
  
  await saveTemplates(); 
  $('ed-title').textContent = tpl.name; 
  show('btn-del'); 
  renderSidebar(); 
  toast('Email template saved');
}

/**
 * Auto-save bridge for the React template editor. Receives a fully-merged
 * template object, upserts it into the templates array by id, and persists
 * it silently — there is no Save button; the editor saves on every change.
 * @param {object} tpl Complete template object built by the React editor.
 * @returns {Promise<void>}
 */
async function applyTemplatePatch(tpl) {
  if (!tpl || !tpl.id) return;
  currentId = tpl.id;
  const idx = templates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) templates[idx] = tpl; else templates.push(tpl);
  await saveTemplates();
  const titleEl = document.getElementById('ed-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
  renderSidebar();
}
window.__gbSaveTemplate = applyTemplatePatch;

/**
 * Getter the React TemplateEditor calls on mount to pick up whatever
 * template editor.js's init() auto-opened before the bridge existed.
 *
 * Race condition: editor.js loads + runs init() before the React
 * bundles register window.__gbOpenTemplate. init() calls openTemplate
 * (which sets currentId and runs the bridge — but the bridge is a
 * no-op because it's not installed yet). When React mounts later it
 * has no template, but openTemplate's early-return guard
 * (`currentId === id && !ed-form.hidden`) blocks the user's first
 * click on that same template. Asking us for the current template at
 * mount time bypasses the race entirely.
 */
window.__gbCurrentTemplate = () => templates.find(t => t.id === currentId) || null;
window.__gbCurrentNote     = () => noteTemplates.find(t => t.id === currentNoteId) || null;

/**
 * Auto-save bridge for the React note-template editor. Same shape as
 * applyTemplatePatch but writes into noteTemplates[].
 * @param {object} tpl Complete note template object from the React editor.
 */
async function applyNotePatch(tpl) {
  if (!tpl || !tpl.id) return;
  currentNoteId = tpl.id;
  const idx = noteTemplates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) noteTemplates[idx] = tpl; else noteTemplates.push(tpl);
  await saveNoteTemplates();
  const titleEl = document.getElementById('ed-note-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
  renderSidebar();
}
window.__gbSaveNote = applyNotePatch;

/**
 * Deletes the currently selected email template after user confirmation,
 * persists the change, and returns the editor to the list view.
 * @returns {Promise<void>}
 */
async function deleteTemplate() {
  if (!currentId) return; 
  if (!(await gbConfirm('Delete this email template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  
  templates = templates.filter(t => t.id !== currentId); 
  await saveTemplates();
  
  currentId = null; 
  hide('ed-form'); 
  show('ed-empty'); 
  animateView('ed-empty');
  renderSidebar();
}

// ═══════════════════════════════════════════════════════════════
// NOTE TEMPLATE: SAVE / DELETE
// ═══════════════════════════════════════════════════════════════

// collectNoteTemplate + saveNoteTemplate removed — React owns note-template
// state and persistence via window.__gbSaveNote (applyNotePatch).

/**
 * Deletes the currently selected note template after user confirmation,
 * persists the change, and returns the editor to the list view.
 * @returns {Promise<void>}
 */
async function deleteNoteTemplate() {
  if (!currentNoteId) return; 
  if (!(await gbConfirm('Delete this note template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  
  noteTemplates = noteTemplates.filter(t => t.id !== currentNoteId); 
  await saveNoteTemplates();
  
  currentNoteId = null; 
  hide('ed-note-form'); 
  show('ed-empty'); 
  animateView('ed-empty');
  renderSidebar();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

/**
 * Bootstraps the editor: loads storage, registers the pick-result listener,
 * auto-opens the first template if one exists, and sets the initial tab.
 * @returns {Promise<void>}
 */
async function init() {
  const data = await loadStorage(); 
  templates = data.templates || []; 
  noteTemplates = data.noteTemplates || []; 
  orderTabId = data.orderTabId || null;
  
  $('btn-save').addEventListener('click', saveTemplate); 
  $('btn-del').addEventListener('click', deleteTemplate);
  
  $('btn-add-rule').addEventListener('click', () => { 
    rules.push({ selector:'', operator:'contains', value:'' }); 
    renderRules(); 
  });
  
  $('btn-add-var').addEventListener('click', addVar);

  // Note-template save/delete buttons removed from DOM; React owns the
  // header. Delete is reachable via React's onDelete → window.deleteNoteTemplate.
  $('btn-new').addEventListener('click', () => {
    if (currentTab === 'email') newTemplate();
    else newNoteTemplate();
  });

  // Cmd-S — email still uses legacy save; note auto-saves so it's a no-op.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (currentTab === 'email' && !$('ed-form')?.classList.contains('hidden')) {
        saveTemplate();
      }
    }
  });

  bindCustomDropdowns(document);
  renderSidebar();
  
  // No auto-open on init. The React editors render an EmptyState until
  // the user picks a row from the sidebar — that keeps the sidebar's
  // "active" highlight always in sync with what the editor is showing.
  // (The previous auto-open created a desync: currentId was set on the
  // first template before the sidebar rendered, but the row's active
  // shading didn't paint, AND the click-to-reopen guard then blocked
  // the user's first click.)
  if (templates.length === 0) {
    ['email','order_number','payment_link','oos_item','recommended_replacement'].forEach(name => {
      vars[name] = { type: 'builtin', builtin: name };
      varOrder.push(name);
    });
  }
}

init();

// ═══════════════════════════════════════════════════════════════
// THEME SETTINGS
// ═══════════════════════════════════════════════════════════════

/** Default values matching theme.js / theme.css. */
const THEME_DEFAULTS = {
  '--gb-brand':              '#6e901d',
  '--gb-brand-dark':         '#5f7d18',
  '--gb-brand-border':       '#4a6b14',
  '--gb-brand-surface':      '#131f0a',
  '--gb-brand-text':         '#d8eeaa',
  '--gb-brand-text-active':  '#e8f8ba',
  '--gb-brand-label':        '#7db82a',
  '--gb-brand-accent':       '#a4ce52',
  '--gb-admin-btn':          '#008000',
  '--gb-admin-btn-saved':    '#004b23',
  '--gb-admin-btn-border':   '#026e23',
  '--gb-page-btn':           '#008000',
  '--gb-page-btn-dark':      '#004b23',
  '--gb-page-btn-saved':     '#004b23',
  '--gb-page-btn-saving':    '#2a2a2a',
  '--gb-page-btn-text':      '#d4ffdc',
  '--gb-page-btn-border':    '#026e23',
  '--gb-surface-void':       '#0a0a0a',
  '--gb-surface-deep':       '#0d0d0d',
  '--gb-surface-base':       '#111111',
  '--gb-surface-mid':        '#141414',
  '--gb-surface-elevated':   '#171717',
  '--gb-surface-raised':     '#1a1a1a',
  '--gb-surface-hover':      '#1e1e1e',
  '--gb-surface-float':      '#222222',
  '--gb-border-subtle':      '#1c1c1c',
  '--gb-border-base':        '#252525',
  '--gb-border-muted':       '#2a2a2a',
  '--gb-border-standard':    '#333333',
  '--gb-border-strong':      '#444444',
  '--gb-text-primary':       '#ffffff',
  '--gb-text-secondary':     '#cccccc',
  '--gb-text-tertiary':      '#aaaaaa',
  '--gb-text-muted':         '#888888',
  '--gb-text-faint':         '#666666',
  '--gb-text-ghost':         '#555555',
};

/**
 * Variables that have corresponding RGB-component vectors.
 * When the base color changes its RGB vector is recomputed automatically.
 * @type {Object.<string,string>}
 */
const RGB_VECTOR_MAP = {
  '--gb-brand':            '--gb-brand-rgb',
  '--gb-brand-label':      '--gb-brand-label-rgb',
  '--gb-admin-btn':        '--gb-admin-rgb',
  '--gb-admin-btn-saved':  '--gb-admin-saved-rgb',
  '--gb-page-btn':         '--gb-page-btn-rgb',
  '--gb-page-btn-saved':   '--gb-page-btn-saved-rgb',
};

/**
 * Built-in theme presets. Each preset supplies a full override map that is
 * merged on top of THEME_DEFAULTS when applied. The `gradient` property is
 * used for the visual preview button (CSS gradient string). `textColor` is
 * the label colour that reads well over that gradient.
 */
const THEME_PRESETS = [
  {
    id: 'olive',
    name: 'Olive',
    sub: 'Default',
    gradient: 'linear-gradient(135deg, #6e901d 0%, #3d5210 100%)',
    textColor: '#d8eeaa',
    colors: {},
  },
  {
    id: 'ocean',
    name: 'Ocean',
    sub: 'Blue',
    gradient: 'linear-gradient(135deg, #1a7fd4 0%, #0d4a8a 100%)',
    textColor: '#b8deff',
    colors: {
      '--gb-brand':         '#1a7fd4',
      '--gb-brand-dark':    '#1669b5',
      '--gb-brand-border':  '#0f4f8c',
      '--gb-brand-surface': '#071828',
      '--gb-brand-text':    '#b8deff',
      '--gb-brand-label':   '#4da6ff',
      '--gb-brand-accent':  '#7ec8ff',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    sub: 'Pink',
    gradient: 'linear-gradient(135deg, #d4437a 0%, #8a1a45 100%)',
    textColor: '#ffd6e8',
    colors: {
      '--gb-brand':         '#d4437a',
      '--gb-brand-dark':    '#b83468',
      '--gb-brand-border':  '#8c1f4e',
      '--gb-brand-surface': '#220a12',
      '--gb-brand-text':    '#ffd6e8',
      '--gb-brand-label':   '#ff80b0',
      '--gb-brand-accent':  '#ffb3cf',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    sub: 'Red',
    gradient: 'linear-gradient(135deg, #c0392b 0%, #6e1010 100%)',
    textColor: '#ffd6d6',
    colors: {
      '--gb-brand':         '#c0392b',
      '--gb-brand-dark':    '#a52b1f',
      '--gb-brand-border':  '#7a1818',
      '--gb-brand-surface': '#1f0808',
      '--gb-brand-text':    '#ffd6d6',
      '--gb-brand-label':   '#ff7a7a',
      '--gb-brand-accent':  '#ffb3b3',
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    sub: 'Purple',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #4a1a9a 100%)',
    textColor: '#e8d6ff',
    colors: {
      '--gb-brand':         '#7c3aed',
      '--gb-brand-dark':    '#6528d4',
      '--gb-brand-border':  '#4a1a9a',
      '--gb-brand-surface': '#130824',
      '--gb-brand-text':    '#e8d6ff',
      '--gb-brand-label':   '#b380ff',
      '--gb-brand-accent':  '#d4b3ff',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    sub: 'Gold',
    gradient: 'linear-gradient(135deg, #d97706 0%, #7c3d00 100%)',
    textColor: '#fff0c0',
    colors: {
      '--gb-brand':         '#d97706',
      '--gb-brand-dark':    '#b86200',
      '--gb-brand-border':  '#8a4500',
      '--gb-brand-surface': '#1c0f00',
      '--gb-brand-text':    '#fff0c0',
      '--gb-brand-label':   '#fbbf24',
      '--gb-brand-accent':  '#fcd34d',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    sub: 'Cyan',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #064e49 100%)',
    textColor: '#b2f5f0',
    colors: {
      '--gb-brand':         '#0d9488',
      '--gb-brand-dark':    '#0a7d72',
      '--gb-brand-border':  '#065f57',
      '--gb-brand-surface': '#021614',
      '--gb-brand-text':    '#b2f5f0',
      '--gb-brand-label':   '#2dd4bf',
      '--gb-brand-accent':  '#5eead4',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    sub: 'Monochrome',
    gradient: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)',
    textColor: '#e2e8f0',
    colors: {
      '--gb-brand':         '#64748b',
      '--gb-brand-dark':    '#4f5f74',
      '--gb-brand-border':  '#334155',
      '--gb-brand-surface': '#0f1520',
      '--gb-brand-text':    '#e2e8f0',
      '--gb-brand-label':   '#94a3b8',
      '--gb-brand-accent':  '#cbd5e1',
    },
  },
];

/**
 * Page-button presets — one entry per main theme preset, matched by ID.
 * Each supplies only the --gb-page-* keys so other vars are untouched.
 * Colors are chosen to blend with the native admin page for each hue.
 */
const PAGE_BTN_PRESETS = {
  olive:   { '--gb-page-btn': '#008000', '--gb-page-btn-dark': '#004b23', '--gb-page-btn-saved': '#004b23', '--gb-page-btn-text': '#d4ffdc', '--gb-page-btn-border': '#026e23' },
  ocean:   { '--gb-page-btn': '#1565c0', '--gb-page-btn-dark': '#0d47a1', '--gb-page-btn-saved': '#0d47a1', '--gb-page-btn-text': '#bbdefb', '--gb-page-btn-border': '#0a3880' },
  rose:    { '--gb-page-btn': '#c2185b', '--gb-page-btn-dark': '#880e4f', '--gb-page-btn-saved': '#880e4f', '--gb-page-btn-text': '#fce4ec', '--gb-page-btn-border': '#6a0039' },
  crimson: { '--gb-page-btn': '#b71c1c', '--gb-page-btn-dark': '#7f0000', '--gb-page-btn-saved': '#7f0000', '--gb-page-btn-text': '#ffcdd2', '--gb-page-btn-border': '#5c0000' },
  violet:  { '--gb-page-btn': '#6a1b9a', '--gb-page-btn-dark': '#4a148c', '--gb-page-btn-saved': '#4a148c', '--gb-page-btn-text': '#e1bee7', '--gb-page-btn-border': '#38006b' },
  amber:   { '--gb-page-btn': '#e65100', '--gb-page-btn-dark': '#bf360c', '--gb-page-btn-saved': '#bf360c', '--gb-page-btn-text': '#fff3e0', '--gb-page-btn-border': '#8d2400' },
  teal:    { '--gb-page-btn': '#00695c', '--gb-page-btn-dark': '#004d40', '--gb-page-btn-saved': '#004d40', '--gb-page-btn-text': '#b2dfdb', '--gb-page-btn-border': '#003830' },
  slate:   { '--gb-page-btn': '#37474f', '--gb-page-btn-dark': '#263238', '--gb-page-btn-saved': '#263238', '--gb-page-btn-text': '#eceff1', '--gb-page-btn-border': '#1c2b31' },
};

/**
 * Returns the ID of the currently-active page-button preset, or 'custom'.
 * @returns {string}
 */
function getActivePagePresetId() {
  const activeMain = getActivePresetId();
  if (activeMain !== 'custom' && PAGE_BTN_PRESETS[activeMain]) {
    const p = PAGE_BTN_PRESETS[activeMain];
    const keys = Object.keys(p);
    if (keys.every(k => (themeColors[k] || THEME_DEFAULTS[k]) === p[k])) return activeMain;
  }
  return 'custom';
}

/**
 * Applies the matching page-button preset when a main preset is applied.
 * Called automatically inside applyPreset.
 * @param {string} presetId - The ID of the main preset being applied.
 */
function applyPagePresetForMain(presetId) {
  const pagePre = PAGE_BTN_PRESETS[presetId];
  if (pagePre) {
    Object.assign(themeColors, pagePre);
    applyAllColorsToDocument(themeColors);
  }
}


function getActivePresetId() {
  for (const preset of THEME_PRESETS) {
    const brandKeys = ['--gb-brand','--gb-brand-dark','--gb-brand-border',
                       '--gb-brand-surface','--gb-brand-text','--gb-brand-label','--gb-brand-accent'];
    const merged = { ...THEME_DEFAULTS, ...preset.colors };
    if (brandKeys.every(k => (themeColors[k] || THEME_DEFAULTS[k]) === merged[k])) return preset.id;
  }
  return 'custom';
}

/**
 * Applies a preset by replacing only the brand-identity keys in themeColors,
 * then updating the document, saving, broadcasting, and refreshing the UI.
 * @param {object} preset - A preset entry from THEME_PRESETS.
 */
function applyPreset(preset) {
  const brandKeys = ['--gb-brand','--gb-brand-dark','--gb-brand-border',
                     '--gb-brand-surface','--gb-brand-text','--gb-brand-label','--gb-brand-accent'];
  if (preset.id === 'olive') {
    brandKeys.forEach(k => { themeColors[k] = THEME_DEFAULTS[k]; });
  } else {
    Object.assign(themeColors, preset.colors);
  }
  applyPagePresetForMain(preset.id);
  applyAllColorsToDocument(themeColors);
  saveThemeColors();
  broadcastThemeToTabs(themeColors);
  renderColorRows();
  updatePresetButtons();
}

/**
 * Refreshes the active/inactive visual state of every preset button.
 */
function updatePresetButtons() {
  const activeId = getActivePresetId();
  document.querySelectorAll('.preset-btn[data-preset-id]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.presetId === activeId);
  });
}

/**
 * Builds and appends the preset button strip to the given container element.
 * @param {HTMLElement} container - The element to render the strip into.
 */
function renderPresets(container) {
  const activeId = getActivePresetId();
  const strip = document.createElement('div');
  strip.className = 'presets-strip';
  strip.innerHTML = '<div class="presets-label">Presets</div><div class="presets-row" id="presets-row"></div>';
  container.appendChild(strip);

  const row = strip.querySelector('#presets-row');
  for (const preset of THEME_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (preset.id === activeId ? ' active' : '');
    btn.dataset.presetId = preset.id;
    btn.innerHTML = `
      <div class="preset-swatch" style="background:${preset.gradient}"></div>
      <div class="preset-label-area">
        <span class="preset-btn-name">${preset.name}</span>
        <span class="preset-btn-sub">${preset.sub}</span>
      </div>`;
    btn.addEventListener('click', () => applyPreset(preset));
    row.appendChild(btn);
  }
}

/**
 * Grouped colour definitions for the settings panel UI. Each group exposes
 * only the primary variables — closely-related derivatives are handled as
 * CSS aliases in theme.js so existing code never breaks.
 */
const THEME_GROUPS = [
  {
    label: 'Theme',
    desc: 'The primary identity colours used for action buttons, highlights, and interactive states throughout every modal.',
    vars: [
      { key: '--gb-brand',         name: 'Primary',        desc: 'Hover and active state for all action buttons, progress indicators, and highlighted selections.' },
      { key: '--gb-brand-dark',    name: 'Default Button',  desc: 'Resting background of every action button before interaction.' },
      { key: '--gb-brand-border',  name: 'Accent Border',   desc: 'Border and focus-ring on themed elements — modal headers, active inputs, and status toasts.' },
      { key: '--gb-brand-surface', name: 'Accent Surface',  desc: 'Deeply-tinted panel background used for themed informational banners and toasts.' },
      { key: '--gb-brand-text',    name: 'Button Text',     desc: 'Text colour on all action buttons.' },
      { key: '--gb-brand-label',   name: 'Highlight Text',  desc: 'Accent text for section labels, badge titles, active tab indicators, and status highlights.' },
      { key: '--gb-brand-accent',  name: 'Secondary Accent',desc: 'Lighter accent used for generated links, selected dropdown items, and URL display text.' },
    ],
  },
  {
    label: 'Backgrounds',
    desc: 'Dark surface layers from the deepest nested area to the most raised interactive element.',
    vars: [
      { key: '--gb-surface-deep',   name: 'Deep',     desc: 'Footers, gallery panel backgrounds, and the darkest inner container areas.' },
      { key: '--gb-surface-base',   name: 'Card',     desc: 'Background of every modal card and injected overlay panel.' },
      { key: '--gb-surface-raised', name: 'Control',  desc: 'Input fields, dropdown controls, and interactive element backgrounds.' },
      { key: '--gb-surface-hover',  name: 'Hover',    desc: 'Background shift when hovering or focusing any input or control.' },
      { key: '--gb-surface-float',  name: 'Float',    desc: 'Most-raised surface — copy buttons, URL boxes, and tab-bar backgrounds.' },
    ],
  },
  {
    label: 'Borders',
    desc: 'Three levels cover section dividers, resting controls, and active focus states.',
    vars: [
      { key: '--gb-border-subtle',   name: 'Divider', desc: 'Hairline lines between sections and inside panel bodies.' },
      { key: '--gb-border-standard', name: 'Control', desc: 'Default border on all inputs, buttons, and interactive controls at rest.' },
      { key: '--gb-border-strong',   name: 'Active',  desc: 'Hover and focus-state borders; also used for muted icon and scrollbar colours.' },
    ],
  },
  {
    label: 'Text',
    desc: 'Four steps from full-contrast headings down to barely-visible placeholder hints.',
    vars: [
      { key: '--gb-text-primary',   name: 'Primary',  desc: 'Headings, modal titles, and all high-emphasis text.' },
      { key: '--gb-text-secondary', name: 'Body',     desc: 'Body copy, dropdown labels, and standard descriptive text.' },
      { key: '--gb-text-muted',     name: 'Label',    desc: 'Section labels, form field captions, and secondary readouts.' },
      { key: '--gb-text-ghost',     name: 'Hint',     desc: 'Placeholder text, barely-visible hints, and disabled state text.' },
    ],
  },
  {
    label: 'Admin Toolbar',
    desc: 'Buttons injected directly onto native admin pages — the Copy button on index pages and the quick-note toolbar buttons inside the order iframe. Styled separately from the main theme so they fit the existing page aesthetic.',
    vars: [
      { key: '--gb-page-btn',       name: 'Button',      desc: 'Base background of injected buttons — the Copy IDs button on index pages and quick-note toolbar buttons.' },
      { key: '--gb-page-btn-dark',  name: 'Button Dark',  desc: 'Darker end of the button gradient, visible at the bottom of each button.' },
      { key: '--gb-page-btn-saved', name: 'Saved State',  desc: 'Background shown on a button after a successful action — note saved, IDs copied.' },
      { key: '--gb-page-btn-text',  name: 'Button Text',  desc: 'Text colour on all injected page buttons.' },
      { key: '--gb-page-btn-border',name: 'Border',       desc: 'Border colour on all injected page buttons.' },
    ],
  },
];

// ── State ────────────────────────────────────────────────────────────────────

/** Currently active theme colours (merged default + saved overrides). */
let themeColors = { ...THEME_DEFAULTS };
/** ID of the debounce timer for auto-save. */
let _themeSaveTimer = null;
/** ID of the debounce timer for broadcast bar hide. */
let _broadcastHideTimer = null;
/** View that was active before opening settings, so we can return to it. */
let _settingsPreviousView = 'ed-empty';

/** Feature flag defaults — keys mirror what content/main.js reads. */
const FEATURE_DEFAULTS = {
  copyIdsEnabled:       true,
  chargeEnabled:        true,
  orderEditEnabled:     true,
  emailPreviewEnabled:  true,
  imagePreviewEnabled:  true,
  calendarEnabled:      true,
  watchListEnabled:     true,
  autoPushEnabled:      true,
  signifydGlowEnabled:  true,
  crmQueryBuilderEnabled: true,
  submitProofEnabled:   true,
  taskListEnabled:      true,
  marginCalcEnabled:    true,
  crmSearchEnabled:     true,
  replyWithTemplateEnabled: false, // send directly via Power Automate
  powerAutomateUrl:         '',    // Power Automate HTTP trigger URL
  phoneFinderEnabled:   true,    // auto-search orders for missing phone numbers on contact pages
  developerMode:        false,
};
/** Currently active feature flags. */
let featureFlags = { ...FEATURE_DEFAULTS };

/**
 * Loads saved feature flags from storage.
 * @returns {Promise<void>}
 */
async function loadFeatureFlags() {
  const data = await chrome.storage.local.get('featureFlags');
  featureFlags = { ...FEATURE_DEFAULTS, ...(data.featureFlags || {}) };
}

/**
 * Saves current feature flags to storage and broadcasts to open tabs.
 */
async function saveFeatureFlags() {
  await chrome.storage.local.set({ featureFlags });
  // Broadcast to order page content scripts
  const tabs = await chrome.tabs.query({ url: ['*://*.golfballs.com/*'] }).catch(() => []);
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'GB_FEATURE_FLAGS', flags: featureFlags }).catch(() => {});
  }
  // Broadcast to any open popup view
  chrome.runtime.sendMessage({ action: 'GB_FEATURE_FLAGS', flags: featureFlags }).catch(() => {});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a 6-digit hex colour string to a comma-separated RGB component
 * string suitable for use in CSS rgba() calls.
 * @param {string} hex - Hex colour string (e.g. '#6e901d').
 * @returns {string|null} Component string like '110, 144, 29', or null if invalid.
 */
function hexToRgbComponents(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null;
}

/**
 * Returns true when the string is a valid 6-digit hex colour.
 * @param {string} v - The string to test.
 * @returns {boolean}
 */
function isValidHex(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * Applies a single CSS custom property to the editor document's root element
 * and automatically updates any associated RGB-component vector.
 * @param {string} varName - The CSS variable name (e.g. '--gb-brand').
 * @param {string} value - The hex value to apply.
 */
function applyColorToDocument(varName, value) {
  document.documentElement.style.setProperty(varName, value);
  const rgbVar = RGB_VECTOR_MAP[varName];
  if (rgbVar) {
    const components = hexToRgbComponents(value);
    if (components) document.documentElement.style.setProperty(rgbVar, components);
  }
}

/**
 * Applies every key/value pair in the given colour map to the document root.
 * @param {Object.<string,string>} colors - Map of variable name to hex value.
 */
function applyAllColorsToDocument(colors) {
  for (const [varName, value] of Object.entries(colors)) {
    applyColorToDocument(varName, value);
  }
}

// ── Broadcast bar ────────────────────────────────────────────────────────────

/**
 * Shows the "Applying to open tabs" status bar at the bottom of the screen
 * for a brief period.
 * @param {string} [msg] - Optional override message.
 */
function showBroadcastBar(msg = 'Theme applied to open tabs') {
  const bar = document.getElementById('broadcast-bar');
  const msgEl = document.getElementById('broadcast-bar-msg');
  if (!bar) return;
  clearTimeout(_broadcastHideTimer);
  if (msgEl) msgEl.textContent = msg;
  bar.classList.add('show');
  _broadcastHideTimer = setTimeout(() => bar.classList.remove('show'), 2500);
}

// ── Storage ──────────────────────────────────────────────────────────────────

/**
 * Loads saved theme overrides from chrome.storage.local and merges them on
 * top of the defaults.
 * @returns {Promise<void>}
 */
async function loadThemeColors() {
  // Theme is owned by the React settings panel (src/lib/theme.js). The old
  // applyAllColorsToDocument() set every legacy token as an INLINE style on
  // <html>; inline styles outrank the new theme.css [data-theme] rules, which
  // is why text stayed white on the light variant. No longer applied here.
  const data = await chrome.storage.local.get('themeColors');
  themeColors = { ...THEME_DEFAULTS, ...(data.themeColors || {}) };
}

/**
 * Persists the current theme to chrome.storage.local (only saves values that
 * differ from the defaults to keep storage lean).
 */
function saveThemeColors() {
  const overrides = {};
  for (const [key, val] of Object.entries(themeColors)) {
    if (val !== THEME_DEFAULTS[key]) overrides[key] = val;
  }
  chrome.storage.local.set({ themeColors: overrides });
}

/** Debounced wrapper around saveThemeColors. */
function debouncedSave() {
  clearTimeout(_themeSaveTimer);
  _themeSaveTimer = setTimeout(saveThemeColors, 600);
}

// ── Broadcast to content-script tabs ─────────────────────────────────────────

/**
 * Queries for all open golfballs.com and admin.icustomize.com tabs and sends
 * each one a GB_APPLY_THEME message so the injected styles update immediately.
 * @param {Object.<string,string>} colors - The full color map to broadcast.
 */
async function broadcastThemeToTabs(colors) {
  let count = 0;
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://*.golfballs.com/*', '*://admin.icustomize.com/*'],
    });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'GB_APPLY_THEME', colors }).catch(() => {});
      count++;
    }
  } catch (_) {}
  if (count > 0) showBroadcastBar(`Theme applied to ${count} open tab${count !== 1 ? 's' : ''}`);
}

// ── Settings panel render ─────────────────────────────────────────────────────

/**
 * Builds and populates the settings panel inside #ed-settings, wiring all
 * color-picker and hex-input interactions.
 */
// ── User Saved Presets ────────────────────────────────────────────────────────

/** @type {Array<{id:string, name:string, colors:object, featureFlags:object, createdAt:number}>} */
let _userPresets = [];

/**
 * Loads saved user presets from chrome.storage.local.
 * @returns {Promise<void>}
 */
async function loadUserPresets() {
  const data = await chrome.storage.local.get('userPresets');
  _userPresets = data.userPresets || [];
}

/**
 * Persists user presets to chrome.storage.local.
 * @returns {Promise<void>}
 */
async function saveUserPresets() {
  await chrome.storage.local.set({ userPresets: _userPresets });
}

/**
 * Saves the complete current extension state as a named preset:
 * themeColors, featureFlags, email templates, and note templates.
 * @param {string} name - Display name for the preset.
 */
async function saveCurrentAsPreset(name) {
  const id = 'up_' + Date.now();
  // Read templates fresh from storage so we always capture the latest saved state
  const stored = await new Promise(res => chrome.storage.local.get(['templates','noteTemplates','caseTemplates'], res));
  _userPresets.push({
    id,
    name: name.trim(),
    colors:        { ...themeColors },
    featureFlags:  { ...featureFlags },
    templates:     stored.templates      || [],
    noteTemplates: stored.noteTemplates  || [],
    caseTemplates: stored.caseTemplates  || [],
    createdAt: Date.now(),
  });
  await saveUserPresets();
}

/**
 * Loads a user preset by ID, restoring themeColors, featureFlags,
 * email templates, and note templates.
 * @param {string} id
 */
async function loadUserPreset(id) {
  const preset = _userPresets.find(p => p.id === id);
  if (!preset) return;

  // ── Colours ────────────────────────────────────────────────────────────────
  themeColors  = { ...THEME_DEFAULTS,  ...preset.colors };
  featureFlags = { ...FEATURE_DEFAULTS, ...preset.featureFlags };
  applyAllColorsToDocument(themeColors);
  saveThemeColors();
  saveFeatureFlags();
  broadcastThemeToTabs(themeColors);

  // ── Templates ──────────────────────────────────────────────────────────────
  if (preset.templates !== undefined) {
    templates = preset.templates;
    await saveTemplates();
  }
  if (preset.noteTemplates !== undefined) {
    noteTemplates = preset.noteTemplates;
    await saveNoteTemplates();
  }
  if (preset.caseTemplates !== undefined) {
    await new Promise(res => chrome.storage.local.set({ caseTemplates: preset.caseTemplates }, res));
  }

  // ── Refresh UI ─────────────────────────────────────────────────────────────
  renderSidebar();
  updateTabCounts();
  renderColorRows();
  updatePresetButtons();
  // Re-render features so toggles reflect loaded flags
  const feat = document.getElementById('settings-features');
  if (feat) { feat.remove(); renderFeaturesSection(document.getElementById('settings-groups')); }
  // Return to the empty state — the sidebar shows the imported preset's
  // templates and the user picks one. (Auto-opening templates[0] caused
  // sidebar/editor desync.)
  currentId = null;
  show('ed-empty');
  hide('ed-form');
  hide('ed-note-form');
  hide('ed-settings');
  animateView('ed-empty');
}

/**
 * Deletes a user preset by ID.
 * @param {string} id
 */
async function deleteUserPreset(id) {
  _userPresets = _userPresets.filter(p => p.id !== id);
  await saveUserPresets();
}

/**
 * Exports a user preset as a downloadable JSON file.
 * @param {string} id
 */
function exportUserPreset(id) {
  const preset = _userPresets.find(p => p.id === id);
  if (!preset) return;
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_theme.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Imports a preset from a JSON file, adds it to the list, and refreshes the UI.
 * @param {File} file
 * @param {function():void} onDone - Called after successful import.
 */
async function importUserPreset(file, onDone) {
  try {
    const text = await file.text();
    const obj  = JSON.parse(text);
    if (!obj.name || !obj.colors) throw new Error('Invalid preset file.');
    // Assign a fresh ID to avoid collisions
    obj.id        = 'up_' + Date.now();
    obj.createdAt = Date.now();
    _userPresets.push(obj);
    await saveUserPresets();
    toast('Preset "' + obj.name + '" imported');
    onDone();
  } catch (e) {
    toast('Import failed: ' + e.message, true);
  }
}

/**
 * Renders the User Preset Manager bar into the settings panel.
 * @param {HTMLElement} container - The element to prepend the bar into.
 */
function renderUserPresetsBar(container) {
  document.getElementById('upc-bar-wrap')?.remove();

  const wrap = document.createElement('div');
  wrap.id = 'upc-bar-wrap';

  // ── Save-as dialog ──────────────────────────────────────────────────────────
  const saveDialog = document.createElement('div');
  saveDialog.className = 'upc-save-dialog';
  saveDialog.id = 'upc-save-dialog';
  saveDialog.innerHTML = `
    <input id="upc-name-input" type="text" placeholder="Name this preset…" maxlength="40">
    <button class="upc-btn primary" id="upc-save-confirm">
      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      Save
    </button>
    <button class="upc-btn" id="upc-save-cancel">Cancel</button>
  `;
  wrap.appendChild(saveDialog);

  // ── Bar ─────────────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'user-presets-bar';

  // Custom dropdown
  const hasPresets = _userPresets.length > 0;
  const ddWrap = document.createElement('div');
  ddWrap.className = 'gb-dropdown-wrap upc-dd-wrap';
  ddWrap.style.cssText = 'flex:1;min-width:0;opacity:' + (hasPresets ? '1' : '.4');
  ddWrap.innerHTML = `
    <button class="gb-dropdown-btn${hasPresets ? '' : ' disabled'}" id="upc-dd-btn"
      ${hasPresets ? '' : 'disabled aria-disabled="true"'} type="button"
      style="${hasPresets ? '' : 'cursor:not-allowed;pointer-events:none'}">
      <span class="gb-btn-label" id="upc-dd-label">${hasPresets ? 'Select a preset…' : 'No saved presets'}</span>
      <svg class="gb-dropdown-chevron" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <div class="gb-dropdown-menu" id="upc-dd-menu"></div>
  `;
  bar.appendChild(ddWrap);

  const loadBtn   = _upcBtn(`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Load`, 'primary', 'Load selected preset');
  const saveBtn   = _upcBtn(`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`, '', 'Save current settings as preset');
  const exportBtn = _upcBtn(`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export`, '', 'Export selected preset as JSON');
  const div1      = Object.assign(document.createElement('div'), { className: 'upc-divider' });
  const deleteBtn = _upcBtn(`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`, 'danger', 'Delete selected preset');
  const importInput = Object.assign(document.createElement('input'), { type:'file', accept:'.json' });
  importInput.style.display = 'none';
  const importBtn = _upcBtn(`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Import`, '', 'Import a preset JSON file');

  bar.appendChild(loadBtn); bar.appendChild(saveBtn); bar.appendChild(exportBtn);
  bar.appendChild(div1);    bar.appendChild(deleteBtn); bar.appendChild(importBtn); bar.appendChild(importInput);
  wrap.appendChild(bar);
  container.prepend(wrap);

  // ── Custom dropdown — same pattern as bindCustomDropdowns ───────────────────
  let _selectedId = null;
  const ddBtn  = ddWrap.querySelector('#upc-dd-btn');
  const ddMenu = ddWrap.querySelector('#upc-dd-menu');
  const ddLbl  = ddWrap.querySelector('#upc-dd-label');

  function _buildMenuItems() {
    ddMenu.innerHTML = '';
    for (const p of _userPresets) {
      const opt = document.createElement('div');
      opt.className = 'gb-dropdown-option' + (p.id === _selectedId ? ' selected' : '');
      opt.dataset.id = p.id;
      const date = new Date(p.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric' });
      opt.textContent = p.name + '  (' + date + ')';
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        _selectedId = p.id;
        ddLbl.textContent = p.name;
        ddMenu.querySelectorAll('.gb-dropdown-option').forEach(o => o.classList.toggle('selected', o.dataset.id === p.id));
        // Close via same mechanism as bindCustomDropdowns
        ddMenu.classList.remove('open');
        ddBtn.classList.remove('open');
      });
      ddMenu.appendChild(opt);
    }
  }

  // Build items immediately so menu is ready before first open
  if (hasPresets) _buildMenuItems();

  ddBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevents the global document click handler from closing it immediately
    if (!hasPresets) return;
    const isOpen = ddMenu.classList.contains('open');
    // Close all other open dropdowns first (matches global handler)
    document.querySelectorAll('.gb-dropdown-menu.open, .gb-dropdown-btn.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
      _buildMenuItems(); // refresh in case presets changed
      ddMenu.classList.add('open');
      ddBtn.classList.add('open');
    }
  });

  // Rebuild helper used by save/delete/import
  wrap._rebuild = () => {
    const hadPresets = !ddBtn.hasAttribute('disabled');
    const nowHas = _userPresets.length > 0;
    if (nowHas !== hadPresets) {
      // Recreate the bar to update disabled state
      renderUserPresetsBar(container);
    } else {
      _buildMenuItems();
    }
  };

  // ── Button wire-up ──────────────────────────────────────────────────────────
  loadBtn.addEventListener('click', async () => {
    if (!_selectedId) { toast('Select a preset to load', true); return; }
    await loadUserPreset(_selectedId);
    toast('Preset loaded');
  });

  saveBtn.addEventListener('click', () => {
    saveDialog.classList.toggle('open');
    if (saveDialog.classList.contains('open')) document.getElementById('upc-name-input')?.focus();
  });

  document.getElementById('upc-save-confirm').addEventListener('click', async () => {
    const name = document.getElementById('upc-name-input').value.trim();
    if (!name) { toast('Enter a preset name', true); return; }
    await saveCurrentAsPreset(name);
    saveDialog.classList.remove('open');
    document.getElementById('upc-name-input').value = '';
    const newId = _userPresets[_userPresets.length - 1].id;
    // Re-render bar to update enabled state if first preset
    renderUserPresetsBar(container);
    // Auto-select the new entry
    const newWrap = document.getElementById('upc-bar-wrap');
    const sel = _userPresets[_userPresets.length - 1];
    newWrap?._setSelected?.(sel.id, sel.name);
    toast('"' + name + '" saved');
  });

  document.getElementById('upc-save-cancel').addEventListener('click', () => {
    saveDialog.classList.remove('open');
    document.getElementById('upc-name-input').value = '';
  });

  document.getElementById('upc-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('upc-save-confirm').click();
    if (e.key === 'Escape') document.getElementById('upc-save-cancel').click();
  });

  exportBtn.addEventListener('click', () => {
    if (!_selectedId) { toast('Select a preset to export', true); return; }
    exportUserPreset(_selectedId);
  });

  deleteBtn.addEventListener('click', async () => {
    if (!_selectedId) { toast('Select a preset to delete', true); return; }
    const p = _userPresets.find(x => x.id === _selectedId);
    if (!p) return;
    if (!(await gbConfirm('Delete "' + p.name + '"?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
    await deleteUserPreset(_selectedId);
    _selectedId = null;
    renderUserPresetsBar(container);
    toast('Preset deleted');
  });

  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    if (!importInput.files[0]) return;
    await importUserPreset(importInput.files[0], () => renderUserPresetsBar(container));
    importInput.value = '';
  });

  // Expose a setter so the save flow can auto-select after re-render
  wrap._setSelected = (id, name) => {
    _selectedId = id;
    if (ddLbl) ddLbl.textContent = name;
  };
}



function _upcBtn(html, extra, title) {
  const b = document.createElement('button');
  b.className = 'upc-btn' + (extra ? ' ' + extra : '');
  b.title = title;
  b.innerHTML = html;
  return b;
}

function renderSettingsPanel() {
  // Settings is now the React bundle (react-dist/content/editor-settings.js),
  // mounted directly into #ed-settings. The legacy builder below is inert.
  return;
  const el = $('ed-settings');
  if (!el) return;

  el.innerHTML = `
    <div class="settings-hdr">
      <div class="settings-hdr-left">
        <button class="btn-back" id="btn-settings-back">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div class="settings-hdr-titles">
          <h2>Theme</h2>
          <div class="settings-hdr-sub">Changes apply instantly here and across all open order tabs.</div>
        </div>
      </div>
      <button class="btn-reset-all" id="btn-reset-all-colors">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
        </svg>
        Reset All
      </button>
    </div>

    <div id="settings-groups"></div>
  `;

  document.getElementById('btn-settings-back').addEventListener('click', closeSettings);
  document.getElementById('btn-reset-all-colors').addEventListener('click', async () => {
    if (!(await gbConfirm('Reset all theme colours to their defaults?', { tone: 'warning', confirmLabel: 'Reset' }))) return;
    themeColors = { ...THEME_DEFAULTS };
    applyAllColorsToDocument(themeColors);
    saveThemeColors();
    broadcastThemeToTabs(themeColors);
    renderColorRows();
    updatePresetButtons();
    toast('Theme reset to defaults');
  });

  const groupsEl = document.getElementById('settings-groups');
  renderUserPresetsBar(groupsEl);
  renderPresets(groupsEl);
  renderFeaturesSection(groupsEl);
  renderColorRows();
  renderDevSection(groupsEl);
}


/**
 * Renders the Features section (toggles for page-injected UI) into the
 * given container element, above the colour groups.
 * @param {HTMLElement} container
 */
function renderFeaturesSection(container) {
  const sec = document.createElement('div');
  sec.id = 'settings-features';
  sec.className = 'color-group';
  sec.innerHTML = `
    <div class="color-group-hdr" style="cursor:default;">
      <span class="color-group-name">Features</span>
      <span class="color-group-desc">Toggle UI elements and configure keyboard shortcuts.</span>
    </div>

    <!-- ── Popup Buttons ── -->
    <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--gb-text-ghost,#555);margin:12px 0 6px;padding:0 2px;">Popup Buttons</div>

    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Charge Card</span>
        <span class="feat-desc">Shows the <strong>Charge Card</strong> / <strong>Refund</strong> button in the popup.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Charge Card button">
        <input type="checkbox" id="feat-charge-check" ${featureFlags.chargeEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Order Edit</span>
        <span class="feat-desc">Shows the <strong>Order Edit</strong> button in the popup.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Order Edit button">
        <input type="checkbox" id="feat-order-edit-check" ${featureFlags.orderEditEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Submit Proof</span>
        <span class="feat-desc">Shows the <strong>Submit Proof</strong> button in the popup on order, contact, and account pages.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Submit Proof button">
        <input type="checkbox" id="feat-submit-proof-check" ${featureFlags.submitProofEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Watch List</span>
        <span class="feat-desc">Shows the <strong>Watch Order</strong> and <strong>Watch List</strong> buttons in the popup for order follow-up with live timers.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Watch List">
        <input type="checkbox" id="feat-watchlist-check" ${featureFlags.watchListEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">My Tasks</span>
        <span class="feat-desc">Shows the <strong>My Tasks</strong> button in the popup. Keyboard shortcut is always active — clear the key below to fully disable it.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the My Tasks popup button">
        <input type="checkbox" id="feat-task-list-check" ${featureFlags.taskListEnabled !== false ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">CRM Search</span>
        <span class="feat-desc">Shows the <strong>CRM Search</strong> button in the popup. Keyboard shortcut is always active — clear the key below to fully disable it.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the CRM Search popup button">
        <input type="checkbox" id="feat-crm-search-check" ${featureFlags.crmSearchEnabled !== false ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>

    <!-- ── Page Enhancements ── -->
    <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--gb-text-ghost,#555);margin:16px 0 6px;padding:0 2px;">Page Enhancements</div>

    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Email Preview</span>
        <span class="feat-desc">Hover over any email row in the <strong>Case Email History</strong> portlet to see a popup preview — no download required.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable email hover preview">
        <input type="checkbox" id="feat-email-preview-check" ${featureFlags.emailPreviewEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Image Viewer</span>
        <span class="feat-desc">Shows a <strong>View Logo</strong> hover button over product logo images on order pages — preview, download, or submit proof without leaving the page.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the image viewer">
        <input type="checkbox" id="feat-image-preview-check" ${featureFlags.imagePreviewEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Copy IDs Button</span>
        <span class="feat-desc">Shows a <strong>Copy</strong> button in the Order List portlet title bar, writing all order IDs as clickable links to the clipboard.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Copy IDs button">
        <input type="checkbox" id="feat-copy-ids-check" ${featureFlags.copyIdsEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Date Picker (Calendar)</span>
        <span class="feat-desc">Enables the <strong>Order Date Manager</strong> calendar modal triggered by quick-note buttons for pushing approval/commitment dates.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the calendar date picker">
        <input type="checkbox" id="feat-calendar-check" ${featureFlags.calendarEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Auto Date Push</span>
        <span class="feat-desc">Shows the auto-push progress notification when a quick-note button with a <strong>daysOut</strong> value is clicked.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable auto date push">
        <input type="checkbox" id="feat-autopush-check" ${featureFlags.autoPushEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Signifyd Fraud Glow</span>
        <span class="feat-desc">Applies a pulsing red glow to the order card when a <strong>SignifydFailed</strong> tag is detected — visual alert for high-risk orders.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable Signifyd fraud highlight">
        <input type="checkbox" id="feat-signifyd-check" ${featureFlags.signifydGlowEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>

    <!-- ── CRM & Tasks ── -->
    <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--gb-text-ghost,#555);margin:16px 0 6px;padding:0 2px;">CRM &amp; Tasks</div>

    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">CRM Query Builder</span>
        <span class="feat-desc">Adds a filter icon inside the <strong>CRM Search</strong> page search bar — opens a visual query builder for complex Solr queries without raw syntax.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the CRM Query Builder">
        <input type="checkbox" id="feat-crm-qb-check" ${featureFlags.crmQueryBuilderEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Margin Calculator</span>
        <span class="feat-desc">Floating, draggable calculator for gross margin, markup %, unit profit, and total profit with a quantity multiplier. Toggle off to disable the keyboard shortcut.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Margin Calculator">
        <input type="checkbox" id="feat-margin-calc-check" ${featureFlags.marginCalcEnabled !== false ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Phone Number Finder</span>
        <span class="feat-desc">When a contact has no phone number on file, automatically scans their order history in the background to find a shipping or billing phone, saves it, and reloads the page. A status badge appears next to the phone field while searching.</span>
      </div>
      <label class="feat-toggle" title="Enable or disable the Phone Number Finder">
        <input type="checkbox" id="feat-phone-finder-check" ${featureFlags.phoneFinderEnabled ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>

    <!-- ── Keyboard Shortcuts ── -->
    <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--gb-text-ghost,#555);margin:16px 0 6px;padding:0 2px;">Keyboard Shortcuts</div>

    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">My Tasks</span>
        <span class="feat-desc">Opens the full-screen task list from any page.</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--gb-text-ghost,#555);">Ctrl +</span>
        <input type="text" id="kb-task-list" maxlength="1"
          style="width:38px;text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 6px;"
          placeholder="X">
      </div>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">Margin Calculator</span>
        <span class="feat-desc">Opens the floating margin calculator from any page.</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--gb-text-ghost,#555);">Ctrl +</span>
        <input type="text" id="kb-margin-calc" maxlength="1"
          style="width:38px;text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 6px;"
          placeholder="M">
      </div>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">CRM Search</span>
        <span class="feat-desc">Opens the full-screen CRM search modal from any page.</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--gb-text-ghost,#555);">Ctrl +</span>
        <input type="text" id="kb-crm-search" maxlength="1"
          style="width:38px;text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 6px;"
          placeholder="K">
      </div>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name">New Contact</span>
        <span class="feat-desc">Opens the quick-create contact modal from any page. Avoid letters Chrome reserves (N&nbsp;=&nbsp;new window, T&nbsp;=&nbsp;new tab, W&nbsp;=&nbsp;close tab, etc.).</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">
        <span style="font-size:11px;color:var(--gb-text-ghost,#555);">Ctrl +</span>
        <input type="text" id="kb-crm-new-contact" maxlength="1"
          style="width:38px;text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 6px;"
          placeholder="Q">
      </div>
    </div>

    <!-- ── Experimental ── -->
    <div style="margin-top:18px;border:1px solid rgba(234,179,8,.2);border-radius:10px;background:rgba(234,179,8,.03);overflow:hidden;">
      <div style="padding:9px 14px 8px;border-bottom:1px solid rgba(234,179,8,.12);display:flex;align-items:center;gap:7px;">
        <svg width="11" height="11" fill="none" stroke="rgba(234,179,8,.75)" stroke-width="2" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:rgba(234,179,8,.75);">Experimental</span>
      </div>
      <div style="padding:12px 14px 4px;">
        <div class="feat-row" style="padding:10px 14px;background:transparent!important;border-color:rgba(234,179,8,.12);">
          <div class="feat-info">
            <span class="feat-name" style="color:rgba(234,179,8,.9);">Direct Send via Power Automate</span>
            <span class="feat-desc" style="color:rgba(234,179,8,.5);">When enabled and a flow URL is set below, the send button becomes <strong style="color:rgba(234,179,8,.7);">Send</strong> and emails go directly through Power Automate — no Outlook window needed.</span>
          </div>
          <label class="feat-toggle" title="Send directly via Power Automate">
            <input type="checkbox" id="feat-reply-template-check" ${featureFlags.replyWithTemplateEnabled ? 'checked' : ''}>
            <span class="feat-slider-amber"></span>
          </label>
        </div>
        <div id="feat-graph-config" style="padding:10px 14px 12px;flex-direction:column;gap:10px;display:${featureFlags.replyWithTemplateEnabled ? 'flex' : 'none'};border-top:1px solid rgba(234,179,8,.08);">
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:11px;color:rgba(234,179,8,.5);min-width:70px;flex-shrink:0;">Flow URL</label>
            <input type="text" id="feat-pa-url"
              style="flex:1;font-size:11px;padding:5px 9px;border-color:rgba(234,179,8,.15);"
              placeholder="https://prod-XX.eastus.logic.azure.com/workflows/…"
              value="${featureFlags.powerAutomateUrl || ''}">
          </div>
          <div style="font-size:9.5px;color:rgba(234,179,8,.35);line-height:1.6;padding-top:8px;border-top:1px solid rgba(234,179,8,.08);">
            In Power Automate: <strong style="color:rgba(234,179,8,.5);">New flow</strong> → <strong style="color:rgba(234,179,8,.5);">When an HTTP request is received</strong> → add a <strong style="color:rgba(234,179,8,.5);">Send an email (V2)</strong> action → save and paste the generated URL above.
          </div>

        </div>
      </div>
    </div>
  `;
  container.appendChild(sec);

  sec.querySelector('#feat-email-preview-check').addEventListener('change', async (e) => {
    featureFlags.emailPreviewEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-image-preview-check').addEventListener('change', async (e) => {
    featureFlags.imagePreviewEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-copy-ids-check').addEventListener('change', async (e) => {
    featureFlags.copyIdsEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-charge-check').addEventListener('change', async (e) => {
    featureFlags.chargeEnabled = e.target.checked;
    await saveFeatureFlags();
  });


  sec.querySelector('#feat-order-edit-check').addEventListener('change', async (e) => {
    featureFlags.orderEditEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-calendar-check').addEventListener('change', async (e) => {
    featureFlags.calendarEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-watchlist-check').addEventListener('change', async (e) => {
    featureFlags.watchListEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-autopush-check').addEventListener('change', async (e) => {
    featureFlags.autoPushEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-signifyd-check').addEventListener('change', async (e) => {
    featureFlags.signifydGlowEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-crm-qb-check').addEventListener('change', async (e) => {
    featureFlags.crmQueryBuilderEnabled = e.target.checked;
    await saveFeatureFlags();
  });

  sec.querySelector('#feat-phone-finder-check')?.addEventListener('change', async (e) => {
    featureFlags.phoneFinderEnabled = e.target.checked;
    await saveFeatureFlags();
  });
  sec.querySelector('#feat-submit-proof-check').addEventListener('change', async (e) => {
    featureFlags.submitProofEnabled = e.target.checked;
    await saveFeatureFlags();
  });

  sec.querySelector('#feat-task-list-check')?.addEventListener('change', async (e) => {
    featureFlags.taskListEnabled = e.target.checked;
    await saveFeatureFlags();
  });

  sec.querySelector('#feat-margin-calc-check')?.addEventListener('change', async (e) => {
    featureFlags.marginCalcEnabled = e.target.checked;
    await saveFeatureFlags();
  });

  sec.querySelector('#feat-crm-search-check')?.addEventListener('change', async (e) => {
    featureFlags.crmSearchEnabled = e.target.checked;
    await saveFeatureFlags();
  });


  sec.querySelector('#feat-reply-template-check')?.addEventListener('change', async (e) => {
    featureFlags.replyWithTemplateEnabled = e.target.checked;
    await saveFeatureFlags();
    // Show/hide the config fields below the toggle
    const config = document.getElementById('feat-graph-config');
    if (config) config.style.display = e.target.checked ? '' : 'none';
  });

  sec.querySelector('#feat-pa-url')?.addEventListener('change', async (e) => {
    featureFlags.powerAutomateUrl = e.target.value.trim();
    await saveFeatureFlags();
  });


  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  // Load saved values
  chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
    const kb = keyboardShortcuts || {};
    const tl  = sec.querySelector('#kb-task-list');
    const mc  = sec.querySelector('#kb-margin-calc');
    const cs  = sec.querySelector('#kb-crm-search');
    const cnc = sec.querySelector('#kb-crm-new-contact');
    if (tl)  tl.value  = (kb.taskList     || 'x').toUpperCase();
    if (mc)  mc.value  = (kb.marginCalc   || 'm').toUpperCase();
    if (cs)  cs.value  = (kb.crmSearch    || 'k').toUpperCase();
    if (cnc) cnc.value = (kb.crmNewContact || 'q').toUpperCase();
  });

  // Save on blur/change; only allow single letters
  ['kb-task-list', 'kb-margin-calc', 'kb-crm-search', 'kb-crm-new-contact'].forEach(id => {
    const el = sec.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.value.replace(/[^a-zA-Z]/g, '');
      el.value = v ? v.slice(-1).toUpperCase() : '';
    });
    el.addEventListener('blur', saveKb);
    el.addEventListener('change', saveKb);
  });

  async function saveKb() {
    const tl  = (sec.querySelector('#kb-task-list')?.value        || 'x').toLowerCase().charAt(0);
    const mc  = (sec.querySelector('#kb-margin-calc')?.value      || 'm').toLowerCase().charAt(0);
    const cs  = (sec.querySelector('#kb-crm-search')?.value       || 'k').toLowerCase().charAt(0);
    const cnc = (sec.querySelector('#kb-crm-new-contact')?.value  || 'q').toLowerCase().charAt(0);
    await chrome.storage.local.set({ keyboardShortcuts: { taskList: tl, marginCalc: mc, crmSearch: cs, crmNewContact: cnc } });
  }
}

/**
 * Renders the Developer section at the very bottom of settings.
 * Contains the dev mode toggle and test-fire buttons for all modals.
 */
function renderDevSection(container) {
  document.getElementById('settings-dev')?.remove();
  document.getElementById('settings-dev-panel')?.remove();

  const isDevOn = !!featureFlags.developerMode;

  // ── Toggle card (always visible, no overflow issues) ──────────────────────
  const devToggle = document.createElement('div');
  devToggle.id = 'settings-dev';
  devToggle.className = 'color-group';
  devToggle.style.cssText = `
    border-color: rgba(var(--gb-brand-label-rgb,125,184,42),.14) !important;
    background: rgba(var(--gb-brand-label-rgb,125,184,42),.02) !important;
    margin-top: 20px !important;
  `;
  devToggle.innerHTML = `
    <div class="color-group-hdr" style="border-bottom:none;cursor:default;">
      <span class="color-group-name" style="display:flex;align-items:center;gap:7px;">
        <svg width="13" height="13" fill="none" stroke="var(--gb-brand-label,#7db82a)" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
        </svg>
        Developer
      </span>
      <span class="color-group-desc">Test-fire modals and notifications on open tabs.</span>
    </div>
    <div class="feat-row">
      <div class="feat-info">
        <span class="feat-name" style="color:var(--gb-brand-label,#7db82a);">Developer Mode</span>
        <span class="feat-desc">Reveals the test console below when active.</span>
      </div>
      <label class="feat-toggle" title="Enable developer mode">
        <input type="checkbox" id="feat-dev-mode-check" ${isDevOn ? 'checked' : ''}>
        <span class="feat-slider"></span>
      </label>
    </div>
  `;
  container.appendChild(devToggle);

  // ── Tools panel — completely separate card, floats in independently ────────
  const devPanel = document.createElement('div');
  devPanel.id = 'settings-dev-panel';
  devPanel.style.cssText = `
    margin-top: 10px;
    opacity: ${isDevOn ? '1' : '0'};
    transform: ${isDevOn ? 'translateY(0)' : 'translateY(-10px)'};
    pointer-events: ${isDevOn ? 'auto' : 'none'};
    transition: opacity .28s ease, transform .3s cubic-bezier(.34,1.3,.64,1);
    display: ${isDevOn ? 'block' : 'none'};
  `;
  devPanel.innerHTML = `
    <div class="color-group" style="border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.1)!important;background:rgba(var(--gb-brand-label-rgb,125,184,42),.015)!important;">
      <div style="padding:14px 14px 6px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--gb-brand-label,#7db82a);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Test Console
        </div>

        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gb-text-muted,#888);margin-bottom:7px;">Notifications</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
          <button class="dev-notif-btn" data-type="info"    data-msg="Info — everything looks normal"  data-dur="4000">
            <span class="dev-btn-dot" style="background:#7db82a;box-shadow:0 0 5px rgba(125,184,42,.5);"></span>Info
          </button>
          <button class="dev-notif-btn" data-type="success" data-msg="Success — action completed"       data-dur="4000">
            <span class="dev-btn-dot" style="background:#52c46a;box-shadow:0 0 5px rgba(82,196,106,.5);"></span>Success
          </button>
          <button class="dev-notif-btn" data-type="error"   data-msg="Error — something went wrong"    data-dur="5000">
            <span class="dev-btn-dot" style="background:#c86060;box-shadow:0 0 5px rgba(200,96,96,.5);"></span>Error
          </button>
          <button class="dev-notif-btn" data-type="loading" data-msg="Loading — simulating progress…"  data-dur="0">
            <span class="dev-btn-dot" style="background:#7db82a;box-shadow:0 0 5px rgba(125,184,42,.5);"></span>Loading
          </button>
        </div>

        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gb-text-muted,#888);margin-bottom:7px;">Modals</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          <button class="dev-notif-btn" data-modal="charge">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
            Charge Card
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">+$12.50 due</span>
          </button>
          <button class="dev-notif-btn" data-modal="charge-refund">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
            Charge — Refund state
            <span style="margin-left:auto;font-size:9px;color:var(--gb-error,#c86060);font-weight:400;">−$12.50</span>
          </button>
          <button class="dev-notif-btn" data-modal="calendar">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Calendar / Date Picker
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">dev mode</span>
          </button>
          <button class="dev-notif-btn" data-modal="image-viewer">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Image / Logo Viewer
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">placeholder</span>
          </button>
          <button class="dev-notif-btn" data-modal="proof-modal">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Submit Proof Modal
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">stub data</span>
          </button>
          <button class="dev-notif-btn" data-modal="email-preview-case">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Email Preview — Case page
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">with sidebar</span>
          </button>
          <button class="dev-notif-btn" data-modal="email-preview-nocase">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Email Preview — No case
            <span style="margin-left:auto;font-size:9px;color:var(--gb-text-ghost,#555);font-weight:400;">no sidebar</span>
          </button>
          <button class="dev-notif-btn" data-modal="watchlist">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Watch List Modal
          </button>
        </div>

        <div style="font-size:9.5px;color:var(--gb-text-ghost,#555);padding-top:10px;border-top:1px solid var(--gb-border-subtle,#1c1c1c);">
          API calls inside modals will fail gracefully — UI is fully visible.
        </div>
      </div>
    </div>
  `;
  container.appendChild(devPanel);

  // Show/hide panel with float animation — no height clipping
  function _showPanel() {
    devPanel.style.display = 'block';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        devPanel.style.opacity = '1';
        devPanel.style.transform = 'translateY(0)';
        devPanel.style.pointerEvents = 'auto';
        updateDevGraphStatus();
      });
    });
  }
  function _hidePanel() {
    devPanel.style.opacity = '0';
    devPanel.style.transform = 'translateY(-10px)';
    devPanel.style.pointerEvents = 'none';
    setTimeout(() => { devPanel.style.display = 'none'; }, 300);
  }

  // Toggle
  devToggle.querySelector('#feat-dev-mode-check').addEventListener('change', async (e) => {
    featureFlags.developerMode = e.target.checked;
    await saveFeatureFlags();
    toast(e.target.checked ? 'Developer mode on' : 'Developer mode off');
    if (e.target.checked) _showPanel(); else _hidePanel();
  });

  if (isDevOn) {
    _showPanel();
  }

  // Notification buttons
  devPanel.querySelectorAll('.dev-notif-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { type, msg, dur } = btn.dataset;
      chrome.tabs.query({}, tabs => tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, { action: 'devFireNotification', type, msg, dur: +dur },
          () => void chrome.runtime.lastError)));
    });
  });

  // Modal buttons
  const DEV_STUBS = {
    charge: {
      action: 'showChargeModal',
      context: { orderId: 'TEST-1234', userId: 'DEV-USER', pageTotal: 87.50, captured: 75.00,
                 apiOrderTotal: 87.50, diffAmount: 12.50, isRefund: false, isZeroDiff: false, chargeRows: [], _devMode: true }
    },
    'charge-refund': {
      action: 'showChargeModal',
      context: { orderId: 'TEST-1234', userId: 'DEV-USER', pageTotal: 75.00, captured: 87.50,
                 apiOrderTotal: 75.00, diffAmount: -12.50, isRefund: true, isZeroDiff: false, chargeRows: [], _devMode: true }
    },
    calendar:            { action: 'devFireModal', modal: 'calendar' },
    'image-viewer':      { action: 'devFireModal', modal: 'image-viewer' },
    'proof-modal':       { action: 'devFireModal', modal: 'proof-modal' },
    'email-preview-case':   { action: 'devFireModal', modal: 'email-preview', isCasePage: true  },
    'email-preview-nocase': { action: 'devFireModal', modal: 'email-preview', isCasePage: false },
    watchlist:           { action: 'showWatchListModal' },
  };

  devPanel.querySelectorAll('.dev-notif-btn[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stub = DEV_STUBS[btn.dataset.modal];
      if (!stub) return;
      chrome.tabs.query({}, tabs => tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, stub, () => void chrome.runtime.lastError)));
    });
  });
}

/**
 * Renders (or re-renders) all colour group sections and rows inside
 * #settings-groups, appended after the presets strip.
 */
function renderColorRows() {
  // Remove any existing group nodes (leave the presets strip, features, and dev sections alone)
  document.querySelectorAll('#settings-groups .color-group:not(#settings-features):not(#settings-dev)').forEach(el => el.remove());
  document.getElementById('settings-dev-panel')?.remove();
  const container = document.getElementById('settings-groups');
  if (!container) return;

  for (const group of THEME_GROUPS) {
    const groupEl = document.createElement('div');
    groupEl.className = 'color-group';
    groupEl.innerHTML = `
      <div class="color-group-hdr">
        <span class="color-group-name">${group.label}</span>
        <span class="color-group-desc">${group.desc}</span>
      </div>
    `;
    for (const varDef of group.vars) {
      const currentVal = themeColors[varDef.key] || THEME_DEFAULTS[varDef.key] || '#000000';
      groupEl.appendChild(buildColorRow(varDef, currentVal));
    }
    container.appendChild(groupEl);
  }
}

// ── Custom colour picker ─────────────────────────────────────────────────────

/** Singleton picker DOM element. */
let _gbPicker = null;
/** Currently registered onChange callback. */
let _gbPickerCb = null;
/** Current HSL state of the picker. */
let _gbPickerH = 0, _gbPickerS = 1, _gbPickerL = 0.5;

/**
 * Converts a hex colour string to HSL components.
 * @param {string} hex
 * @returns {{h:number,s:number,l:number}}
 */
function _gbHexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return { h: h*360, s, l };
}

/**
 * Converts HSL values to a #RRGGBB hex string.
 * @param {number} h - Hue 0-360
 * @param {number} s - Saturation 0-1
 * @param {number} l - Lightness 0-1
 * @returns {string}
 */
function _gbHslToHex(h, s, l) {
  const hue2rgb = (p,q,t) => {
    if (t<0) t+=1; if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  h/=360;
  let r,g,b;
  if (s===0) { r=g=b=l; }
  else {
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}

/**
 * Builds the singleton picker element and appends it to document.body.
 * @returns {HTMLElement}
 */
function _gbBuildPicker() {
  if (_gbPicker) return _gbPicker;
  const p = document.createElement('div');
  p.className = 'gb-cpicker';
  p.id = '__gb-cpicker';
  p.innerHTML = `
    <div class="gb-cp-sl">
      <div class="gb-cp-sl-sat"></div>
      <div class="gb-cp-sl-lum"></div>
      <div class="gb-cp-sl-thumb"></div>
    </div>
    <div class="gb-cp-hue">
      <div class="gb-cp-hue-thumb"></div>
    </div>
    <div class="gb-cp-bottom">
      <div class="gb-cp-preview"></div>
      <input class="gb-cp-hex" maxlength="7" spellcheck="false">
    </div>
  `;
  document.body.appendChild(p);
  _gbPicker = p;

  const sl      = p.querySelector('.gb-cp-sl');
  const slSat   = p.querySelector('.gb-cp-sl-sat');
  const slThumb = p.querySelector('.gb-cp-sl-thumb');
  const hueBar  = p.querySelector('.gb-cp-hue');
  const hueThumb= p.querySelector('.gb-cp-hue-thumb');
  const preview = p.querySelector('.gb-cp-preview');
  const hexIn   = p.querySelector('.gb-cp-hex');

  function _emit() {
    const hex = _gbHslToHex(_gbPickerH, _gbPickerS, _gbPickerL);
    preview.style.background = hex;
    hueThumb.style.background = `hsl(${_gbPickerH},100%,50%)`;
    hexIn.value = hex.toUpperCase();
    hexIn.classList.remove('invalid');
    slSat.style.background = `linear-gradient(to right, #fff, hsl(${_gbPickerH},100%,50%))`;
    // Thumb position: s → x%, (1-l_normalised) → y%
    // In HSL the "lightness" in the box isn't direct — convert: V=L+S*min(L,1-L), then s_hsv=(V-L)/min(V,1-V)
    // Simpler: use SV color model for the box. Convert current HSL → HSV for thumb position.
    const v = _gbPickerL + _gbPickerS * Math.min(_gbPickerL, 1 - _gbPickerL);
    const sv = v === 0 ? 0 : 2 * (1 - _gbPickerL / v);
    slThumb.style.left = (sv * 100) + '%';
    slThumb.style.top  = ((1 - v) * 100) + '%';
    hueThumb.style.left = (_gbPickerH / 360 * 100) + '%';
    if (_gbPickerCb) _gbPickerCb(hex);
  }

  function _slFromEvent(e) {
    const r = sl.getBoundingClientRect();
    const sv = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v  = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    // HSV → HSL
    _gbPickerL = v * (1 - sv / 2);
    _gbPickerS = _gbPickerL === 0 || _gbPickerL === 1 ? 0 : (v - _gbPickerL) / Math.min(_gbPickerL, 1 - _gbPickerL);
    _emit();
  }
  function _hueFromEvent(e) {
    const r = hueBar.getBoundingClientRect();
    _gbPickerH = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360));
    _emit();
  }

  let _drag = null;
  const onMove = e => { if (_drag === 'sl') _slFromEvent(e); else if (_drag === 'hue') _hueFromEvent(e); };
  const onUp   = () => { _drag = null; };

  sl.addEventListener('mousedown',     e => { _drag = 'sl';  _slFromEvent(e);  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, {once:true}); });
  hueBar.addEventListener('mousedown', e => { _drag = 'hue'; _hueFromEvent(e); document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, {once:true}); });

  hexIn.addEventListener('input', () => {
    let v = hexIn.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      hexIn.classList.remove('invalid');
      const hsl = _gbHexToHsl(v);
      _gbPickerH = hsl.h; _gbPickerS = hsl.s; _gbPickerL = hsl.l;
      _emit();
    } else { hexIn.classList.add('invalid'); }
  });
  hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') hexIn.blur(); });

  return p;
}

/**
 * Opens the custom colour picker anchored below/above the given element.
 * @param {HTMLElement} anchor - The swatch element to position relative to.
 * @param {string} initialHex - Starting colour value.
 * @param {function(string):void} onChange - Called with new hex value on every change.
 */
function gbColorPickerOpen(anchor, initialHex, onChange) {
  const p = _gbBuildPicker();

  // If clicking the same swatch while already open → close
  if (p.classList.contains('open') && p._anchor === anchor) {
    gbColorPickerClose();
    return;
  }
  p._anchor = anchor;
  _gbPickerCb = onChange;

  // Set initial HSL from hex
  if (/^#[0-9a-fA-F]{6}$/.test(initialHex)) {
    const hsl = _gbHexToHsl(initialHex);
    _gbPickerH = hsl.h; _gbPickerS = hsl.s; _gbPickerL = hsl.l;
  }

  p.classList.add('open');

  // Position: prefer below anchor, flip above if clips viewport bottom
  const r   = anchor.getBoundingClientRect();
  const pw  = 220, ph = 210;
  let top  = r.bottom + 6;
  let left = r.left;
  if (top + ph > window.innerHeight - 12) top = r.top - ph - 6;
  if (left + pw > window.innerWidth  - 12) left = window.innerWidth - pw - 12;
  p.style.top  = top  + 'px';
  p.style.left = left + 'px';

  // Sync UI to current HSL
  const sl      = p.querySelector('.gb-cp-sl');
  const slSat   = p.querySelector('.gb-cp-sl-sat');
  const slThumb = p.querySelector('.gb-cp-sl-thumb');
  const hueThumb= p.querySelector('.gb-cp-hue-thumb');
  const preview = p.querySelector('.gb-cp-preview');
  const hexIn   = p.querySelector('.gb-cp-hex');

  const hex = _gbHslToHex(_gbPickerH, _gbPickerS, _gbPickerL);
  preview.style.background = hex;
  hueThumb.style.background = `hsl(${_gbPickerH},100%,50%)`;
  hueThumb.style.left = (_gbPickerH / 360 * 100) + '%';
  hexIn.value = hex.toUpperCase();
  slSat.style.background = `linear-gradient(to right, #fff, hsl(${_gbPickerH},100%,50%))`;
  const v  = _gbPickerL + _gbPickerS * Math.min(_gbPickerL, 1 - _gbPickerL);
  const sv = v === 0 ? 0 : 2 * (1 - _gbPickerL / v);
  slThumb.style.left = (sv * 100) + '%';
  slThumb.style.top  = ((1 - v) * 100) + '%';

  // Close on outside click (delayed so this click doesn't immediately close)
  setTimeout(() => {
    document.addEventListener('mousedown', _gbPickerOutside, { once: true });
  }, 0);
}

/**
 * Closes the picker if the click was outside it.
 * @param {MouseEvent} e
 */
function _gbPickerOutside(e) {
  if (_gbPicker && !_gbPicker.contains(e.target)) {
    gbColorPickerClose();
  } else {
    // Re-register since click was inside
    setTimeout(() => document.addEventListener('mousedown', _gbPickerOutside, { once: true }), 0);
  }
}

/**
 * Closes the custom colour picker.
 */
function gbColorPickerClose() {
  if (_gbPicker) { _gbPicker.classList.remove('open'); _gbPicker._anchor = null; }
  _gbPickerCb = null;
}

/**
 * Builds a single colour-row DOM element. The left side is a full-height
 * coloured block that opens the native colour picker on click. The right
 * side has a name, inline hex input, reset button, and a one-line description.
 * @param {{key:string, name:string, desc:string}} varDef - Variable descriptor.
 * @param {string} currentVal - Current hex value for this variable.
 * @returns {HTMLElement} The fully-wired row element.
 */
function buildColorRow(varDef, currentVal) {
  const defaultVal = THEME_DEFAULTS[varDef.key] || '#000000';
  const isCustom   = currentVal !== defaultVal;

  const row = document.createElement('div');
  row.className = 'color-row';
  row.dataset.var = varDef.key;

  row.innerHTML = `
    <div class="cr-swatch-wrap" title="Click to pick colour" tabindex="0" role="button" aria-label="${varDef.name} colour picker">
      <div class="cr-swatch" style="background:${currentVal}"></div>
    </div>
    <div class="cr-body">
      <div class="cr-row1">
        <span class="cr-name">${varDef.name}</span>
        <input type="text" class="cr-hex-input" value="${currentVal.toUpperCase()}"
          maxlength="7" spellcheck="false" aria-label="${varDef.name} colour value">
        <button class="cr-reset ${isCustom ? 'is-modified' : ''}" title="Reset to default (${defaultVal})">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
        </button>
      </div>
      <div class="cr-row2">
        <span class="cr-desc">${varDef.desc}</span>
        <span class="cr-var-pill">${varDef.key}</span>
      </div>
    </div>
  `;

  const swatchEl   = row.querySelector('.cr-swatch');
  const swatchWrap = row.querySelector('.cr-swatch-wrap');
  const hexEl      = row.querySelector('.cr-hex-input');
  const resetBtn   = row.querySelector('.cr-reset');

  /**
   * Applies a new colour value, updates the row UI, the document, debounces
   * save, and schedules a broadcast to open tabs.
   * @param {string} val - Valid 6-digit hex colour string.
   */
  function applyValue(val) {
    themeColors[varDef.key] = val;
    swatchEl.style.background = val;
    hexEl.value    = val.toUpperCase();
    hexEl.classList.remove('invalid');
    resetBtn.classList.toggle('is-modified', val !== defaultVal);
    applyColorToDocument(varDef.key, val);
    debouncedSave();
    clearTimeout(row._bcastTimer);
    row._bcastTimer = setTimeout(() => broadcastThemeToTabs(themeColors), 800);
    updatePresetButtons();
  }

  swatchWrap.addEventListener('click', () => gbColorPickerOpen(swatchWrap, currentVal, applyValue));
  swatchWrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gbColorPickerOpen(swatchWrap, themeColors[varDef.key] || defaultVal, applyValue); } });

  hexEl.addEventListener('input', () => {
    const raw = hexEl.value.trim();
    if (isValidHex(raw)) { hexEl.classList.remove('invalid'); applyValue(raw); }
    else hexEl.classList.add('invalid');
  });
  hexEl.addEventListener('blur', () => {
    if (!isValidHex(hexEl.value.trim())) {
      hexEl.value = (themeColors[varDef.key] || defaultVal).toUpperCase();
      hexEl.classList.remove('invalid');
    }
  });
  hexEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); hexEl.blur(); }
    if ((e.key === 'v') && (e.ctrlKey || e.metaKey)) {
      setTimeout(() => {
        let v = hexEl.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (isValidHex(v)) applyValue(v);
      }, 0);
    }
  });

  resetBtn.addEventListener('click', () => {
    applyValue(defaultVal);
    swatchWrap.classList.add('resetting');
    setTimeout(() => swatchWrap.classList.remove('resetting'), 350);
  });

  return row;
}

/**
 * Opens the settings panel, hiding the currently-visible editor view and
 * recording it so we can restore it on close.
 */
function openSettings() {
  // Find and record current visible view
  const views = ['ed-empty', 'ed-form', 'ed-note-form'];
  _settingsPreviousView = views.find(v => !$(v)?.classList.contains('hidden')) || 'ed-empty';
  views.forEach(v => $(v)?.classList.add('hidden'));

  renderSettingsPanel();
  $('ed-settings')?.classList.remove('hidden');
  $('ed-settings')?.classList.add('view-animate');
}

/**
 * Closes the settings panel and restores the previously-active editor view.
 * Triggers a final save and broadcast to ensure all tabs are up-to-date.
 */
function closeSettings() {
  $('ed-settings')?.classList.add('hidden');
  $(_settingsPreviousView)?.classList.remove('hidden');
  $(_settingsPreviousView)?.classList.add('view-animate');
}

// ── Case Templates Editor ──────────────────────────────────────────────────────

let _caseTpls = [];
let _caseTplPrev = 'ed-empty';
let _caseTplEditId = null;

async function _loadCaseTpls() {
  const d = await new Promise(res => chrome.storage.local.get('templates', res));
  _caseTpls = d.templates || [];
}

async function _saveCaseTpls() {
  await new Promise(res => chrome.storage.local.set({ templates: _caseTpls }, res));
}

function openCaseTplEditor() {
  // The standalone Case Templates panel was retired when case templates
  // were unified into the main editor's type-switcher. The #ed-case-tpls
  // container has no React mount, so showing it would just be a blank
  // white panel. Notify the user instead and stay on the current view.
  if (typeof window.__gbToast === 'object' && typeof window.__gbToast.info === 'function') {
    window.__gbToast.info('Case templates now live in the main editor — switch the template type to "Case".');
  } else {
    console.info('[gb] Case template editor is unified with the main editor. Use the type-switcher.');
  }
}

function closeCaseTplEditor() {
  $('ed-case-tpls')?.classList.add('hidden');
  $(_caseTplPrev)?.classList.remove('hidden');
  $(_caseTplPrev)?.classList.add('view-animate');
  _caseTplEditId = null;
}

async function renderCaseTplPanel() {
  // Case template UI is now the React bundle (react-dist/content/editor-templates.js),
  // mounted directly into #ed-case-tpls. The legacy builder below is inert.
  return;
  await _loadCaseTpls();
  const el = $('ed-case-tpls');
  if (!el) return;

  const isEditing = _caseTplEditId !== null;
  const tpl = isEditing ? _caseTpls.find(t => t.id === _caseTplEditId) : null;
  const isNew = isEditing && !tpl;
  const editing = tpl ? JSON.parse(JSON.stringify(tpl))
    : isNew ? { id: 'ct_' + Date.now(), name:'', enabled:true, subject:'', body:'', rules:[], vars:[] }
    : null;

  el.innerHTML = `
    <div class="settings-hdr">
      <div class="settings-hdr-left">
        <button class="btn-back" id="btn-ctpl-back">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          ${isEditing ? 'Templates' : 'Back'}
        </button>
        <div class="settings-hdr-titles">
          <h2>${isEditing ? (isNew ? 'New Template' : editing.name || 'Edit Template') : 'Case Templates'}</h2>
          <div class="settings-hdr-sub">${isEditing ? 'Match rules, variables, and reply body.' : 'Click-to-use reply templates for case emails.'}</div>
        </div>
      </div>
      ${!isEditing ? `<button class="btn-reset-all" id="btn-ctpl-new" style="background:var(--gb-brand-dark,#5f7d18)!important;color:var(--gb-brand-text,#d8eeaa)!important;border-color:var(--gb-brand-border,#4a6b14)!important">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New
      </button>` : ''}
    </div>
    <div class="settings-scroll" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px">
      ${!isEditing ? _renderCaseTplList() : _renderCaseTplForm(editing)}
    </div>
    ${isEditing ? `
    <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--gb-border-subtle,#1c1c1c);flex-shrink:0">
      <button id="btn-ctpl-save" class="btn-reset-all" style="flex:1;background:var(--gb-brand-dark,#5f7d18)!important;color:var(--gb-brand-text,#d8eeaa)!important;border-color:var(--gb-brand-border,#4a6b14)!important">
        <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
        Save Template
      </button>
      ${tpl ? `<button id="btn-ctpl-del" class="btn-reset-all" style="flex:0;padding:8px 14px;color:var(--gb-error,#c86060)!important;border-color:rgba(200,96,96,.3)!important">Delete</button>` : ''}
    </div>` : ''}
  `;

  // ── Wire back button ──────────────────────────────────────────────────────
  document.getElementById('btn-ctpl-back')?.addEventListener('click', () => {
    if (isEditing) { _caseTplEditId = null; renderCaseTplPanel(); }
    else { closeCaseTplEditor(); }
  });

  if (!isEditing) {
    // ── Wire list buttons ───────────────────────────────────────────────────
    document.getElementById('btn-ctpl-new')?.addEventListener('click', () => {
      // Create a new template pre-typed as 'case' via the main editor
      closeCaseTplEditor();
      newTemplate();
      setTimeout(() => { if ($('f-tpl-type')) { $('f-tpl-type').value = 'case'; } }, 50);
    });
    el.querySelectorAll('[data-ctpl-edit]').forEach(b => {
      b.addEventListener('click', e => {
        const id = e.currentTarget.dataset.ctplEdit;
        closeCaseTplEditor();
        openTemplate(id);
      });
    });
    el.querySelectorAll('[data-ctpl-toggle]').forEach(b => {
      b.addEventListener('click', async e => {
        const t = _caseTpls.find(x => x.id === e.currentTarget.dataset.ctplToggle);
        if (t) { t.enabled = !t.enabled; await _saveCaseTpls(); await _loadCaseTpls(); renderCaseTplPanel(); }
      });
    });
  } else {
    // ── Wire editor form ────────────────────────────────────────────────────
    const getForm = () => {
      editing.name    = el.querySelector('#ctpl-name')?.value.trim()    || '';
      editing.subject = el.querySelector('#ctpl-subject')?.value        || '';
      editing.body    = el.querySelector('#ctpl-body')?.value           || '';
      editing.enabled = el.querySelector('#ctpl-enabled')?.checked !== false;
      // rules and vars are updated live via their event listeners
      return editing;
    };

    // Rules
    function wireRuleRow(row, i) {
      row.querySelector('[data-rf]')?.addEventListener('change', e => { editing.rules[i].field = e.target.value; });
      row.querySelector('[data-ro]')?.addEventListener('change', e => { editing.rules[i].op    = e.target.value; });
      row.querySelector('[data-rv]')?.addEventListener('input',  e => { editing.rules[i].value = e.target.value; });
      row.querySelector('[data-rdel]')?.addEventListener('click', () => {
        editing.rules.splice(i, 1);
        _rerenderRules();
      });
    }
    function _rerenderRules() {
      const container = el.querySelector('#ctpl-rules-list');
      if (!container) return;
      container.innerHTML = editing.rules.map((r, i) => _ruleRowHtml(r, i)).join('');
      container.querySelectorAll('.ctpl-rule-row').forEach((row, i) => wireRuleRow(row, i));
    }
    el.querySelector('#ctpl-rules-list')?.querySelectorAll('.ctpl-rule-row').forEach((row, i) => wireRuleRow(row, i));
    el.querySelector('#btn-ctpl-add-rule')?.addEventListener('click', () => {
      editing.rules.push({ field:'from', op:'contains', value:'' });
      _rerenderRules();
    });

    // Vars
    function wireVarRow(row, i) {
      row.querySelector('[data-vn]')?.addEventListener('input',  e => { editing.vars[i].name  = e.target.value; });
      row.querySelector('[data-vf]')?.addEventListener('change', e => { editing.vars[i].field  = e.target.value; });
      row.querySelector('[data-vr]')?.addEventListener('input',  e => { editing.vars[i].regex = e.target.value; });
      row.querySelector('[data-vdel]')?.addEventListener('click', () => {
        editing.vars.splice(i, 1);
        _rerenderVars();
      });
    }
    function _rerenderVars() {
      const container = el.querySelector('#ctpl-vars-list');
      if (!container) return;
      container.innerHTML = editing.vars.map((v, i) => _varRowHtml(v, i)).join('');
      container.querySelectorAll('.ctpl-var-row').forEach((row, i) => wireVarRow(row, i));
    }
    el.querySelector('#ctpl-vars-list')?.querySelectorAll('.ctpl-var-row').forEach((row, i) => wireVarRow(row, i));
    el.querySelector('#btn-ctpl-add-var')?.addEventListener('click', () => {
      editing.vars.push({ name:'', field:'body', regex:'' });
      _rerenderVars();
    });

    // Save
    document.getElementById('btn-ctpl-save')?.addEventListener('click', async () => {
      const data = getForm();
      if (!data.name) { el.querySelector('#ctpl-name')?.focus(); return; }
      const idx = _caseTpls.findIndex(t => t.id === data.id);
      if (idx >= 0) _caseTpls[idx] = data;
      else _caseTpls.push(data);
      await _saveCaseTpls();
      _caseTplEditId = null;
      renderCaseTplPanel();
    });

    // Delete
    document.getElementById('btn-ctpl-del')?.addEventListener('click', async () => {
      if (!(await gbConfirm('Delete this template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
      _caseTpls = _caseTpls.filter(t => t.id !== editing.id);
      await _saveCaseTpls();
      _caseTplEditId = null;
      renderCaseTplPanel();
    });
  }
}

function _renderCaseTplList() {
  const caseTpls = _caseTpls.filter(t => t.type === 'case');
  if (!caseTpls.length) return `
    <div style="text-align:center;padding:32px 16px;color:var(--gb-text-muted,#888);font-size:13px;line-height:1.7">
      <div style="font-size:28px;margin-bottom:10px;opacity:.3">✉</div>
      <strong style="color:var(--gb-text-secondary,#ccc);display:block;margin-bottom:6px">No case templates yet</strong>
      Click <strong style="color:var(--gb-text-secondary,#ccc)">New</strong> to create one. Set its type to <strong style="color:var(--gb-text-secondary,#ccc)">Case</strong> and it will appear in the email modal dropdown.
    </div>`;

  return caseTpls.map(t => `
    <div style="background:var(--gb-surface-raised,#1a1a1a);border:1px solid var(--gb-border-standard,#333);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:${t.enabled!==false?'var(--gb-text-secondary,#ccc)':'var(--gb-text-muted,#888)'};margin-bottom:3px">${esc(t.name||'Untitled')}</div>
        <div style="font-size:11px;color:var(--gb-text-muted,#888)">${(t.rules||[]).length} rule${(t.rules||[]).length!==1?'s':''} · ${(t.vars||[]).length} var${(t.vars||[]).length!==1?'s':''}</div>
      </div>
      <button data-ctpl-toggle="${esc(t.id)}" style="background:${t.enabled!==false?'rgba(var(--gb-brand-label-rgb,125,184,42),.12)':'var(--gb-surface-hover,#1e1e1e)'};border:1px solid ${t.enabled!==false?'rgba(var(--gb-brand-label-rgb,125,184,42),.3)':'var(--gb-border-standard,#333)'};border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;color:${t.enabled!==false?'var(--gb-brand-label,#7db82a)':'var(--gb-text-muted,#888)'};cursor:pointer;font-family:inherit">
        ${t.enabled!==false?'Enabled':'Disabled'}
      </button>
      <button data-ctpl-edit="${esc(t.id)}" style="background:var(--gb-surface-hover,#1e1e1e);border:1px solid var(--gb-border-standard,#333);border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--gb-text-muted,#888);cursor:pointer;font-family:inherit">Edit</button>
    </div>
  `).join('');
}

function _ruleRowHtml(r, i) {
  const fOpts = ['from','subject','body'].map(f => `<option value="${f}" ${r.field===f?'selected':''}>${f}</option>`).join('');
  const oOpts = (window.__gbCaseTemplates?.OPS || ['contains','equals','starts with','ends with','not contains','matches regex'])
    .map(o => `<option value="${o}" ${r.op===o?'selected':''}>${o}</option>`).join('');
  return `<div class="ctpl-rule-row" style="display:grid;grid-template-columns:80px 120px 1fr 26px;gap:6px;align-items:center">
    <select data-rf class="custom-select-raw" style="font-size:11px;padding:5px 6px">${fOpts}</select>
    <select data-ro class="custom-select-raw" style="font-size:11px;padding:5px 6px">${oOpts}</select>
    <input data-rv type="text" class="form-inp" value="${esc(r.value||'')}" placeholder="value…" style="font-size:11px;padding:5px 7px">
    <button data-rdel style="background:none;border:none;color:var(--gb-text-muted,#888);cursor:pointer;font-size:17px;line-height:1;padding:0;width:22px" title="Remove">×</button>
  </div>`;
}

function _varRowHtml(v, i) {
  const fOpts = ['from','subject','body'].map(f => `<option value="${f}" ${v.field===f?'selected':''}>${f}</option>`).join('');
  return `<div class="ctpl-var-row" style="display:grid;grid-template-columns:100px 70px 1fr 26px;gap:6px;align-items:center">
    <input data-vn type="text" class="form-inp" value="${esc(v.name||'')}" placeholder="varName" style="font-size:11px;padding:5px 7px;font-family:monospace;color:var(--gb-brand-label,#7db82a)">
    <select data-vf class="custom-select-raw" style="font-size:11px;padding:5px 6px">${fOpts}</select>
    <input data-vr type="text" class="form-inp" value="${esc(v.regex||'')}" placeholder="regex — group 1 extracted" style="font-size:11px;padding:5px 7px">
    <button data-vdel style="background:none;border:none;color:var(--gb-text-muted,#888);cursor:pointer;font-size:17px;line-height:1;padding:0;width:22px" title="Remove">×</button>
  </div>`;
}

function _renderCaseTplForm(t) {
  return `
    <div>
      <div class="color-group-hdr"><span class="color-group-name">Details</span></div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-bottom:10px">
        <input id="ctpl-name" class="form-inp" type="text" value="${esc(t.name)}" placeholder="Template name…" style="font-size:13px;padding:8px 10px">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none">
          <span style="font-size:11px;color:var(--gb-text-muted,#888)">Enabled</span>
          <div class="feat-toggle" style="position:relative;display:inline-block;width:40px;height:22px">
            <input type="checkbox" id="ctpl-enabled" ${t.enabled!==false?'checked':''} style="opacity:0;width:0;height:0">
            <span class="feat-slider"></span>
          </div>
        </label>
      </div>
      <div style="margin-bottom:10px">
        <div class="color-group-name" style="margin-bottom:5px;font-size:9.5px">Subject <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--gb-text-ghost,#555)">— supports {{vars}} · blank = auto RE:</span></div>
        <input id="ctpl-subject" class="form-inp" type="text" value="${esc(t.subject||'')}" placeholder="RE: {{subject}}" style="font-size:13px;padding:8px 10px;width:100%;box-sizing:border-box">
      </div>
      <div>
        <div class="color-group-name" style="margin-bottom:5px;font-size:9.5px">Body <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--gb-text-ghost,#555)">— supports {{vars}}</span></div>
        <textarea id="ctpl-body" class="form-inp" rows="6" placeholder="Hello {{customerName}},\n\nThank you for contacting us..." style="font-size:13px;padding:8px 10px;width:100%;box-sizing:border-box;resize:vertical;line-height:1.5">${esc(t.body||'')}</textarea>
      </div>
    </div>

    <div>
      <div class="color-group-hdr"><span class="color-group-name">Match Rules</span><span class="color-group-desc">All rules must pass to consider this template matched.</span></div>
      <div id="ctpl-rules-list" style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px">
        ${t.rules.map((r,i) => _ruleRowHtml(r,i)).join('')}
      </div>
      <button id="btn-ctpl-add-rule" class="btn-reset-all" style="width:100%;padding:8px;font-size:12px;border-style:dashed">+ Add Rule</button>
    </div>

    <div>
      <div class="color-group-hdr"><span class="color-group-name">Variables</span><span class="color-group-desc">Extract values from the email using regex. Use {{name}} in subject/body.</span></div>
      <div style="display:grid;grid-template-columns:100px 70px 1fr 26px;gap:6px;margin-bottom:5px">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gb-text-muted,#888)">Name</span>
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gb-text-muted,#888)">From</span>
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gb-text-muted,#888)">Regex pattern</span>
        <span></span>
      </div>
      <div id="ctpl-vars-list" style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px">
        ${t.vars.map((v,i) => _varRowHtml(v,i)).join('')}
      </div>
      <button id="btn-ctpl-add-var" class="btn-reset-all" style="width:100%;padding:8px;font-size:12px;border-style:dashed">+ Add Variable</button>
    </div>
  `;
}

// ── Case Template: rules & vars against email fields ─────────────────────────

const CASE_FIELDS = [
  { value: 'from',    label: 'From (sender address)' },
  { value: 'subject', label: 'Subject line'          },
  { value: 'body',    label: 'Email body'            },
];

const CASE_OPS = [
  'contains', 'equals', 'starts with', 'ends with', 'not contains', 'matches regex'
];

// All case categories and their subcategories — mirrors _CASE_CATS in email-preview.js
const CASE_CATS_EDITOR = {
  'Order Status Update':          ['Lost Package','Carrier Issue','Tracking Update','Out of Stock','Drop Ships','Late Ship','Misunderstanding'],
  'Place an Order':               [],
  'Product Inquiry':              ['Sale Made - Yes','Sale Made - No'],
  'Transfer':                     ['Custom Logo','Retail','Human Resources','Direct Transfer'],
  'Returns/Reprint':              ['Wrong Item Ordered (Customer Error)','Wrong Item Shipped (GBC Error)','Shipped qty error (GBC error)','Drop Ship Error (Man. Error)','Drop Ship Error (GBC Error)','Manufacture Error/Defect','Lost in Transit (Courier Error)','Printing Defects - GBC PRODUCTION (BOH Error)','Printing Defects - GBC CSR Error','Printing Defects - Customer Error','Incorrect Product Customized','Production Defects','Quality of Print','Damaged Package Courier Error'],
  'Charge Error':                 ['Fixed - System did not charge','Fixed - System failed to attach charge','Actual Charge Error - Resolved by Customer','Actual Charge Error - Resolved by CSR','Fraud','Card did not populate'],
  'Fraud Inquiry':                [],
  'International Orders':         [],
  'Profanity':                    [],
  'Order Change':                 ['Quantity','Personalization Edit','Shipping Address','Billing Address Change','Shipping Method Change','Product Change','Payment Method','System Error'],
  'Cancelation':                  ['Out of Stock','Customer Changed Mind','Delivery Delays','Expected Delivery Date Changed','Alternative available found better price','Alternative available found better quality','Subscribe and Score'],
  'Website Concerns':             ['User Experience','Cannot Load cart','Cannot Login','Cannot Check out','Subscribe and Score','Cannot Cancel Order','Site Navigation','Promo Codes','Price Variance','Shipping Address would not populate','PO Box'],
  'General Inquiry':              ['Shipping options available','General website guidance / use'],
  'CSAT':                         ['CSAT Note','Detractor'],
  'Other - Details must be provided': [],
};

/**
 * Renders the case tag rows into #case-tags-list.
 * Each tag = a category + optional subcategory from CASE_CATS_EDITOR.
 */
function renderCaseTags() {
  const el = $('case-tags-list');
  if (!el) return;
  el.innerHTML = '';

  caseTags.forEach((tag, i) => {
    const card = document.createElement('div');
    card.className = 'var-card';

    const catOpts  = Object.keys(CASE_CATS_EDITOR)
      .map(c => `<option value="${esc(c)}" ${tag.category===c?'selected':''}>${esc(c)}</option>`)
      .join('');
    const subs     = CASE_CATS_EDITOR[tag.category] || [];
    const subOpts  = subs.length
      ? subs.map(s => `<option value="${esc(s)}" ${tag.subcategory===s?'selected':''}>${esc(s)}</option>`).join('')
      : `<option value="" disabled>(no subcategories)</option>`;

    card.innerHTML = `
      <div class="var-top">
        <select class="case-tag-cat custom-select-raw" data-i="${i}" style="flex:1.4">${catOpts}</select>
        <select class="case-tag-sub custom-select-raw" data-i="${i}" style="flex:1.8">${subOpts}</select>
        <button class="btn-icon case-tag-del" data-i="${i}" title="Remove" style="flex:none!important;width:26px!important;min-width:26px!important;height:26px!important;padding:0!important;flex-shrink:0!important">${DEL_SVG}</button>
      </div>`;
    el.appendChild(card);
  });

  bindCustomDropdowns(el);

  el.querySelectorAll('.case-tag-cat').forEach(s => s.addEventListener('change', e => {
    const i = +e.target.dataset.i;
    caseTags[i].category    = e.target.value;
    caseTags[i].subcategory = (CASE_CATS_EDITOR[e.target.value]||[])[0] || '';
    renderCaseTags();
  }));
  el.querySelectorAll('.case-tag-sub').forEach(s => s.addEventListener('change', e => {
    caseTags[+e.target.dataset.i].subcategory = e.target.value;
  }));
  el.querySelectorAll('.case-tag-del').forEach(b => b.addEventListener('click', e => {
    caseTags.splice(+e.currentTarget.dataset.i, 1);
    renderCaseTags();
  }));
}

/**
 * Shows/hides DOM-rule sections vs case-rule sections based on template type.
 * 'order' and 'account' both use DOM-matching rules; 'case' uses email-field rules.
 * @param {'order'|'account'|'email'|'case'} type
 */
function switchTemplateType(type) {
  // 'email' is a legacy alias for 'order'
  const isCase    = type === 'case';
  const isAccount = type === 'account';
  const toggle = (id, show) => { const el = $(id); if (el) el.classList.toggle('hidden', !show); };

  toggle('callout-email',        !isCase);
  toggle('callout-case',          isCase);
  toggle('sec-reply-mode',        !isCase);
  toggle('sec-email-rules',      !isCase);
  toggle('sec-case-rules',        isCase);
  toggle('sec-email-recipient',  !isCase);
  toggle('sec-email-vars',       !isCase);
  toggle('sec-case-vars',         isCase);
  toggle('sec-case-tags',         isCase);

  // Show/hide account conditions section
  const accCondSec = $('sec-account-conditions');
  if (accCondSec) accCondSec.classList.toggle('hidden', !isAccount);
  if (isAccount) renderAccountConditions();

  // Show preset task dropdown only for account templates
  const presetSec = $('sec-preset-task');
  if (presetSec) presetSec.style.display = isAccount ? '' : 'none';

  if (isCase) { renderCaseRules(); renderCaseVars(); renderCaseTags(); }
  else        { renderRules();     renderVars();     }
}

/**
 * Renders the case-type match rules into #case-rules-list.
 * Each rule has: field (from/subject/body) | operator | value text input.
 */
function renderCaseRules() {
  const el = $('case-rules-list');
  if (!el) return;
  el.innerHTML = '';

  caseRules.forEach((rule, i) => {
    const card = document.createElement('div');
    card.className = 'rule-card';

    const fieldOpts = CASE_FIELDS
      .map(f => `<option value="${f.value}" ${rule.field===f.value?'selected':''}>${f.label}</option>`)
      .join('');
    const opOpts = CASE_OPS
      .map(o => `<option value="${o}" ${rule.op===o?'selected':''}>${o}</option>`)
      .join('');

    card.innerHTML = `
      <div class="rule-top">
        <select class="case-rule-field custom-select-raw" data-i="${i}" style="flex:1.4">
          ${fieldOpts}
        </select>
        <select class="case-rule-op custom-select-raw" data-i="${i}" style="flex:1.2">
          ${opOpts}
        </select>
        <input type="text" class="case-rule-val rule-val" data-i="${i}"
          value="${esc(rule.value||'')}" placeholder="value…" style="flex:2">
        <button class="btn-icon case-rule-del" data-i="${i}" title="Remove" style="flex:none!important;width:26px!important;min-width:26px!important;height:26px!important;padding:0!important;flex-shrink:0!important">${DEL_SVG}</button>
      </div>`;
    el.appendChild(card);
  });

  bindCustomDropdowns(el);

  el.querySelectorAll('.case-rule-field').forEach(s =>
    s.addEventListener('change', e => { caseRules[+e.target.dataset.i].field = e.target.value; }));
  el.querySelectorAll('.case-rule-op').forEach(s =>
    s.addEventListener('change', e => { caseRules[+e.target.dataset.i].op = e.target.value; }));
  el.querySelectorAll('.case-rule-val').forEach(inp =>
    inp.addEventListener('input', e => { caseRules[+e.target.dataset.i].value = e.target.value; }));
  el.querySelectorAll('.case-rule-del').forEach(b =>
    b.addEventListener('click', e => { caseRules.splice(+e.currentTarget.dataset.i, 1); renderCaseRules(); }));
}

/**
 * Renders the case-type variable rows into #case-vars-list.
 * Each var has: name | source field (from/subject/body) | regex pattern | capture group.
 */
function renderCaseVars() {
  const el = $('case-vars-list');
  if (!el) return;
  el.innerHTML = '';

  caseVars.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'var-card';

    const fieldOpts = CASE_FIELDS
      .map(f => `<option value="${f.value}" ${v.field===f.value?'selected':''}>${f.label}</option>`)
      .join('');

    card.innerHTML = `
      <div class="var-top">
        <input type="text" class="var-name-inp case-var-name" data-i="${i}"
          value="${esc(v.name||'')}" placeholder="variable_name"
          style="font-family:monospace;font-weight:bold;flex:1">
        <button class="btn-icon case-var-del" data-i="${i}" title="Remove" style="flex:none!important;width:26px!important;min-width:26px!important;height:26px!important;padding:0!important;flex-shrink:0!important">${DEL_SVG}</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1.8fr 50px;gap:8px;margin-top:6px;align-items:center">
        <select class="case-var-field custom-select-raw" data-i="${i}">
          ${fieldOpts}
        </select>
        <input type="text" class="case-var-pat rule-val" data-i="${i}"
          value="${esc(v.pattern||'')}" placeholder="regex, e.g. Order #(\\d+)"
          style="font-family:monospace;font-size:11px">
        <input type="number" class="case-var-grp rule-val" data-i="${i}"
          value="${v.group??1}" min="0" placeholder="grp"
          title="Capture group (0 = full match)" style="text-align:center">
      </div>
      <div class="resolved-hint" id="cvar-hint-${i}" style="margin-top:4px"></div>`;

    el.appendChild(card);
  });

  bindCustomDropdowns(el);

  el.querySelectorAll('.case-var-name').forEach(inp =>
    inp.addEventListener('input', e => { caseVars[+e.target.dataset.i].name = e.target.value; }));
  el.querySelectorAll('.case-var-field').forEach(s =>
    s.addEventListener('change', e => { caseVars[+e.target.dataset.i].field = e.target.value; }));
  el.querySelectorAll('.case-var-pat').forEach(inp =>
    inp.addEventListener('input', e => { caseVars[+e.target.dataset.i].pattern = e.target.value; }));
  el.querySelectorAll('.case-var-grp').forEach(inp =>
    inp.addEventListener('input', e => { caseVars[+e.target.dataset.i].group = parseInt(e.target.value)||0; }));
  el.querySelectorAll('.case-var-del').forEach(b =>
    b.addEventListener('click', e => { caseVars.splice(+e.currentTarget.dataset.i, 1); renderCaseVars(); }));
}

// ── Case Template: Bootstrap ──────────────────────────────────────────────────

// Type selector — swap between email and case sections when changed
function populatePresetTaskDropdown(selectedId = '') {
  const sel = $('f-preset-task');
  if (!sel) return;
  
  const tasks = noteTemplates.filter(t => t.subType === 'task');
  sel.innerHTML = '<option value="">— none —</option>';
  
  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name || 'Untitled task';
    if (t.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
  
  if (selectedId) sel.value = selectedId;

  // FIX: Unbind the old custom dropdown and rebuild it with the new options
  const existingWrap = sel.nextElementSibling;
  if (existingWrap && existingWrap.classList.contains('gb-dropdown-wrap')) {
    existingWrap.remove(); // Destroy the old UI
    delete sel.dataset.bound; // Reset the binding flag
  }
  
  // Re-bind to generate the new UI elements based on the updated <select>
  bindCustomDropdowns(sel.parentNode);
  syncDropdown(sel); // Ensure the visible label matches the current selection
}

document.getElementById('f-tpl-type')?.addEventListener('change', e => {
  switchTemplateType(e.target.value);
  renderVars(); // <--- Refresh variable dropdowns to show context-specific built-ins
  if (e.target.value === 'account') populatePresetTaskDropdown();
});

// switchNoteSubType + fn-sub-type listener removed — React Segmented switcher
// in NoteEditor owns subtype state and renders subtype-specific sections.


// ── Account Conditions ─────────────────────────────────────────────────────────

const ACC_FIELDS = [
  { key: 'orderCount_i',        label: 'Order Count',         type: 'int'  },
  { key: 'lastOrderDate_dt',    label: 'Last Order Date',     type: 'date' },
  { key: 'priorYearRevenue_f',  label: 'Prior Year Revenue',  type: 'float'},
  { key: 'yearToDateRevenue_f', label: 'YTD Revenue',         type: 'float'},
  { key: 'lastEmailDate_dt',    label: 'Last Email Date',     type: 'date' },
  { key: 'createDate_dt',       label: 'Creation Date',       type: 'date' },
  { key: 'salesRep_s',          label: 'Sales Rep (Strict)',  type: 'text' },
  { key: 'nextTaskDate_dt',     label: 'Next Task Date',      type: 'date' },
  
  // Add your built-in variables here:
  { key: 'nextTaskName',        label: 'Tasks: Next Task Name', type: 'text' },
  { key: 'salesRep',            label: 'Account: Sales Rep',    type: 'text' },
  { key: 'firstName',           label: 'Contact: First Name',   type: 'text' },
  { key: 'lastName',            label: 'Contact: Last Name',    type: 'text' },
  { key: 'companyName',         label: 'Contact: Company',      type: 'text' },
  { key: 'accountName',         label: 'Account: Name',         type: 'text' }
];

const ACC_OPS = {
  int:  [
    { v:'eq', l:'=' },  { v:'ne', l:'≠' },
    { v:'gt', l:'>' },  { v:'gte', l:'≥' },
    { v:'lt', l:'<' },  { v:'lte', l:'≤' },
    { v:'exists', l:'is set' }, { v:'not_exists', l:'is not set' },
  ],
  float: [
    { v:'gt', l:'>' },  { v:'gte', l:'≥' },
    { v:'lt', l:'<' },  { v:'lte', l:'≤' },
    { v:'eq', l:'=' },
    { v:'exists', l:'is set' }, { v:'not_exists', l:'is not set' },
  ],
  date: [
    { v:'rel_before',   l:'more than … ago'  },
    { v:'rel_after',    l:'within last …'    },
    { v:'before',       l:'before date'      },
    { v:'after',        l:'after date'       },
    { v:'before_today', l:'before today'     },
    { v:'after_today',  l:'after today'      },
    { v:'exists',       l:'is set'           },
    { v:'not_exists',   l:'is not set'       },
  ],
  text: [
    { v:'is',         l:'is'          },
    { v:'contains',   l:'contains'    },
    { v:'exists',     l:'is set'      },
    { v:'not_exists', l:'is not set'  },
  ],
};

const ACC_UNITS = ['days','weeks','months','years'];

function renderAccountConditions() {
  const el = $('account-conditions-list');
  if (!el) return;
  el.innerHTML = '';

  accountConditions.forEach((cond, i) => {
    const fld = ACC_FIELDS.find(f => f.key === cond.field) || ACC_FIELDS[0];
    const ops = ACC_OPS[fld.type] || ACC_OPS.text;
    if (!ops.find(o => o.v === cond.op)) cond.op = ops[0].v;

    const noVal = ['exists','not_exists','before_today','after_today'].includes(cond.op);
    const isRel = cond.op === 'rel_before' || cond.op === 'rel_after';
    const isDate = cond.op === 'before' || cond.op === 'after';

    let valHtml = '';
    if (!noVal) {
      if (isRel) {
        const unitOpts = ACC_UNITS.map(u => `<option value="${u}" ${(cond.unit||'days')===u?'selected':''}>${u}</option>`).join('');
        // Wrap the number and dropdown in a single flex container so they stay grouped
        valHtml = `
          <div style="display:flex; gap:6px; flex:1; min-width:140px; align-items:center;">
            <input type="text" class="acc-cond-num" data-i="${i}" value="${esc(String(cond.num||'1'))}" placeholder="1 or {{var}}" style="width:50px; flex-shrink:0;">
            <div style="flex:1; min-width:80px;">
              <select class="acc-cond-unit custom-select-raw" data-i="${i}">${unitOpts}</select>
            </div>
          </div>`;
      } else if (isDate) {
        valHtml = `<input type="text" class="acc-cond-val" data-i="${i}" value="${esc(cond.val||'')}" placeholder="YYYY-MM-DD or {{var}}" style="flex:1; min-width:120px;">`;
      } else {
        valHtml = `<input type="text" class="acc-cond-val" data-i="${i}" value="${esc(cond.val||'')}" placeholder="value or {{var}}…" style="flex:1; min-width:120px;">`;
      }
    }

    const fieldOpts = ACC_FIELDS.map(f => `<option value="${f.key}" ${f.key===cond.field?'selected':''}>${f.label}</option>`).join('');
    const opOpts    = ops.map(o => `<option value="${o.v}" ${o.v===cond.op?'selected':''}>${o.l}</option>`).join('');

    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-top">
        <select class="acc-cond-field custom-select-raw" data-i="${i}" style="min-width:150px;">${fieldOpts}</select>
        <select class="acc-cond-op custom-select-raw" data-i="${i}" style="min-width:115px;">${opOpts}</select>
        ${valHtml}
        <button class="btn-icon acc-cond-del" data-i="${i}" title="Remove">${DEL_SVG}</button>
      </div>`;
    el.appendChild(card);
    bindCustomDropdowns(card);
  });

  el.querySelectorAll('.acc-cond-field').forEach(s => {
    s.addEventListener('change', e => {
      const i = +e.target.dataset.i;
      accountConditions[i].field = e.target.value;
      const f = ACC_FIELDS.find(f2 => f2.key === accountConditions[i].field);
      accountConditions[i].op = (ACC_OPS[f?.type] || ACC_OPS.text)[0].v;
      accountConditions[i].val = ''; accountConditions[i].num = '1';
      renderAccountConditions();
    });
  });
  el.querySelectorAll('.acc-cond-op').forEach(s => {
    s.addEventListener('change', e => {
      accountConditions[+e.target.dataset.i].op = e.target.value;
      renderAccountConditions();
    });
  });
  el.querySelectorAll('.acc-cond-val').forEach(s => {
    s.addEventListener('input', e => { accountConditions[+e.target.dataset.i].val = e.target.value; });
  });
  el.querySelectorAll('.acc-cond-num').forEach(s => {
    s.addEventListener('input', e => { accountConditions[+e.target.dataset.i].num = e.target.value; });
  });
  el.querySelectorAll('.acc-cond-unit').forEach(s => {
    s.addEventListener('change', e => { accountConditions[+e.target.dataset.i].unit = e.target.value; });
  });
  el.querySelectorAll('.acc-cond-del').forEach(b => {
    b.addEventListener('click', e => {
      accountConditions.splice(+e.currentTarget.dataset.i, 1);
      renderAccountConditions();
    });
  });
}

document.getElementById('btn-add-account-condition')?.addEventListener('click', () => {
  accountConditions.push({ field: 'orderCount_i', op: 'gt', val: '0', num: '1', unit: 'days' });
  renderAccountConditions();
});


document.getElementById('btn-add-case-rule')?.addEventListener('click', () => {
  caseRules.push({ field: 'from', op: 'contains', value: '' });
  renderCaseRules();
});
document.getElementById('btn-add-case-var')?.addEventListener('click', () => {
  caseVars.push({ name: '', field: 'body', pattern: '', group: 1 });
  renderCaseVars();
});
document.getElementById('btn-add-case-tag')?.addEventListener('click', () => {
  const firstCat = Object.keys(CASE_CATS_EDITOR)[0];
  caseTags.push({ category: firstCat, subcategory: (CASE_CATS_EDITOR[firstCat]||[])[0] || '' });
  renderCaseTags();
});

// Wire the gear button
document.getElementById('btn-settings')?.addEventListener('click', openSettings);

// Listen for navigation requests from content scripts (e.g. + button in email modal)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'GB_OPEN_CASE_TPL_EDITOR') openCaseTplEditor();
});

// Check if we were opened specifically to show the case templates editor
(async () => {
  const getNav = async () => {
    try {
      const s = await new Promise(res => chrome.storage.session?.get('pendingNav', res).catch(() => res({})));
      if (s?.pendingNav) return s.pendingNav;
    } catch (_) {}
    try {
      const s = await new Promise(res => chrome.storage.local.get('pendingNav', res));
      if (s?.pendingNav) return s.pendingNav;
    } catch (_) {}
    return null;
  };
  const nav = await getNav();
  if (nav === 'case-tpl') {
    chrome.storage.session?.remove('pendingNav').catch(() => chrome.storage.local.remove('pendingNav'));
    openCaseTplEditor();
  }
})();

// Load saved colors, flags, and user presets immediately
loadThemeColors();
loadFeatureFlags();
loadUserPresets();


// ═══════════════════════════════════════════════════════════════
// RICH TEXT EDITOR
// ═══════════════════════════════════════════════════════════════

/**
 * Initialises a rich text editor on a .gb-rte-wrap element.
 * Toolbar buttons use execCommand for formatting. Paste is sanitised
 * to produce Outlook-safe inline-styled HTML.
 */
function initRTE(wrapId) {
  const wrap    = document.getElementById(wrapId);
  if (!wrap || wrap._rteInit) return;
  wrap._rteInit = true;

  const toolbar = wrap.querySelector('.gb-rte-toolbar');
  const editor  = wrap.querySelector('.gb-rte-content');
  if (!toolbar || !editor) return;

  // ── Toolbar button clicks ───────────────────────────────────
  toolbar.addEventListener('click', async (e) => {
    const btn = e.target.closest('.gb-rte-btn[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.dataset.cmd;

    if (cmd === 'createLink') {
      const url = await gbPrompt('Insert link', {
        defaultValue: 'https://', placeholder: 'https://example.com',
        confirmLabel: 'Insert',
      });
      if (url) document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false, null);
    }
    editor.focus();
    updateToolbarState();
  });

  // ── Select changes (fontSize) ───────────────────────────────
  toolbar.querySelectorAll('.gb-rte-select[data-cmd]').forEach(sel => {
    sel.addEventListener('change', e => {
      if (e.target.value) {
        document.execCommand(e.target.dataset.cmd, false, e.target.value);
      }
      e.target.value = '';
      editor.focus();
    });
  });

  // ── Color input ─────────────────────────────────────────────
  toolbar.querySelectorAll('.gb-rte-color[data-cmd]').forEach(inp => {
    inp.addEventListener('input', e => {
      document.execCommand(inp.dataset.cmd, false, e.target.value);
      editor.focus();
    });
  });

  // ── Update active state on toolbar buttons ──────────────────
  function updateToolbarState() {
    toolbar.querySelectorAll('.gb-rte-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (['bold','italic','underline','insertUnorderedList','insertOrderedList'].includes(cmd)) {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      }
    });
  }
  editor.addEventListener('keyup',    updateToolbarState);
  editor.addEventListener('mouseup',  updateToolbarState);

  // ── Paste handler: strip Word/Outlook junk, keep basic formatting ───
  editor.addEventListener('paste', e => {
    e.preventDefault();
    let html = e.clipboardData.getData('text/html');
    if (html) {
      // Strip Word XML, comments, <style>, <meta>, <link>, class attributes
      html = html.replace(/<!--[\s\S]*?-->/g, '');
      html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      html = html.replace(/<meta[^>]*>/gi, '');
      html = html.replace(/<link[^>]*>/gi, '');
      html = html.replace(/ class="[^"]*"/gi, '');
      html = html.replace(/ lang="[^"]*"/gi, '');
      html = html.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
      // Restrict to safe tags
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // Remove script/style/object/embed
      tmp.querySelectorAll('script,style,object,embed,form,input').forEach(el => el.remove());
      document.execCommand('insertHTML', false, tmp.innerHTML);
    } else {
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  });

  // ── Ensure default paragraph mode ───────────────────────────
  document.execCommand('defaultParagraphSeparator', false, 'p');
}

// ── Variable chip insertion into contenteditable ─────────────────────────────
// Override the existing var-chip click handler to support both textarea and contenteditable
document.addEventListener('click', e => {
  const chip = e.target.closest('.var-chip[data-target][data-insert]');
  if (!chip) return;
  const targetId = chip.dataset.target;
  const insert   = chip.dataset.insert;
  const target   = document.getElementById(targetId);
  if (!target) return;

  if (target.isContentEditable) {
    // Insert as a styled tag span into contenteditable
    target.focus();
    const span = `<span class="gb-var-tag" contenteditable="false">${insert}</span>&nbsp;`;
    document.execCommand('insertHTML', false, span);
  } else if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    const start = target.selectionStart;
    const end   = target.selectionEnd;
    target.value = target.value.slice(0, start) + insert + target.value.slice(end);
    target.selectionStart = target.selectionEnd = start + insert.length;
    target.focus();
  }
});

/**
 * Wraps {{variable}} patterns in styled spans inside a contenteditable element.
 * Called on template load to style existing variables.
 */
function _rteHighlightVars(el) {
  if (!el) return;
  // Walk text nodes and wrap {{...}} patterns
  const html = el.innerHTML;
  el.innerHTML = html.replace(
    /\{\{([^}]+)\}\}/g,
    '<span class="gb-var-tag" contenteditable="false">{{$1}}</span>'
  );
}

/**
 * Strips the styled spans back to raw {{variable}} text for storage.
 */
function _rteStripVarTags(html) {
  if (!html) return '';
  return html.replace(/<span[^>]*class="gb-var-tag"[^>]*>(.*?)<\/span>/gi, '$1');
}


// ═══════════════════════════════════════════════════════════════
// OUTLOOK-SAFE HTML CONVERSION
// ═══════════════════════════════════════════════════════════════

/**
 * Converts the RTE's contenteditable HTML into Outlook-safe HTML with inline styles.
 * Outlook ignores <style> blocks and CSS classes — everything must be inline.
 */
function toOutlookHTML(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Default font stack
  const FONT = "'Calibri', 'Segoe UI', Arial, sans-serif";
  const SIZE = '11pt';
  const COLOR = '#333333';

  // Walk all elements and apply inline styles
  tmp.querySelectorAll('*').forEach(el => {
    // Remove class/id attributes
    el.removeAttribute('class');
    el.removeAttribute('id');

    const tag = el.tagName.toLowerCase();

    // Paragraphs
    if (tag === 'p') {
      el.style.margin = '0 0 8px 0';
      if (!el.style.fontFamily) el.style.fontFamily = FONT;
      if (!el.style.fontSize)   el.style.fontSize   = SIZE;
      if (!el.style.color)      el.style.color       = COLOR;
    }

    // Links
    if (tag === 'a') {
      el.style.color = '#0563C1';
      el.style.textDecoration = 'underline';
    }

    // Lists
    if (tag === 'ul' || tag === 'ol') {
      el.style.margin = '0 0 8px 0';
      el.style.paddingLeft = '24px';
    }
    if (tag === 'li') {
      if (!el.style.fontFamily) el.style.fontFamily = FONT;
      if (!el.style.fontSize)   el.style.fontSize   = SIZE;
      if (!el.style.color)      el.style.color       = COLOR;
    }
  });

  return tmp.innerHTML;
}

/**
 * Strips all HTML to plain text for the mailto: / .eml text-part paths.
 */
function toPlainText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}


// ═══════════════════════════════════════════════════════════════
// EMAIL SIGNATURE
// ═══════════════════════════════════════════════════════════════

let _signatureEditorOpen = false;

function openSignatureEditor() {
  // Prefer the React signature modal when the template editor bundle is loaded.
  if (typeof window.__gbOpenSignature === 'function') {
    window.__gbOpenSignature();
    return;
  }
  if (_signatureEditorOpen) return;
  _signatureEditorOpen = true;

  const overlay = document.createElement('div');
  overlay.id = '__gb-sig-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--gb-surface,#1a1a1a); border:1px solid rgba(255,255,255,.09);
    border-radius:16px; width:min(680px,calc(100vw - 40px)); max-height:80vh;
    display:flex; flex-direction:column; overflow:hidden;
    box-shadow:0 24px 60px rgba(0,0,0,.85);
  `;

  chrome.storage.local.get('emailSignature', ({ emailSignature }) => {
    card.innerHTML = `
      <div style="padding:14px 18px;background:rgba(0,0,0,.35);border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:10px;">
        <svg width="16" height="16" fill="none" stroke="var(--gb-brand-label,#7db82a)" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
        <span style="font:700 14px/1 -apple-system,sans-serif;color:#fff;">Email Signature</span>
        <span style="font-size:10px;color:rgba(255,255,255,.35);margin-left:auto;">Appended to all emails sent via Direct Send</span>
      </div>
      <div style="padding:14px 18px;flex:1;overflow-y:auto;">
        <div class="gb-rte-wrap" id="rte-sig-wrap">
          <div class="gb-rte-toolbar" id="rte-sig-toolbar">
            <button type="button" class="gb-rte-btn" data-cmd="bold" title="Bold"><svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg></button>
            <button type="button" class="gb-rte-btn" data-cmd="italic" title="Italic"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
            <button type="button" class="gb-rte-btn" data-cmd="underline" title="Underline"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg></button>
            <div class="rte-sep"></div>
            <button type="button" class="gb-rte-btn" data-cmd="createLink" title="Insert link"><svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>
            <div class="rte-sep"></div>
            <select class="gb-rte-select" data-cmd="fontSize" title="Font size"><option value="">Size</option><option value="1">Small</option><option value="3">Normal</option><option value="4">Large</option></select>
            <input type="color" class="gb-rte-color" data-cmd="foreColor" value="#888888" title="Text color">
            <div class="rte-sep"></div>
            <button type="button" class="gb-rte-btn" data-cmd="removeFormat" title="Clear"><svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div class="gb-rte-content" id="sig-editor" contenteditable="true" data-placeholder="Type your signature — name, title, phone, etc." style="min-height:140px;">${emailSignature || ''}</div>
        </div>
      </div>
      <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:flex-end;gap:8px;">
        <button id="sig-cancel" style="padding:7px 16px;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:7px;color:rgba(255,255,255,.5);cursor:pointer;font:600 11px/1 -apple-system,sans-serif;">Cancel</button>
        <button id="sig-save" style="padding:7px 16px;background:var(--gb-brand,#6e901d);border:1px solid var(--gb-brand-border,rgba(125,184,42,.4));border-radius:7px;color:var(--gb-brand-text,#d8eeaa);cursor:pointer;font:600 11px/1 -apple-system,sans-serif;">Save Signature</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Init RTE on the signature editor
    initRTE('rte-sig-wrap');

    const close = () => {
      overlay.style.opacity = '0'; overlay.style.transition = 'opacity .15s';
      setTimeout(() => { overlay.remove(); _signatureEditorOpen = false; }, 160);
    };

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    card.querySelector('#sig-cancel').addEventListener('click', close);
    card.querySelector('#sig-save').addEventListener('click', () => {
      const html = document.getElementById('sig-editor').innerHTML;
      chrome.storage.local.set({ emailSignature: html }, () => {
        toast('Signature saved');
        close();
      });
    });
  });
}

document.getElementById('btn-signature')?.addEventListener('click', openSignatureEditor);

// ── Init RTE on page load ────────────────────────────────────────────────────
initRTE('rte-body-wrap');

/**
 * One-shot console utility: collapse legacy "Variation #N" sibling
 * templates into the parent's `tpl.variations` array. Run from DevTools
 * with the Manage tab focused:
 *
 *   await gbMigrateVariations()
 *
 * - Matches any template whose name ends with " Variation [#]N".
 * - Locates the parent by same type + the base name (everything before
 *   " Variation N").
 * - Moves { id, label, subject, body } onto parent.variations.
 * - Deletes the migrated children from chrome.storage.local.templates.
 *
 * Idempotent — once children are gone, subsequent runs do nothing.
 */
/**
 * Reverse `gbMigrateVariations`: split tpl.variations back into standalone
 * templates so false-positive matches can be undone. Each restored child
 * inherits the parent's type / rules / vars (the original migration only
 * kept {id, label, subject, body}, so those fields can't be recovered).
 *
 *   await gbUnmigrateVariations()
 *
 * Idempotent — second run finds nothing once variations are flattened.
 */
window.gbUnmigrateVariations = async function gbUnmigrateVariations() {
  const { templates: tpls = [] } = await new Promise((r) =>
    chrome.storage.local.get('templates', r),
  );
  const next = [];
  const restored = [];

  for (const t of tpls) {
    if (Array.isArray(t.variations) && t.variations.length) {
      // Re-emit the parent without its variations.
      const { variations, ...rest } = t;
      next.push({ ...rest });
      // Each variation comes back as a sibling: inherits type/rules/vars,
      // gets its own name reconstructed from parent + label.
      variations.forEach((v, i) => {
        const label = v.label || `Variation ${i + 1}`;
        const child = {
          ...rest,
          id:      v.id || `tpl_${Date.now().toString(36)}_${i}`,
          name:    `${t.name || 'Untitled'} ${label}`.trim(),
          subject: v.subject || '',
          body:    v.body    || '',
          updatedAt: Date.now(),
        };
        delete child.variations;
        next.push(child);
        restored.push(child.name);
      });
    } else {
      next.push(t);
    }
  }

  if (!restored.length) {
    console.log('[gb-migrate] No tpl.variations to restore.');
    return { restored: 0 };
  }
  await new Promise((r) => chrome.storage.local.set({ templates: next }, r));
  console.log(`[gb-migrate] Restored ${restored.length} variation(s) to standalone templates:`);
  restored.forEach((n) => console.log('  •', n));
  console.log('[gb-migrate] Reload the editor to see the restored templates.');
  return { restored: restored.length, details: restored };
};

window.gbMigrateVariations = async function gbMigrateVariations() {
  const { templates: tpls = [] } = await new Promise((r) =>
    chrome.storage.local.get('templates', r),
  );
  // Rule: trailing "Variation N" or "Variation #N" — both forms exist in
  // legitimate variation naming, so the # is optional.
  const VAR_RX = /^(.+?)\s+Variation\s+#?(\d+)\s*$/i;

  // Pass 1: bucket every "X Variation N" template by (type, baseName). Each
  // bucket holds { tpl, n } entries; non-variation templates are left alone.
  const buckets = new Map(); // key → [{ tpl, n }]
  for (const tpl of tpls) {
    const m = (tpl.name || '').match(VAR_RX);
    if (!m) continue;
    const baseName = m[1].trim();
    const key = `${tpl.type || 'order'}::${baseName}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ tpl, n: parseInt(m[2], 10) });
  }
  // Also index existing non-variation templates by (type, name) so we can
  // attach buckets to a real parent when one exists.
  const parents = new Map();
  for (const tpl of tpls) {
    if (VAR_RX.test(tpl.name || '')) continue;
    parents.set(`${tpl.type || 'order'}::${(tpl.name || '').trim()}`, tpl);
  }

  const moved   = [];
  const remove  = new Set();
  const adopted = new Set();

  for (const [key, group] of buckets) {
    group.sort((a, b) => a.n - b.n);            // lowest variation number first
    const [, baseName] = key.split('::');
    let parent = parents.get(key);

    // No real parent → promote the lowest-numbered variation to be the
    // parent. Rename it to the base, then port the rest. Catches the
    // "orphan variations" case where every match in a bucket has a number.
    if (!parent && group.length > 0) {
      const promoted = group.shift();
      parent = promoted.tpl;
      parent.name = baseName;
      adopted.add(parent.id);
    }
    if (!parent) continue;

    for (const { tpl: child, n } of group) {
      if (child.id === parent.id) continue;
      parent.variations = parent.variations || [];
      parent.variations.push({
        id:      child.id,
        label:   `Variation ${n}`,
        subject: child.subject || '',
        body:    child.body    || '',
      });
      remove.add(child.id);
      moved.push(`${baseName} ← variation ${n}`);
    }
  }

  if (!moved.length && !adopted.size) {
    console.log('[gb-migrate] No variation siblings found. Nothing to do.');
    return { moved: 0, promoted: 0 };
  }

  const next = tpls.filter((t) => !remove.has(t.id));
  await new Promise((r) => chrome.storage.local.set({ templates: next }, r));
  console.log(`[gb-migrate] Ported ${moved.length} variation(s); promoted ${adopted.size} orphan parent(s):`);
  moved.forEach((m) => console.log('  •', m));
  console.log('[gb-migrate] Reload the editor to see the new structure.');
  return { moved: moved.length, promoted: adopted.size, details: moved };
};