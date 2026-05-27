// crm-task-buttons.js — Quick-task preset buttons on contact & account pages.
// Injects styled one-click task creation buttons above the Open Tasks DataTable,
// collapsing the bulky DataTable controls to make room.
// Runs on Page=240 (Contact Details) and Page=271 (Account Details).
//
// NOTE: ctbCreateNewTask + readTaskContext mirror src/lib/submitQuickTask.js
// (the lib's source-of-truth for the React QuickTask modal). Keep both in
// sync. ctbCompleteTask ("complete the latest open task in one click") has
// no React equivalent — if surfaced in the React actions-shelf it should go
// next to "Quick task for X" rather than being re-implemented elsewhere.

if (!window.__gbCrmTaskButtonsLoaded) {
window.__gbCrmTaskButtonsLoaded = true;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ctbPageType() {
  const url = window.location.href;
  if (/[?&]Page=240\b/i.test(url)) return 'contact';
  if (/[?&]Page=271\b/i.test(url)) return 'account';
  return null;
}

function ctbContactId() {
  const m = window.location.href.match(/[?&]customerID=(\d+)/i);
  if (m) return m[1];
  return document.getElementById('tbContactId')?.value || '';
}

function ctbAccountId() {
  const m = window.location.href.match(/[?&]accountID=(\d+)/i);
  return m ? m[1] : '';
}

function ctbEmployeeId() {
  // Read from the hidden task employee dropdown populated by the page itself
  const el = document.getElementById('ddlTaskEmployeeId');
  if (el?.value && el.value !== '0') return el.value;
  // Fallback: scan page JS for hardcoded val
  const scripts = [...document.scripts].map(s => s.textContent);
  for (const src of scripts) {
    const m = src.match(/['"#$]*ddlTaskEmployeeId['"$]*\)\.val\((\d+)\)/);
    if (m) return m[1];
  }
  return '0';
}

function ctbTodayStr() {
  const d = new Date();
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}

function ctbDueDateStr(daysOut) {
  if (!daysOut && daysOut !== 0) return ctbTodayStr();
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}

// ── Task API ──────────────────────────────────────────────────────────────────

const CTB_BASE = 'https://api.golfballs.com';

function ctbFetch(path) {
  // encodeURIComponent on the JSON payload prevents unterminated string errors
  // when field values (Subject, Description) contain quotes or special chars.
  const [base, qs] = path.split('?');
  const encoded = qs ? base + '?' + encodeURIComponent(decodeURIComponent(qs)) : path;
  return fetch(CTB_BASE + encoded, { credentials: 'include' }).then(r => r.json());
}

/**
 * Finds the latest open (non-complete) task for a contact by scraping the
 * #TableTasks DOM (already loaded on contact/account pages) or by fetching
 * the contact page if we only have the contactId.
 * Returns { taskId, subject, ...fields } or null.
 */
async function ctbGetLatestOpenTask(contactId) {
  // Try the live DOM first (we may already be on the contact page)
  const liveRows = document.querySelectorAll('tr[id^="taskrow_"]');
  if (liveRows.length) {
    // Rows are in DOM order; pick the last open one
    // "Open" = status cell text is NOT 'Complete'
    let best = null;
    for (const row of liveRows) {
      const id         = row.id.replace('taskrow_', '');
      const statusCell = row.querySelector(`#status_${id}`);
      const status     = statusCell?.textContent.trim() || '';
      if (status !== 'Complete') {
        best = id; // keep iterating — we want the last one
      }
    }
    return best;
  }

  // Fallback: fetch the contact page and parse it
  if (!contactId) return null;
  try {
    const html = await fetch(
      `${CTB_BASE}/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}`,
      { credentials: 'include' }
    ).then(r => r.text());
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    let best   = null;
    for (const row of doc.querySelectorAll('tr[id^="taskrow_"]')) {
      const id         = row.id.replace('taskrow_', '');
      const statusCell = row.querySelector(`#status_${id}`);
      const status     = statusCell?.textContent.trim() || '';
      if (status !== 'Complete') best = id;
    }
    return best;
  } catch(e) {
    return null;
  }
}

/**
 * Marks a task complete using Task/Update.ajax.
 * Fetches the full task first so we can round-trip all required fields.
 */
async function ctbCompleteTask(taskId) {
  const task = await ctbFetch(`/golfballs/crm/Admin/Task/Get.ajax?${taskId}`);
  if (!task?.TaskId) throw new Error(`Could not fetch task ${taskId}`);

  const params = {
    TaskId:        Number(task.TaskId),
    Subject:       task.Subject       || '',
    Description:   task.Description   || '',
    LiveDate:      task.LiveDate       || '',
    DueDate:       task.DueDate        || '',
    taskCategoryID: task.taskCategoryID || '1',
    taskStatusID:   3,                              // 3 = Complete
    contactID:     task.contactID,
    employeeID:    task.employeeID,
    Priority:      task.Priority || 1,
  };
  return ctbFetch(`/golfballs/crm/Admin/Task/Update.ajax?${JSON.stringify(params)}`);
}

/**
 * Creates a new task via Task/Create.ajax.
 */
async function ctbCreateNewTask({ subject, description, daysOut, priority, categoryId, contactId, employeeId }) {
  const today = ctbTodayStr();
  const due   = ctbDueDateStr(daysOut);

  const params = {
    TaskID:        '',
    Subject:       subject,
    Description:   description || '',
    LiveDate:      today,
    DueDate:       due,
    taskCategoryID: String(categoryId || '0'),
    taskStatusID:  '1',
    Priority:      String(priority    || '1'),
    contactID:     String(contactId   || '0'),
    leadID:        '0',
    employeeID:    String(employeeId  || '0'),
    caseID:        0,
  };
  return ctbFetch(`/golfballs/crm/Admin/Task/Create.ajax?${JSON.stringify(params)}`);
}

/**
 * Full click handler: complete latest open task (if any) → create new task.
 */
async function ctbHandleTaskClick(tpl, contactId, employeeId) {
  // Step 1: find latest open task
  const openTaskId = await ctbGetLatestOpenTask(contactId);

  // Step 2: complete it if found
  if (openTaskId) {
    await ctbCompleteTask(openTaskId);
    // Reflect completion in the live DOM immediately
    const statusCell = document.getElementById(`status_${openTaskId}`);
    if (statusCell) statusCell.textContent = 'Complete';
  }

  // Step 3: create the new task
  const result = await ctbCreateNewTask({
    subject:     tpl.subject || tpl.name,
    description: tpl.body    || '',
    daysOut:     tpl.daysOut ?? null,
    priority:    tpl.priority || 1,
    categoryId:  tpl.categoryId || 0,
    contactId,
    employeeId,
  });

  if (!result?.TaskId) throw new Error('No TaskId returned from Create');

  // Reflect the new task in the live DOM if TableTasks is present
  const table = document.getElementById('TableTasks');
  if (table) {
    const today = ctbTodayStr();
    const due   = ctbDueDateStr(tpl.daysOut ?? null);
    const newRow = document.createElement('tr');
    newRow.id = `taskrow_${result.TaskId}`;
    newRow.innerHTML = `
      <td id="subject_${result.TaskId}" class="leftd">${tpl.subject || tpl.name}</td>
      <td id="category_${result.TaskId}" class="leftd">Other</td>
      <td id="status_${result.TaskId}" class="leftd">New</td>
      <td id="priority_${result.TaskId}" class="leftd"><div style="display:none;">${tpl.priority||1}</div>${tpl.priority===3?'Low':tpl.priority===2?'Med':'High'}</td>
      <td id="livedate_${result.TaskId}" class="leftd">${today}</td>
      <td id="duedate_${result.TaskId}" class="leftd">${due}</td>
      <td class="leftd"></td><td class="leftd"></td>
    `;
    const tbody = table.querySelector('tbody');
    if (tbody) tbody.insertBefore(newRow, tbody.firstChild);
  }

  return result;
}

// ── Styles ────────────────────────────────────────────────────────────────────

function ctbInjectStyles() {
  if (document.getElementById('__gb-ctb-css')) return;
  const st = document.createElement('style');
  st.id = '__gb-ctb-css';
  st.textContent = `
    #__gb-ctb-bar {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      padding: 10px 14px 12px !important;
      border-bottom: 1px solid rgba(0,0,0,.08) !important;
      background: rgba(0,0,0,.02) !important;
    }
    #__gb-ctb-bar-label {
      width: 100% !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: .5px !important;
      text-transform: uppercase !important;
      color: rgba(0,0,0,.38) !important;
      margin-bottom: 2px !important;
    }
    .gb-ctb-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 4px 11px !important;
      background: linear-gradient(180deg,
        var(--gb-page-btn, #008000) 0%,
        var(--gb-page-btn-dark, #004b23) 100%) !important;
      color: var(--gb-page-btn-text, #d4ffdc) !important;
      border: 1px solid var(--gb-page-btn-border, #026e23) !important;
      border-radius: 5px !important;
      font: 600 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
      transition: all 0.22s ease !important;
      white-space: nowrap !important;
      box-shadow: 0 1px 3px rgba(0,0,0,.12) !important;
      position: relative !important; 
      overflow: hidden !important;
      user-select: none !important;
      text-align: center !important;
    }
    .gb-ctb-btn:hover {
      box-shadow: 0 4px 10px rgba(var(--gb-page-btn-rgb, 0,128,0), .4) !important;
      transform: translateY(-1px) !important;
    }
    .gb-ctb-btn:active { transform: translateY(1px) !important; }

    /* Complete Button Specific Styles */
    .gb-ctb-btn-complete {
      margin-left: auto !important;
    }

    /* Fixed-Width Loading Overlays */
    .gb-ctb-text-normal {
      transition: opacity 0.2s ease !important;
      display: inline-block !important;
      width: 100% !important;
    }
    .gb-ctb-btn.show-state .gb-ctb-text-normal {
      opacity: 0 !important;
    }
    .gb-ctb-state-overlay {
      position: absolute !important;
      top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      opacity: 0 !important;
      transition: opacity 0.2s ease !important;
      pointer-events: none !important;
      font-size: 13px !important;
    }
    .gb-ctb-btn.show-state .gb-ctb-state-overlay {
      opacity: 1 !important;
    }
    .gb-ctb-spinner {
      width: 14px !important;
      height: 14px !important;
      border: 2px solid rgba(255,255,255,0.3) !important;
      border-top-color: #fff !important;
      border-radius: 50% !important;
      animation: gb-ctb-spin 0.8s linear infinite !important;
    }
    @keyframes gb-ctb-spin { 100% { transform: rotate(360deg); } }

    /* Action States */
    .gb-ctb-btn.is-saving {
      background: linear-gradient(180deg, var(--gb-surface-hover,#1e1e1e) 0%, var(--gb-surface-raised,#1a1a1a) 100%) !important;
      border-color: var(--gb-border-standard,#333333) !important;
      color: var(--gb-text-muted,#888888) !important;
      pointer-events: none !important;
      box-shadow: inset 0 2px 4px rgba(0,0,0,.1) !important;
      transform: none !important;
    }
    .gb-ctb-btn.is-saved {
      background: linear-gradient(180deg, var(--gb-page-btn-saved,#004b23) 0%, var(--gb-page-btn-saved,#004b23) 100%) !important;
      border-color: var(--gb-page-btn-border,#026e23) !important;
      color: var(--gb-page-btn-text,#d4ffdc) !important;
      box-shadow: 0 0 14px rgba(var(--gb-page-btn-saved-rgb,0,75,35),.6) !important;
      pointer-events: none !important;
      transform: none !important;
    }
    .gb-ctb-btn.is-error {
      background: linear-gradient(180deg, #4a2020 0%, #2d1010 100%) !important;
      border-color: rgba(200,96,96,.4) !important;
      color: #f08080 !important;
      pointer-events: none !important;
      transform: none !important;
    }

    /* Collapse the DataTable wrapper when task buttons are shown */
    .gb-ctb-table-collapsed > .dataTables_wrapper {
      display: none !important;
    }
    .gb-ctb-show-toggle {
      font: 500 11px/1 -apple-system, sans-serif !important;
      color: rgba(0,0,0,.45) !important;
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      padding: 4px 14px 8px !important;
      display: block !important;
      text-align: left !important;
      text-decoration: underline !important;
      text-underline-offset: 2px !important;
    }
    .gb-ctb-show-toggle:hover { color: rgba(0,0,0,.7) !important; }
  `;
  document.head.appendChild(st);
}

// ── Inject ────────────────────────────────────────────────────────────────────

function ctbInject(taskTemplates) {
  if (document.getElementById('__gb-ctb-bar')) return;

  const openTasksPortlet = (() => {
    for (const el of document.querySelectorAll('.portlet-body, .portlet-content')) {
      if (el.querySelector('#TableTasks') || el.querySelector('#TableTasks_wrapper')) return el;
    }
    const tbl = document.getElementById('TableTasks') || document.getElementById('TableTasks_wrapper');
    return tbl?.closest('.portlet-body') || tbl?.parentElement || null;
  })();

  if (!openTasksPortlet) return;

  ctbInjectStyles();

  const pageType  = ctbPageType();
  const contactId = ctbContactId();
  const employeeId = ctbEmployeeId() || '0';

  const bar = document.createElement('div');
  bar.id = '__gb-ctb-bar';

  const lbl = document.createElement('div');
  lbl.id = '__gb-ctb-bar-label';
  lbl.textContent = 'Quick Create Task';
  bar.appendChild(lbl);

  // Generate standard task buttons
  if (taskTemplates && taskTemplates.length > 0) {
    const sorted = [...taskTemplates].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );
    sorted.forEach(tpl => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gb-ctb-btn';
      btn.innerHTML = `<span class="gb-ctb-text-normal">${tpl.name}</span><span class="gb-ctb-state-overlay"></span>`;

      btn.addEventListener('click', async () => {
        if (btn.dataset.busy) return;
        btn.dataset.busy = '1';

        // Lock exact width to prevent layout shifts
        btn.style.width = btn.getBoundingClientRect().width + 'px';
        
        const stateOverlay = btn.querySelector('.gb-ctb-state-overlay');
        stateOverlay.innerHTML = '<div class="gb-ctb-spinner"></div>';
        btn.classList.add('show-state', 'is-saving');

        try {
          await ctbHandleTaskClick(tpl, contactId, employeeId);

          stateOverlay.innerHTML = '✓';
          btn.classList.remove('is-saving');
          btn.classList.add('is-saved');
          
          setTimeout(() => {
            btn.classList.remove('show-state', 'is-saved');
            setTimeout(() => { btn.style.width = ''; }, 200); // wait for fade
            delete btn.dataset.busy;
          }, 2200);
        } catch (e) {
          stateOverlay.innerHTML = '✗';
          btn.classList.remove('is-saving');
          btn.classList.add('is-error');
          
          setTimeout(() => {
            btn.classList.remove('show-state', 'is-error');
            setTimeout(() => { btn.style.width = ''; }, 200);
            delete btn.dataset.busy;
          }, 2500);
        }
      });

      bar.appendChild(btn);
    });
  }

  // Generate "Complete Open Task" button
  const completeBtn = document.createElement('button');
  completeBtn.type = 'button';
  completeBtn.className = 'gb-ctb-btn gb-ctb-btn-complete';
  completeBtn.innerHTML = `<span class="gb-ctb-text-normal">Complete Open Task</span><span class="gb-ctb-state-overlay"></span>`;

  completeBtn.addEventListener('click', async () => {
    if (completeBtn.dataset.busy) return;
    completeBtn.dataset.busy = '1';

    completeBtn.style.width = completeBtn.getBoundingClientRect().width + 'px';
    const stateOverlay = completeBtn.querySelector('.gb-ctb-state-overlay');
    stateOverlay.innerHTML = '<div class="gb-ctb-spinner"></div>';
    completeBtn.classList.add('show-state', 'is-saving');

    try {
      const openTaskId = await ctbGetLatestOpenTask(contactId);
      
      if (openTaskId) {
        await ctbCompleteTask(openTaskId);
        const statusCell = document.getElementById(`status_${openTaskId}`);
        if (statusCell) statusCell.textContent = 'Complete';

        stateOverlay.innerHTML = '✓';
        completeBtn.classList.remove('is-saving');
        completeBtn.classList.add('is-saved');
      } else {
        stateOverlay.innerHTML = 'None';
        completeBtn.classList.remove('is-saving');
        completeBtn.classList.add('is-saved'); 
      }

      setTimeout(() => {
        completeBtn.classList.remove('show-state', 'is-saved', 'is-error');
        setTimeout(() => { completeBtn.style.width = ''; }, 200);
        delete completeBtn.dataset.busy;
      }, 2200);

    } catch (e) {
      stateOverlay.innerHTML = '✗';
      completeBtn.classList.remove('is-saving');
      completeBtn.classList.add('is-error');

      setTimeout(() => {
        completeBtn.classList.remove('show-state', 'is-error');
        setTimeout(() => { completeBtn.style.width = ''; }, 200);
        delete completeBtn.dataset.busy;
      }, 2500);
    }
  });

  bar.appendChild(completeBtn);

  // Toggle to show/hide the full DataTable
  const toggle = document.createElement('button');
  toggle.className = 'gb-ctb-show-toggle';
  toggle.textContent = 'Show task list ▸';
  let tableVisible = false;
  toggle.addEventListener('click', () => {
    tableVisible = !tableVisible;
    openTasksPortlet.classList.toggle('gb-ctb-table-collapsed', !tableVisible);
    toggle.textContent = tableVisible ? 'Hide task list ▴' : 'Show task list ▸';
  });

  openTasksPortlet.classList.add('gb-ctb-table-collapsed');
  openTasksPortlet.insertAdjacentElement('afterbegin', toggle);
  openTasksPortlet.insertAdjacentElement('afterbegin', bar);
}

// ── Watch for DOM readiness ───────────────────────────────────────────────────

function ctbInit() {
  if (!ctbPageType()) return;

  chrome.storage.local.get(['noteTemplates', 'featureFlags'], data => {
    const flags = { ...data.featureFlags };
    const tasks = (data.noteTemplates || []).filter(t =>
      t.subType === 'task' && t.enabled !== false
    );

    // We can inject even if there are no task templates, 
    // so the complete button still shows up!
    
    ctbInject(tasks);

    if (!document.getElementById('__gb-ctb-bar')) {
      const obs = new MutationObserver(() => {
        if (document.getElementById('TableTasks') || document.getElementById('TableTasks_wrapper')) {
          ctbInject(tasks);
          if (document.getElementById('__gb-ctb-bar')) obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  });
}

ctbInit();

  // Expose for use by main.js executePresetTask message handler
  window.ctbHandleTaskClick = ctbHandleTaskClick;

} // end guard