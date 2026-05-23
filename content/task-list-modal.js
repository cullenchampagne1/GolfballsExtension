// task-list-modal.js — Full-screen task list modal with search, filters, complete/reopen.

if (!window.__gbTaskListModalLoaded) {
  window.__gbTaskListModalLoaded = true;
  
  // ── Styles ────────────────────────────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('__gb-tl-css')) return;
    const st = document.createElement('style');
    st.id = '__gb-tl-css';
    st.textContent = `
      #__gb-tl-overlay {
        position: fixed !important; inset: 0 !important; z-index: 999990 !important;
        background: rgba(0,0,0,.72) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        animation: __gbTlFade .18s ease !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      @keyframes __gbTlFade { from { opacity:0; } to { opacity:1; } }
  
      #__gb-tl-card {
        background: var(--gb-surface, #1a1a1a) !important;
        border: 1px solid rgba(255,255,255,.09) !important;
        border-radius: 18px !important;
        width: min(1400px, calc(100vw - 32px)) !important;
        height: min(850px, calc(100vh - 48px)) !important;
        display: flex !important; flex-direction: column !important; overflow: hidden !important;
        box-shadow: 0 32px 80px rgba(0,0,0,.9) !important;
        animation: __gbTlUp .28s cubic-bezier(.34,1.3,.64,1) !important;
      }
      @keyframes __gbTlUp { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:none; } }
  
      /* Header */
      #__gb-tl-hdr {
        padding: 16px 20px 14px !important; flex-shrink: 0 !important;
        background: rgba(0,0,0,.4) !important;
        border-bottom: 1px solid rgba(255,255,255,.07) !important;
        display: flex !important; align-items: center !important; gap: 14px !important;
      }
      #__gb-tl-hdr-icon {
        width: 36px !important; height: 36px !important; border-radius: 10px !important; flex-shrink: 0 !important;
        background: rgba(var(--gb-brand-label-rgb, 125,184,42), .12) !important;
        border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .25) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        color: var(--gb-brand-label, #7db82a) !important;
      }
      #__gb-tl-hdr-icon svg { width: 18px !important; height: 18px !important; }
      #__gb-tl-hdr-title { font: 700 16px/1 inherit !important; color: #fff !important; letter-spacing: 0.3px !important; }
      #__gb-tl-hdr-sub { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; margin-top: 4px !important; }
      #__gb-tl-close {
        margin-left: auto !important; background: rgba(255,255,255,.05) !important;
        border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
        color: rgba(255,255,255,.8) !important; cursor: pointer !important; padding: 6px 12px !important;
        font: 600 11px/1 inherit !important;
        display: flex !important; align-items: center !important; gap: 6px !important; transition: all .15s !important; margin-top: 0 !important; box-sizing: border-box !important;
      }
      #__gb-tl-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }
      #__gb-tl-close svg { width: 10px !important; height: 10px !important; }
  
      /* Toolbar */
      #__gb-tl-toolbar {
        padding: 14px 20px !important; flex-shrink: 0 !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important;
        display: flex !important; align-items: center !important; gap: 12px !important;
      }
      
      /* Search Input */
      #__gb-tl-search-wrap { flex: 1 !important; min-width: 200px !important; position: relative !important; display: flex !important; align-items: center !important; }
      #__gb-tl-search-wrap svg {
        position: absolute !important; left: 12px !important; top: 0 !important; bottom: 0 !important; margin: auto !important;
        width: 15px !important; height: 15px !important; color: rgba(255,255,255,.4) !important; pointer-events: none !important;
      }
      #__gb-tl-search {
        width: 100% !important; height: 38px !important; padding: 0 14px 0 36px !important; box-sizing: border-box !important; margin: 0 !important;
        background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 8px !important; color: #fff !important; font: 500 13px inherit !important;
        outline: none !important; transition: border-color .15s, box-shadow .15s !important; color-scheme: dark !important;
      }
      #__gb-tl-search:focus {
        border-color: var(--gb-brand-label, #7db82a) !important;
        box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important;
      }
      #__gb-tl-search::placeholder { color: rgba(255,255,255,.3) !important; }
  
      /* Custom Dropdowns */
      .tl-dropdown-wrap { position: relative !important; flex-shrink: 0 !important; margin: 0 !important; }
      .tl-dropdown-btn {
        width: 100% !important; background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
        padding: 0 32px 0 14px !important; font-size: 13px !important; font-weight: 500 !important; color: #fff !important; cursor: pointer !important;
        text-align: left !important; display: flex !important; align-items: center !important; position: relative !important;
        height: 38px !important; box-sizing: border-box !important; font-family: inherit !important; transition: all .15s !important; margin: 0 !important;
      }
      .tl-dropdown-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; }
      .tl-dropdown-btn.open { border-color: var(--gb-brand-label, #7db82a) !important; background: rgba(255,255,255,.05) !important; box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; }
      .tl-btn-label { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
      .tl-dropdown-chevron { position: absolute !important; right: 12px !important; top: 0 !important; bottom: 0 !important; margin: auto !important; color: rgba(255,255,255,.4) !important; pointer-events: none !important; transition: transform .2s, color .2s !important; }
      .tl-dropdown-btn.open .tl-dropdown-chevron { transform: rotate(180deg) !important; color: var(--gb-brand-label, #7db82a) !important; }
  
      .tl-dropdown-menu {
        position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important;
        background: var(--gb-surface-elevated, #171717) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 9px !important; z-index: 999995 !important;
        max-height: 400px !important; overflow-y: auto !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important;
        opacity: 0 !important; transform: translateY(-5px) !important; pointer-events: none !important; 
        transition: opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1) !important;
        box-shadow: 0 10px 30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03) !important; padding: 4px !important; box-sizing: border-box !important;
      }
      .tl-dropdown-menu.open { opacity: 1 !important; transform: translateY(0) !important; pointer-events: auto !important; }
      .tl-dropdown-option { padding: 9px 12px !important; margin-bottom: 2px !important; border-radius: 6px !important; cursor: pointer !important; font-size: 12.5px !important; font-weight: 500 !important; color: var(--gb-text-secondary, #ccc) !important; transition: background .1s, color .1s !important; display:flex !important; justify-content:space-between !important; align-items:center !important;}
      .tl-dropdown-option:last-child { margin-bottom: 0 !important; }
      .tl-dropdown-option:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
      .tl-dropdown-option.selected { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; color: var(--gb-brand-label, #7db82a) !important; font-weight: 600 !important; }
      
      /* Dropup configuration for footer */
      .dropup .tl-dropdown-menu { top: auto !important; bottom: calc(100% + 4px) !important; transform: translateY(5px) !important; }
      .dropup .tl-dropdown-menu.open { transform: translateY(0) !important; }
  
      /* Count & Reload */
      #__gb-tl-count {
        font-size: 12px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; white-space: nowrap !important; margin-left: auto !important;
      }
      #__gb-tl-reload {
        height: 38px !important; padding: 0 14px !important; box-sizing: border-box !important; flex-shrink: 0 !important; margin: 0 !important;
        background: rgba(0,0,0,.3) !important; 
        border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
        color: rgba(255,255,255,.7) !important; cursor: pointer !important; font-size: 12.5px !important; font-weight: 600 !important; font-family: inherit !important;
        display: flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; transition: all .15s !important;
      }
      #__gb-tl-reload:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; color: #fff !important; }
      #__gb-tl-reload svg { width: 14px !important; height: 14px !important; }
      #__gb-tl-reload.spinning svg { animation: __gbTlSpin .7s linear infinite !important; }
      @keyframes __gbTlSpin { to { transform: rotate(360deg); } }
  
      /* Table Layout */
      #__gb-tl-body {
        flex: 1 !important; overflow-y: auto !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
        padding: 0 24px !important; 
      }
      #__gb-tl-body::-webkit-scrollbar { width: 6px !important; }
      #__gb-tl-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }
      #__gb-tl-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25) !important; }
  
      #__gb-tl-table {
        width: 100% !important; border-collapse: collapse !important; font-size: 13px !important;
      }
      #__gb-tl-table thead th {
        padding: 12px 12px !important; font: 700 11px/1 inherit !important;
        text-transform: uppercase !important; letter-spacing: .5px !important; color: rgba(255,255,255,.5) !important;
        background: rgba(0,0,0,.45) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
        border-bottom: 1px solid rgba(255,255,255,.07) !important;
        white-space: nowrap !important; position: sticky !important; top: 0 !important; z-index: 1 !important;
        cursor: pointer !important; user-select: none !important; text-align: left !important;
      }
      #__gb-tl-table thead th:hover { color: #fff !important; background: rgba(0,0,0,.55) !important; }
      #__gb-tl-table thead th.sort-asc::after { content: ' ↑' !important; opacity: .8 !important; color: var(--gb-brand-label, #7db82a) !important; }
      #__gb-tl-table thead th.sort-desc::after { content: ' ↓' !important; opacity: .8 !important; color: var(--gb-brand-label, #7db82a) !important; }
  
      #__gb-tl-table tbody tr {
        border-bottom: 1px solid rgba(255,255,255,.04) !important;
        transition: background .12s !important;
      }
      #__gb-tl-table tbody tr:hover { background: rgba(255,255,255,.04) !important; }
      
      /* Row Selection & Completed Styling */
      #__gb-tl-table tbody tr.selected { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .12) !important; }
      
      #__gb-tl-table tbody tr.is-complete { opacity: .55 !important; text-decoration: line-through !important; }
      #__gb-tl-table tbody tr.is-complete .tl-account-link, 
      #__gb-tl-table tbody tr.is-complete .tl-contact-link { text-decoration: line-through !important; color: rgba(255,255,255,.5) !important; }
      #__gb-tl-table tbody tr.is-complete .gb-pill { text-decoration: line-through !important; }
      
      #__gb-tl-table tbody tr.overdue:not(.is-complete) td.tl-due { color: var(--gb-error, #c86060) !important; font-weight: 600 !important; }
      #__gb-tl-table tbody tr.due-today:not(.is-complete) td.tl-due { color: var(--gb-warn, #f0c060) !important; font-weight: 600 !important; }
  
      #__gb-tl-table td {
        padding: 12px 12px !important; color: rgba(255,255,255,.8) !important; vertical-align: middle !important;
      }
  
      .tl-account-link, .tl-contact-link {
        color: rgba(255,255,255,.85) !important; text-decoration: none !important; font-weight: 600 !important;
        transition: color .12s !important;
      }
      .tl-account-link:hover { color: var(--gb-brand-label, #7db82a) !important; }
      .tl-contact-link:hover { color: #fff !important; }

      /* Checkboxes */
      .tl-checkbox {
        width: 16px !important; height: 16px !important; border: 1px solid rgba(255,255,255,.3) !important; border-radius: 4px !important;
        display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;
        transition: all .15s !important; background: rgba(0,0,0,.2) !important; margin: 0 auto !important; box-sizing: border-box !important;
        user-select: none !important; -webkit-user-select: none !important; flex-shrink: 0 !important;
      }
      .tl-checkbox:hover { border-color: rgba(255,255,255,.6) !important; }
      .tl-checkbox.checked { background: var(--gb-brand-label, #7db82a) !important; border-color: var(--gb-brand-label, #7db82a) !important; }
      .tl-checkbox svg { opacity: 0 !important; width: 10px !important; height: 10px !important; color: var(--gb-surface-base, #111) !important; stroke-width: 3 !important; transition: opacity .15s !important; }
      .tl-checkbox.checked svg { opacity: 1 !important; }
  
      /* ====================================================================
         UNIFIED PILL STYLES (Ultra-compact)
         ==================================================================== */
      .gb-pill {
        display: inline-flex !important; 
        align-items: center !important; 
        justify-content: center !important;
        gap: 3px !important;
        padding: 2px 6px !important; 
        border-radius: 4px !important; 
        font: 600 7.5px/1 "Menlo", "Consolas", monospace, inherit !important; 
        white-space: nowrap !important; 
        letter-spacing: 0.2px !important;
        text-transform: uppercase !important;
        box-sizing: border-box !important;
        margin: 0 !important;
      }

      /* Priority Colors */
      .gb-pri-high { background: rgba(200,96,96,.12) !important; color: var(--gb-error, #f08080) !important; border: 1px solid rgba(200,96,96,.25) !important; }
      .gb-pri-med  { background: rgba(240,180,60,.12) !important; color: var(--gb-warn, #f0b840) !important; border: 1px solid rgba(240,180,60,.2) !important; }
      .gb-pri-low  { background: rgba(106,190,140,.12) !important; color: var(--gb-success, #6abe8c) !important; border: 1px solid rgba(106,190,140,.2) !important; }
  
      /* Status Colors */
      .gb-stat-new  { background: rgba(106,176,243,.12) !important; color: var(--gb-info, #6ab0f3) !important; border: 1px solid rgba(106,176,243,.25) !important; }
      .gb-stat-done { background: rgba(255,255,255,.15) !important; color: rgba(255,255,255,.8) !important; border: 1px solid rgba(255,255,255,.25) !important; }
  
      /* Icon Action Buttons */
      button.gb-btn-action {
        cursor: pointer !important;
        transition: all .15s !important;
        outline: none !important;
        padding: 6px !important;
        width: 26px !important;
        height: 26px !important;
        border-radius: 6px !important;
      }
      button.gb-btn-action svg { width: 13px !important; height: 13px !important; margin: 0 !important; }
      button.gb-btn-action:disabled { opacity: .4 !important; pointer-events: none !important; }
      
      .gb-btn-complete {
        background: rgba(106,190,140,.12) !important; color: var(--gb-success, #6abe8c) !important;
        border: 1px solid rgba(106,190,140,.25) !important;
      }
      .gb-btn-complete:hover { background: rgba(106,190,140,.25) !important; color: #fff !important; }
      
      .gb-btn-reopen {
        background: rgba(255,255,255,.08) !important; color: rgba(255,255,255,.65) !important;
        border: 1px solid rgba(255,255,255,.15) !important;
      }
      .gb-btn-reopen:hover { background: rgba(255,255,255,.15) !important; color: #fff !important; }
  
      /* Empty / loading states */
      .tl-state-row td {
        text-align: center !important; padding: 64px 20px !important;
        color: rgba(255,255,255,.4) !important; font-size: 14px !important; font-weight: 500 !important;
      }

      /* Campaign Footer Bar */
      #__gb-tl-footer {
        padding: 12px 20px !important; flex-shrink: 0 !important;
        border-top: 1px solid rgba(255,255,255,.06) !important;
        background: rgba(0,0,0,.2) !important;
        display: flex !important; align-items: center !important; justify-content: space-between !important;
      }
      #__gb-tl-selection-info { font-size: 13px !important; color: rgba(255,255,255,.6) !important; font-weight: 500 !important; margin-right: 4px !important; }
      
      #btn-open-tabs {
        background: rgba(255,255,255,.08) !important; border: 1px solid rgba(255,255,255,.15) !important;
        color: rgba(255,255,255,.8) !important; border-radius: 6px !important; width: 38px !important; height: 38px !important;
        cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important;
        transition: all .15s !important; outline: none !important;
      }
      #btn-open-tabs:hover:not(:disabled) { background: rgba(255,255,255,.15) !important; color: #fff !important; }
      #btn-open-tabs:disabled { opacity: 0.3 !important; pointer-events: none !important; }

      #btn-run-campaign {
        height: 38px !important; padding: 0 16px !important; border-radius: 8px !important; margin: 0 !important;
        background: var(--gb-brand, #6e901d) !important; border: 1px solid var(--gb-brand-border, #4a6b14) !important;
        color: var(--gb-brand-text, #d8eeaa) !important; font-weight: 600 !important; font-size: 13px !important;
        cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important;
      }
      #btn-run-campaign:hover:not(:disabled) { filter: brightness(1.1) !important; }
      #btn-run-campaign:disabled { opacity: 0.5 !important; cursor: not-allowed !important; filter: grayscale(1) !important; }

      #btn-bulk-complete {
        height: 38px !important; padding: 0 12px !important; border-radius: 8px !important; margin: 0 !important; gap: 5px !important;
        background: rgba(106,190,140,.1) !important; border: 1px solid rgba(106,190,140,.22) !important;
        color: var(--gb-success, #6abe8c) !important; font-weight: 600 !important; font-size: 13px !important;
        cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important; white-space: nowrap !important;
      }
      #btn-bulk-complete:hover:not(:disabled) { background: rgba(106,190,140,.25) !important; color: #fff !important; }
      #btn-bulk-complete:disabled { opacity: 0.3 !important; pointer-events: none !important; }
      #btn-bulk-complete svg { width: 12px !important; height: 12px !important; flex-shrink: 0 !important; }

      #btn-bulk-push {
        height: 38px !important; padding: 0 12px !important; border-radius: 8px !important; margin: 0 !important;
        background: rgba(255,255,255,.06) !important; border: 1px solid rgba(255,255,255,.12) !important;
        color: rgba(255,255,255,.8) !important; font-weight: 600 !important; font-size: 13px !important;
        cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important; white-space: nowrap !important;
      }
      #btn-bulk-push:hover:not(:disabled) { background: rgba(255,255,255,.15) !important; color: #fff !important; }
      #btn-bulk-push:disabled { opacity: 0.3 !important; pointer-events: none !important; }

      /* ── Quick Task trigger button ─────────────────────────────── */
      .qt-trigger {
        height: 38px !important; padding: 0 14px !important; border-radius: 8px !important; gap: 6px !important;
        background: rgba(255,255,255,.07) !important; border: 1px solid rgba(255,255,255,.13) !important;
        color: rgba(255,255,255,.7) !important; font-size: 13px !important; font-weight: 600 !important; font-family: inherit !important;
        cursor: pointer !important; transition: all .15s !important; display: inline-flex !important;
        align-items: center !important; white-space: nowrap !important; outline: none !important;
      }
      .qt-trigger:hover { background: rgba(255,255,255,.13) !important; color: #fff !important; border-color: rgba(255,255,255,.25) !important; }
      .qt-trigger svg.qt-chevron { width: 11px !important; height: 11px !important; opacity: .5 !important; flex-shrink: 0 !important; }

      /* ── Quick Task floating menu ──────────────────────────────── */
      #__gb-tl-qt-menu {
        position: fixed !important; z-index: 999999 !important;
        background: var(--gb-surface-elevated, #1a1a1a) !important;
        border: 1px solid rgba(255,255,255,.1) !important; border-radius: 9px !important;
        box-shadow: 0 12px 36px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.03) !important;
        padding: 4px !important; min-width: 170px !important; box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .qt-header {
        padding: 6px 10px 5px !important; font-size: 9.5px !important; font-weight: 700 !important;
        text-transform: uppercase !important; letter-spacing: .6px !important;
        color: rgba(255,255,255,.3) !important; display: flex !important; align-items: center !important; gap: 6px !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important; margin-bottom: 3px !important;
      }
      .qt-back {
        padding: 7px 10px !important; font-size: 11.5px !important; font-weight: 600 !important;
        color: rgba(255,255,255,.5) !important; cursor: pointer !important; border-radius: 6px !important;
        display: flex !important; align-items: center !important; gap: 6px !important; transition: all .12s !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important; margin-bottom: 3px !important;
      }
      .qt-back:hover { background: rgba(255,255,255,.07) !important; color: #fff !important; }
      .qt-item {
        padding: 8px 10px !important; font-size: 12.5px !important; font-weight: 500 !important;
        color: rgba(255,255,255,.8) !important; cursor: pointer !important; border-radius: 6px !important;
        display: flex !important; align-items: center !important; gap: 8px !important;
        transition: background .1s, color .1s !important; white-space: nowrap !important;
      }
      .qt-item:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
      .qt-item svg { width: 13px !important; height: 13px !important; flex-shrink: 0 !important; }
      .qt-item.qt-complete-item { color: var(--gb-success, #6abe8c) !important; }
      .qt-item.qt-complete-item:hover { background: rgba(106,190,140,.15) !important; }
      .qt-item.qt-reopen-item { color: rgba(255,255,255,.6) !important; }
      .qt-item.qt-push-item { color: var(--gb-info, #6ab0f3) !important; }
      .qt-item.qt-push-item:hover { background: rgba(106,176,243,.12) !important; }
      .qt-item.qt-new-item { color: rgba(255,255,255,.7) !important; }
      .qt-item.qt-new-item:hover { background: rgba(255,255,255,.08) !important; }
      .qt-item.qt-new-item .qt-arrow { margin-left: auto !important; opacity: .4 !important; }
      .qt-tpl-list { max-height: 220px !important; overflow-y: auto !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important; }
      .qt-tpl-item { padding: 7px 10px !important; font-size: 12px !important; color: rgba(255,255,255,.75) !important; cursor: pointer !important; border-radius: 6px !important; transition: background .1s !important; }
      .qt-tpl-item:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
      .qt-tpl-empty { padding: 10px !important; text-align: center !important; font-size: 11.5px !important; color: rgba(255,255,255,.3) !important; }
      .qt-input-row {
        display: flex !important; align-items: center !important; gap: 6px !important;
        padding: 6px 8px !important; border-top: 1px solid rgba(255,255,255,.06) !important; margin-top: 3px !important;
      }
      .qt-input-row input {
        flex: 1 !important; height: 28px !important; line-height: 28px !important; padding: 0 7px !important;
        border-radius: 5px !important; border: 1px solid rgba(255,255,255,.15) !important;
        background: rgba(0,0,0,.35) !important; color: rgba(255,255,255,.85) !important;
        font-size: 11.5px !important; font-family: inherit !important; outline: none !important; box-sizing: border-box !important;
      }
      .qt-input-row input:focus { border-color: rgba(255,255,255,.3) !important; }
      .qt-input-row input[type=number]::-webkit-outer-spin-button,
      .qt-input-row input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none !important; }
      .qt-input-row input[type=number] { -moz-appearance: textfield !important; }
      .qt-confirm-btn {
        height: 28px !important; padding: 0 10px !important; border-radius: 5px !important; flex-shrink: 0 !important;
        background: var(--gb-brand,#6e901d) !important; border: 1px solid var(--gb-brand-border,#4a6b14) !important;
        color: var(--gb-brand-text,#d8eeaa) !important; font-size: 11.5px !important; font-weight: 600 !important;
        cursor: pointer !important; font-family: inherit !important; white-space: nowrap !important;
      }
      .qt-confirm-btn:hover { filter: brightness(1.1) !important; }

      #tl-push-days {
        width: 48px !important; height: 30px !important; line-height: 30px !important;
        text-align: center !important; box-sizing: border-box !important; vertical-align: middle !important;
        border-radius: 6px !important; border: 1px solid rgba(255,255,255,.15) !important;
        background: rgba(0,0,0,.3) !important; color: rgba(255,255,255,.85) !important;
        font-size: 12px !important; font-weight: 600 !important; font-family: inherit !important;
        padding: 0 !important; margin: 0 !important; outline: none !important; display: block !important;
      }
      #tl-push-days:focus { border-color: rgba(255,255,255,.35) !important; }
      /* Hide number input spinners */
      #tl-push-days::-webkit-outer-spin-button,
      #tl-push-days::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
      #tl-push-days[type=number] { -moz-appearance: textfield !important; }
    `;
    document.head.appendChild(st);
  })();
  
  // ── Task data & State ─────────────────────────────────────────────────────────
  let _tlAllTasks         = [];
  let _tlAccountTemplates = [];
  let _tlNoteTemplates    = [];
  let _tlCampaigns        = [];
  let _tlSelectedTasks    = new Set(); 
  let _tlLastCheckedIndex = -1;        
  let _tlSelectedCampaign = '';        
  let _tlSortCol          = 3;         
  let _tlSortDir          = 'asc';
  let _tlSearchQ          = '';
  let _tlFilterPri        = '';
  let _tlFilterStatus     = '1';       
  let _tlOverlay          = null;
  
  // ── Fetch tasks from Page=349 ─────────────────────────────────────────────────
  async function tlFetchTasks() {
    const html = await fetch(
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=349',
      { credentials: 'include' }
    ).then(r => r.text());
    return tlParseTasksFromHtml(html);
  }
  
  function tlParseTasksFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tasks = [];
    const BASE_PATH = 'https://api.golfballs.com/golfballs/adminnew/';
  
    doc.querySelectorAll('tr[id^="taskrow_"]').forEach(row => {
      // Avoid processing hidden nested rows
      if (row.id.includes('taskrow2_')) return;
      
      const id    = row.id.replace('taskrow_', '');
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 6) return;
  
      const accountCell  = cells[0];
      const contactCell  = cells[1];
      const dueCell      = cells[2];
      const catCell      = cells[3];
      const priCell      = cells[4];
      const subjectCell  = cells[5];
      const actionCell   = cells[6] || cells[cells.length - 1];
  
      const accountLink  = accountCell.querySelector('a');
      const contactLink  = contactCell.querySelector('a');
      
      const rawAccHref = accountLink?.getAttribute('href') || '';
      const rawConHref = contactLink?.getAttribute('href') || '';
  
      const priRaw = priCell.textContent.trim();
      const priNum = parseInt(priRaw) || 2;
      const priLabel = priRaw.replace(/^\d/, '') || 'Med';
  
      // Accurate status parsing via hidden inputs generated by ASP.NET
      const statusInput = actionCell?.querySelector('input[id^="status_"]');
      const statusVal   = statusInput ? statusInput.value : '';
      const isDone      = statusVal.toLowerCase().includes('complete');
  
      tasks.push({
        id,
        account:      accountLink?.textContent.trim() || accountCell.textContent.trim(),
        accountUrl:   rawAccHref ? new URL(rawAccHref, BASE_PATH).href : '',
        contact:      contactLink?.textContent.trim() || contactCell.textContent.trim(),
        contactUrl:   rawConHref ? new URL(rawConHref, BASE_PATH).href : '',
        due:          dueCell.textContent.trim(),
        dueDate:      new Date(dueCell.textContent.trim()),
        category:     catCell.textContent.trim(),
        priority:     priNum,
        priorityLabel: priLabel.trim(),
        subject:      subjectCell.textContent.trim(),
        status:       isDone ? 'Complete' : 'New',
      });
    });
  
    return tasks;
  }
  
  // ── Complete / Reopen a task ─────────────────────────────────────────────────
  // Known brands matched against dtOI item names on the contact page
  const _TL_BRANDS = [
    'Titleist','Callaway','TaylorMade','Bridgestone','Srixon','Ping','Cobra',
    'Cleveland','Volvik','Wilson','Mizuno','Odyssey','Top Flite','Vice','OnCore',
    'Kirkland','Maxfli','Nitro','Pinnacle','Precept','Tour Edge','Acushnet','Noodle'
  ];

  // Parses a contact page document and returns the set of brand names purchased (from dtOI table)
  function tlExtractPurchasedBrands(doc) {
    const brands = new Set();
    doc.querySelectorAll('table.dtOI tbody tr td:first-child').forEach(td => {
      const itemName = td.textContent.trim();
      for (const brand of _TL_BRANDS) {
        if (itemName.toLowerCase().startsWith(brand.toLowerCase())) {
          brands.add(brand);
          break;
        }
      }
    });
    return brands;
  }

  async function tlCompleteTask(id) {
    const BASE = 'https://api.golfballs.com';
    const task = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' }).then(r => r.json());
    const params = { TaskId: Number(task.TaskId), Subject: task.Subject, Description: task.Description, LiveDate: task.LiveDate, DueDate: task.DueDate, taskCategoryID: task.taskCategoryID, taskStatusID: 3, contactID: task.contactID, employeeID: task.employeeID, Priority: task.Priority };
    await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
  }
  
  async function tlReopenTask(id) {
    const BASE = 'https://api.golfballs.com';
    const task = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' }).then(r => r.json());
    const params = { TaskId: Number(task.TaskId), Subject: task.Subject, Description: task.Description, LiveDate: task.LiveDate, DueDate: task.DueDate, taskCategoryID: task.taskCategoryID, taskStatusID: 1, contactID: task.contactID, employeeID: task.employeeID, Priority: task.Priority };
    await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
  }

  async function tlPushTaskDate(id, daysOut) {
    const BASE = 'https://api.golfballs.com';
    const task = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' }).then(r => r.json());
    const due = new Date();
    due.setDate(due.getDate() + daysOut);
    const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    const params = {
      TaskID:        String(task.TaskId),
      Subject:       task.Subject,
      Description:   task.Description,
      LiveDate:      task.LiveDate,
      DueDate:       fmt(due),
      taskCategoryID: String(task.taskCategoryID),
      taskStatusID:  String(task.taskStatusID),
      Priority:      String(task.Priority),
      contactID:     String(task.contactID),
      leadID:        task.leadID || '',
      employeeID:    String(task.employeeID),
      caseID:        task.caseID || 0,
    };
    await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
  }

  // Sets a task's due date to an explicit MM/DD/YYYY string
  async function tlSetTaskDate(id, dueDateStr) {
    const BASE = 'https://api.golfballs.com';
    const task = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' }).then(r => r.json());
    const params = {
      TaskID:        String(task.TaskId),
      Subject:       task.Subject,
      Description:   task.Description,
      LiveDate:      task.LiveDate,
      DueDate:       dueDateStr,
      taskCategoryID: String(task.taskCategoryID),
      taskStatusID:  String(task.taskStatusID),
      Priority:      String(task.Priority),
      contactID:     String(task.contactID),
      leadID:        task.leadID || '',
      employeeID:    String(task.employeeID),
      caseID:        task.caseID || 0,
    };
    await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
  }

  // Extracts all email subjects from the contact page email history table (tr[data-gbep]).
  // The subject cell (td index 3) can contain a div wrapper; we normalize whitespace and
  // decode HTML entities so plain-text filter strings match reliably.
  function tlExtractEmailSubjects(doc) {
    const decoder = doc.createElement('textarea');
    const subjects = [];
    doc.querySelectorAll('tr[data-gbep]').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 4) return; // skip header rows that use <th>
      const td = tds[3];
      // innerText isn't available on detached docs — use textContent then decode entities
      decoder.innerHTML = td.textContent;
      const plain = decoder.value.replace(/\s+/g, ' ').trim().toLowerCase();
      if (plain) subjects.push(plain);
    });
    return subjects;
  }

  function tlMatchesSubjectFilter(doc, step) {
    const mode    = step.subjectFilterMode || 'off';
    const filters = (step.subjectFilters || []).map(s => {
      // Decode the filter string the same way so RE: vs RE: won't cause mismatches
      const decoder = doc.createElement('textarea');
      decoder.innerHTML = s;
      return decoder.value.replace(/\s+/g, ' ').trim().toLowerCase();
    }).filter(Boolean);
    if (mode === 'off' || !filters.length) return true; // no filter = always run
    const subjects = tlExtractEmailSubjects(doc);
    const found    = filters.some(f => subjects.some(s => s.includes(f)));
    if (mode === 'skip_if_found'   && found)  return false;
    if (mode === 'skip_if_missing' && !found) return false;
    return true;
  }

  // ── Brand filter: every brand in the array must appear in order items ────────
  function tlCheckBrandFilter(doc, brands) {
    if (!brands || !brands.length) return true;
    const itemRows = [...doc.querySelectorAll('table.dtOI tbody tr')];
    const norm = s => s.toLowerCase().replace(/[\s\-]+/g, '');
    return brands.every(brand =>
      itemRows.some(tr => norm(tr.querySelector('td')?.textContent || '').startsWith(norm(brand)))
    );
  }

  // ── Email gate: skipIfRepliedTo / skipIfSent / skipIfNotSent ─────────────────
  function tlCheckEmailGate(doc, step, sentThisRun = new Set()) {
    const emailRows = [...doc.querySelectorAll('tr[data-gbep]')].filter(tr => tr.querySelectorAll('td').length >= 5);
    const isSent     = tr => (tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
    const isReceived = tr => !isSent(tr);
    const decode     = s => { const t=doc.createElement('textarea'); t.innerHTML=s||''; return t.value.replace(/[ \t\r\n]+/g,' ').trim().toLowerCase(); };
    const subj       = tr => decode(tr.querySelectorAll('td')[3]?.textContent||'');
    const sentSubjs  = emailRows.filter(isSent).map(subj);
    const recvSubjs  = emailRows.filter(isReceived).map(subj);
    for (const tag of (step.skipIfRepliedTo || [])) { if (recvSubjs.some(s => s.includes(tag.toLowerCase()))) return false; }
    for (const tag of (step.skipIfSent     || [])) {
      const t = tag.toLowerCase();
      if (sentSubjs.some(s=>s.includes(t)) || sentThisRun.has(t)) return false;
    }
    for (const tag of (step.skipIfNotSent  || [])) {
      const t = tag.toLowerCase();
      if (!sentSubjs.some(s=>s.includes(t)) && !sentThisRun.has(t)) return false;
    }
    return true;
  }

  // ── Condition evaluation engine ─────────────────────────────────────────────
  async function tlEvaluateConditions(step, doc, vars) {
    const conds = step.conditions || [];
    if (!conds.length) return true;
    const logic = step.conditionLogic || 'all';

    const emailRows = [...doc.querySelectorAll('tr[data-gbep]')].filter(tr => tr.querySelectorAll('td').length >= 5);
    const orderRows = [...doc.querySelectorAll('table.dtORD tbody tr')];
    const itemRows  = [...doc.querySelectorAll('table.dtOI tbody tr')];
    const taskRows  = [...doc.querySelectorAll('tr[id^="taskrow_"]')];

    const isSent     = tr => (tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
    const isReceived = tr => !isSent(tr);
    const emailDate  = tr => { const s=tr.querySelectorAll('td')[4]?.textContent.trim()||''; const d=new Date(s); return isNaN(d)?null:d; };
    const daysDiff   = d => d ? Math.floor((Date.now()-d.getTime())/86400000) : Infinity;
    const parseAmt   = s => parseFloat((s||'').replace(/[$,]/g,''))||0;
    const numCmp     = (a,op,b) => { const n=parseFloat(b)||0; return op==='gt'?a>=n:op==='lt'?a<=n:a===n; };
    const decode     = s => { const t=doc.createElement('textarea'); t.innerHTML=s||''; return t.value.replace(/[ \t\r\n]+/g,' ').trim().toLowerCase(); };
    const subj       = tr => decode(tr.querySelectorAll('td')[3]?.textContent||'');

    function evalOne(cond) {
      const {field,op,val} = cond;
      const v    = decode(val);
      const pts  = (val||'').split('|||');
      const vN   = pts[0]!=='' ? (parseFloat(pts[0])??0) : 1;
      const vT   = decode(pts[1]||'');

      if(field==='orderCount')        return numCmp(orderRows.length,op,val);
      if(field==='hasOrdered')        { const h=orderRows.length>0; return op==='is'?h:!h; }
      if(field==='daysSinceOrder')    { const dates=orderRows.map(tr=>new Date(tr.querySelectorAll('td')[2]?.textContent.trim()||'')).filter(d=>!isNaN(d)); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(d=>daysDiff(d))),op,val); }
      if(field==='totalSpend')        return numCmp(orderRows.reduce((s,tr)=>s+parseAmt(tr.querySelectorAll('td')[3]?.textContent),0),op,val);
      if(field==='orderedBrand')      { const norm=s=>s.toLowerCase().replace(/[\s\-]+/g,''); const f=itemRows.some(tr=>norm(tr.querySelector('td')?.textContent||'').startsWith(norm(v))); return op==='is'?f:!f; }
      if(field==='orderKeyword')      { const f=itemRows.some(tr=>(tr.querySelector('td')?.textContent||'').toLowerCase().includes(v)); return op==='has'?f:!f; }
      if(field==='emailSubject')      { const f=emailRows.some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
      if(field==='emailSubjectCount') { const count=emailRows.filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
      if(field==='sentSubject')       { const f=emailRows.filter(isSent).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
      if(field==='sentSubjectCount')  { const count=emailRows.filter(isSent).filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
      if(field==='sentDaysAgo')       { const dates=emailRows.filter(isSent).map(emailDate).filter(Boolean); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(daysDiff)),op,val); }
      if(field==='receivedSubject')   { const f=emailRows.filter(isReceived).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
    if(field==='receivedSubjectCount') { const count=emailRows.filter(isReceived).filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
      if(field==='receivedDaysAgo')   { const dates=emailRows.filter(isReceived).map(emailDate).filter(Boolean); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(daysDiff)),op,val); }
      if(field==='hasReplied')        { const h=emailRows.some(isReceived); return op==='is'?h:!h; }
      if(field==='repliedToSubject')  { const f=emailRows.filter(isReceived).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
      if(field==='openTaskCat')       { return taskRows.some(tr=>{const cat=(tr.querySelector('td[id^="category_"]')?.textContent.trim()||'').toLowerCase(); const st=(tr.querySelector('td[id^="status_"]')?.textContent.trim()||'').toLowerCase(); return !st.includes('complete')&&(op==='has'?cat.includes(v):!cat.includes(v));}); }
      if(field==='openTaskCount')     { const open=taskRows.filter(tr=>!(tr.querySelector('td[id^="status_"]')?.textContent.trim()||'').toLowerCase().includes('complete')).length; return numCmp(open,op,val); }
      if(field==='taskActivityDays')  { const dates=taskRows.map(tr=>{const s=tr.querySelector('td[id^="livedate_"]')?.textContent.trim()||''; return new Date(s);}).filter(d=>!isNaN(d)); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(d=>daysDiff(d))),op,val); }
      if(field==='taskSubject')       { const f=taskRows.some(tr=>(tr.querySelector('td[id^="subject_"]')?.textContent.trim()||'').toLowerCase().includes(v)); return op==='has'?f:!f; }
      if(field==='hasEmail')          { const h=!!(vars.contactEmail&&vars.contactEmail.includes('@')); return op==='is'?h:!h; }
      if(field==='companyName')       { const cn=(vars.companyName||'').toLowerCase(); return op==='has'?cn.includes(v):!cn.includes(v); }
      if(field==='repName')           { const rn=(vars.salesRep||'').toLowerCase(); return op==='has'?rn.includes(v):!rn.includes(v); }
      if(field==='calledDaysAgo'||field==='callCount'||field==='hasBeenCalled') {
        // Activity table: Category col (td[2]) = "Phone Call" or Direction col (td[3]) = "Outbound"/"Inbound"
        // We detect calls as rows where Category col contains "call" (case-insensitive)
        const actRows=[...doc.querySelectorAll('#ActivityTable tbody tr')];
        const callRows=actRows.filter(tr=>{
          const cat=(tr.querySelectorAll('td')[2]?.textContent||'').toLowerCase();
          const subj=(tr.querySelectorAll('td')[4]?.textContent||'').toLowerCase();
          return cat.includes('call')||cat.includes('phone')||subj.includes('call');
        });
        if(field==='hasBeenCalled') { return op==='is'?callRows.length>0:callRows.length===0; }
        if(field==='callCount')     { return numCmp(callRows.length,op,val); }
        if(field==='calledDaysAgo') {
          const dates=callRows.map(tr=>emailDate(tr)).filter(Boolean);
          if(!dates.length) return op==='gt';
          return numCmp(Math.min(...dates.map(daysDiff)),op,val);
        }
      }
      return true;
    }
    const results = conds.map(evalOne);
    return logic==='any' ? results.some(Boolean) : results.every(Boolean);
  }

  // Used only for the fallback mailto execution 
  function tlToPlainText(html) {
    if (!html) return '';
    // Drop trailing <br> inside </p> before anything else — editors inject these
    // as cursor anchors and they stack with the </p> newline to produce triple line breaks.
    let text = html.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');
    text = text.replace(/<br\s*\/?>/gi, '\r\n')
               .replace(/<\/p>/gi, '\r\n\r\n')
               .replace(/<\/li>/gi, '\r\n')
               .replace(/<\/[ou]l>/gi, '\r\n');
    text = text.replace(/<[^>]+>/g, '');
    const decoder = document.createElement('textarea');
    decoder.innerHTML = text;
    return decoder.value.replace(/(\r\n|\n){3,}/g, '\r\n\r\n').trim();
  }
  
  // ── Filtering & sorting ───────────────────────────────────────────────────────
  function tlGetVisible() {
    const today = new Date(); today.setHours(0,0,0,0);
    const q = _tlSearchQ.toLowerCase();
  
    return _tlAllTasks
      .filter(t => {
        if (_tlFilterPri && String(t.priority) !== _tlFilterPri) return false;
        if (_tlFilterStatus === '1' && t.status !== 'New') return false;
        if (_tlFilterStatus === '3' && t.status !== 'Complete') return false;
        if (q && !t.account.toLowerCase().includes(q) &&
                 !t.contact.toLowerCase().includes(q) &&
                 !t.subject.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // ALWAYS force complete items to the bottom of the list
        if (a.status === 'Complete' && b.status !== 'Complete') return 1;
        if (a.status !== 'Complete' && b.status === 'Complete') return -1;
        
        // Then apply normal column sorts
        const dir = _tlSortDir === 'asc' ? 1 : -1;
        if (_tlSortCol === 1) return dir * a.account.localeCompare(b.account);
        if (_tlSortCol === 3) return dir * (a.dueDate - b.dueDate);
        if (_tlSortCol === 5) return dir * (a.priority - b.priority);
        if (_tlSortCol === 6) return dir * a.subject.localeCompare(b.subject);
        return 0;
      });
  }

  function tlUpdateSelectionCounters() {
    const countEl = document.getElementById('__gb-tl-sel-count');
    if (countEl) countEl.textContent = _tlSelectedTasks.size;
    
    const checkAll = document.getElementById('tl-check-all');
    if (checkAll) {
      const visible = tlGetVisible();
      const allSelected = visible.length > 0 && visible.every(t => _tlSelectedTasks.has(t.id));
      checkAll.classList.toggle('checked', allSelected);
    }

    const hasSelection = _tlSelectedTasks.size > 0;
    const openTabsBtn = document.getElementById('btn-open-tabs');
    if (openTabsBtn) openTabsBtn.disabled = !hasSelection;
    const bulkQtBtn = document.getElementById('btn-bulk-qt');
    if (bulkQtBtn) bulkQtBtn.disabled = !hasSelection;
  }

  function tlExtractVarsFromDoc(doc) {
    const val = id => {
      const el = doc.getElementById(id);
      if (!el) return '';
      return (el.value || el.getAttribute('value') || el.textContent || '').trim();
    };
    
    const v = {};
    // Check the rendered label elements first, fallback to the edit modal inputs
    v.firstName       = val('lblContactFirstName') || val('tbContactFirstName');
    v.lastName        = val('lblContactLastName') || val('tbContactLastName');
    v.middleInit      = val('lblContactMiddleInit') || val('tbContactMiddleInit');
    v.fullName        = [v.firstName, v.middleInit, v.lastName].filter(Boolean).join(' ');
    v.companyName     = val('lblContactCompanyName') || val('tbContactCompanyName');
    v.contactEmail    = val('lblContactEmail') || val('tbContactEmailAddress');
    v.contactId       = val('tbContactId') || val('tbContactID');
    v.accountName     = val('Name');
    v.accountId       = val('AccountID');
    
    const repSel = doc.getElementById('ddlSalesRepId');
    v.salesRep = repSel ? (repSel.options[repSel.selectedIndex]?.text?.trim() || '') : '';
    
    const now = new Date();
    v.today       = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
    v.todayLong   = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    return v;
  }
  
  // ── Render the table rows ─────────────────────────────────────────────────────
  function tlRenderRows(tbody) {
    _tlLastCheckedIndex = -1; // Reset selection index on any table re-render
    const today = new Date(); today.setHours(0,0,0,0);
    const visible = tlGetVisible();
  
    tbody.innerHTML = '';
  
    if (!visible.length) {
      tbody.innerHTML = `<tr class="tl-state-row"><td colspan="9">No tasks match your filters.</td></tr>`;
      tlUpdateSelectionCounters();
      return visible.length;
    }
  
    visible.forEach(t => {
      const overdue  = t.dueDate < today;
      const dueToday = t.dueDate.toDateString() === today.toDateString();
      const complete = t.status === 'Complete';
      const isSelected = _tlSelectedTasks.has(t.id);
  
      const priClass = t.priority === 1 ? 'gb-pri-high' : t.priority === 3 ? 'gb-pri-low' : 'gb-pri-med';
      const statusClass = complete ? 'gb-stat-done' : 'gb-stat-new';
  
      const tr = document.createElement('tr');
      tr.dataset.id = t.id;
      if (isSelected) tr.classList.add('selected');
      if (complete) tr.classList.add('is-complete');
      if (overdue)  tr.classList.add('overdue');
      if (dueToday) tr.classList.add('due-today');
  
      tr.innerHTML = `
        <td style="width:50px; padding-right:0 !important;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="tl-checkbox row-check ${isSelected ? 'checked' : ''}" data-id="${t.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            ${overdue && !complete ? `<div title="Overdue" style="width:6px;height:6px;border-radius:50%;background:var(--gb-error, #c86060);box-shadow:0 0 4px rgba(200,96,96,.6);flex-shrink:0;"></div>` : ''}
            ${dueToday && !complete ? `<div title="Due Today" style="width:6px;height:6px;border-radius:50%;background:var(--gb-warn,#f0c060);box-shadow:0 0 4px rgba(240,192,96,.6);flex-shrink:0;"></div>` : ''}
          </div>
        </td>
        <td>
          ${t.accountUrl
            ? `<a class="tl-account-link" href="${t.accountUrl}" target="_blank">${_tlEsc(t.account)}</a>`
            : `<span style="color:rgba(255,255,255,.55)">${_tlEsc(t.account)}</span>`}
        </td>
        <td>
          ${t.contactUrl
            ? `<a class="tl-contact-link" href="${t.contactUrl}" target="_blank">${_tlEsc(t.contact)}</a>`
            : `<span style="color:rgba(255,255,255,.85)">${_tlEsc(t.contact)}</span>`}
        </td>
        <td class="tl-due" style="font-size:12px;font-variant-numeric:tabular-nums;">${_tlEsc(t.due)}</td>
        <td style="font-size:11px;color:rgba(255,255,255,.45);font-weight:500;">${_tlEsc(t.category)}</td>
        <td><span class="gb-pill ${priClass}">${_tlEsc(t.priorityLabel)}</span></td>
        <td style="max-width:260px;line-height:1.4;"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tlEsc(t.subject)}</span></td>
        <td>
          <span class="gb-pill ${statusClass}">${complete ? 'Done' : 'New'}</span>
        </td>
        <td class="tl-action-cell" style="white-space:nowrap;">
          <button class="qt-trigger" data-id="${t.id}" data-status="${complete ? 'Complete' : 'New'}">
            Quick Task
            <svg class="qt-chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  
    tlUpdateSelectionCounters();
    return visible.length;
  }
  
  function _tlEsc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  
  // ── Build & open the modal ────────────────────────────────────────────────────
  function tlUpdateCount(n, total) {
    const el = document.getElementById('__gb-tl-count');
    if (el) el.textContent = n === total ? `${total} tasks` : `${n} of ${total} tasks`;
  }
  
  async function __gbShowTaskListModal() {
    if (document.getElementById('__gb-tl-overlay')) return;
  
    const overlay = document.createElement('div');
    overlay.id = '__gb-tl-overlay';
    _tlOverlay = overlay;
  
    overlay.innerHTML = `
      <div id="__gb-tl-card">
        <div id="__gb-tl-hdr">
          <div id="__gb-tl-hdr-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div>
            <div id="__gb-tl-hdr-title">My Task List</div>
            <div id="__gb-tl-hdr-sub">Loading…</div>
          </div>
          <button id="__gb-tl-close">
            <svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close
          </button>
        </div>
  
        <div id="__gb-tl-toolbar">
          <div id="__gb-tl-search-wrap">
            <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="__gb-tl-search" type="text" placeholder="Search account, contact, subject…">
          </div>
          
          <div class="tl-dropdown-wrap" id="wrap_tl-filter-status" style="width: 150px;">
            <button type="button" class="tl-dropdown-btn" id="btn_tl-filter-status">
              <span class="tl-btn-label" id="label_tl-filter-status">New tasks</span>
              <svg class="tl-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tl-dropdown-menu" id="menu_tl-filter-status">
              <div class="tl-dropdown-option selected" data-value="1"><span>New tasks</span></div>
              <div class="tl-dropdown-option" data-value="3"><span>Completed</span></div>
              <div class="tl-dropdown-option" data-value="0"><span>All statuses</span></div>
            </div>
            <input type="hidden" id="__gb-tl-filter-status" value="1">
          </div>
  
          <div class="tl-dropdown-wrap" id="wrap_tl-filter-pri" style="width: 150px;">
            <button type="button" class="tl-dropdown-btn" id="btn_tl-filter-pri">
              <span class="tl-btn-label" id="label_tl-filter-pri">All priorities</span>
              <svg class="tl-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="tl-dropdown-menu" id="menu_tl-filter-pri">
              <div class="tl-dropdown-option selected" data-value=""><span>All priorities</span></div>
              <div class="tl-dropdown-option" data-value="1"><span>High</span></div>
              <div class="tl-dropdown-option" data-value="2"><span>Medium</span></div>
              <div class="tl-dropdown-option" data-value="3"><span>Low</span></div>
            </div>
            <input type="hidden" id="__gb-tl-filter-pri" value="">
          </div>
  
          <button id="__gb-tl-reload">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.49"/></svg>
            Refresh
          </button>
          <span id="__gb-tl-count"></span>
        </div>
  
        <div id="__gb-tl-body">
          <table id="__gb-tl-table">
            <thead>
              <tr>
                <th style="width:50px; padding-right:0 !important; cursor:default !important;">
                  <div class="tl-checkbox" id="tl-check-all" title="Select All Visible">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </th>
                <th data-col="1">Account</th>
                <th data-col="2">Contact</th>
                <th data-col="3" class="sort-asc">Due Date</th>
                <th data-col="4">Category</th>
                <th data-col="5">Priority</th>
                <th data-col="6">Subject</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="__gb-tl-tbody">
              <tr class="tl-state-row"><td colspan="9">
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
                  <div style="width:18px;height:18px;border:3px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2);border-top-color:var(--gb-brand-label, #7db82a);border-radius:50% !important;animation:__gbTlSpin .7s linear infinite;"></div>
                  Loading tasks…
                </div>
              </td></tr>
            </tbody>
          </table>
        </div>

        <div id="__gb-tl-footer">
          <div style="display:flex; align-items:center; gap: 8px;">
            <div id="__gb-tl-selection-info">Bulk Actions (<span id="__gb-tl-sel-count">0</span> selected)</div>
            <button id="btn-open-tabs" title="Open selected contacts in new tabs" disabled>
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
            <button id="btn-bulk-qt" class="qt-trigger" disabled>
              Quick Task
              <svg class="qt-chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
             <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
               <div class="tl-dropdown-wrap dropup" id="wrap_tl-campaign-add" style="width:220px;">
                 <button type="button" class="tl-dropdown-btn" id="btn_tl-campaign-add">
                   <span class="tl-btn-label" id="label_tl-campaign-add">Loading…</span>
                   <svg class="tl-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                 </button>
                 <div class="tl-dropdown-menu" id="menu_tl-campaign-add"></div>
                 <input type="hidden" id="__gb-tl-campaign-add" value="">
               </div>
               <button id="btn-tl-new-campaign" title="Create or edit campaigns" style="height:38px !important;width:38px !important;border-radius:8px !important;border:1px solid rgba(255,255,255,.12) !important;background:rgba(255,255,255,.06) !important;color:rgba(255,255,255,.7) !important;font-size:16px !important;font-weight:600 !important;cursor:pointer !important;display:flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0 !important;transition:all .15s !important;">+</button>
               <button id="btn-run-campaign">Run Campaign</button>
             </div>
          </div>
        </div>

      </div>
    `;
  
    document.body.appendChild(overlay);

    // ── Shared Quick Task floating menu ──────────────────────────────────────
    const qtMenu = document.createElement('div');
    qtMenu.id = '__gb-tl-qt-menu';
    qtMenu.style.display = 'none';
    document.body.appendChild(qtMenu);
    let _qtActiveId = null;
    let _qtAnchorRect = null;

    function qtClose() {
      qtMenu.style.display = 'none';
      _qtActiveId = null;
    }

    // Builds the SVG calendar icon used across menu views
    const QT_CAL_SVG = '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

    // Returns today's date in YYYY-MM-DD format for date input default
    function qtTodayInput() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    // Converts YYYY-MM-DD (from <input type=date>) to MM/DD/YYYY for the API
    function qtDateInputToApi(val) {
      if (!val) return null;
      const [y, m, d] = val.split('-');
      return m + '/' + d + '/' + y;
    }

    // Single-task main menu
    function qtShowMain(taskId, anchorRect) {
      _qtAnchorRect = anchorRect;
      const task = _tlAllTasks.find(t => t.id === taskId);
      if (!task) return;
      const isComplete = task.status === 'Complete';
      const pushDays = Math.max(1, parseInt(document.getElementById('tl-push-days')?.value || '7', 10));
      qtMenu.innerHTML =
        '<div class="qt-header">' +
          '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2h11"/></svg>' +
          ' Quick Task' +
        '</div>' +
        (isComplete
          ? '<div class="qt-item qt-reopen-item" data-qt-action="reopen"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.49"/></svg> Reopen</div>'
          : '<div class="qt-item qt-complete-item" data-qt-action="complete"><svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Complete</div>') +
        '<div class="qt-item qt-push-item" data-qt-action="push">' + QT_CAL_SVG +
          ' Push Out ' + pushDays + ' day' + (pushDays !== 1 ? 's' : '') +
        '</div>' +
        '<div class="qt-item qt-push-item" data-qt-action="set-date">' + QT_CAL_SVG +
          ' Set Date' +
          '<svg class="qt-arrow" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>' +
        '<div class="qt-item qt-new-item" data-qt-action="new-task">' +
          '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
          ' Add Task' +
          '<svg class="qt-arrow" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      qtPosition(anchorRect);
    }

    // Bulk menu (opened from footer Quick Task button)
    function qtShowBulk(anchorRect) {
      _qtAnchorRect = anchorRect;
      const n = _tlSelectedTasks.size;
      const pushDays = Math.max(1, parseInt(document.getElementById('tl-push-days')?.value || '7', 10));
      qtMenu.innerHTML =
        '<div class="qt-header">' +
          '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2h11"/></svg>' +
          ' Quick Task &mdash; ' + n + ' selected' +
        '</div>' +
        '<div class="qt-item qt-complete-item" data-qt-action="bulk-complete">' +
          '<svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Complete All' +
        '</div>' +
        '<div class="qt-item qt-push-item" data-qt-action="bulk-push">' + QT_CAL_SVG +
          ' Push Out ' + pushDays + ' day' + (pushDays !== 1 ? 's' : '') +
        '</div>' +
        '<div class="qt-item qt-push-item" data-qt-action="bulk-set-date">' + QT_CAL_SVG +
          ' Set Date' +
          '<svg class="qt-arrow" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>' +
        '<div class="qt-item qt-new-item" data-qt-action="bulk-new-task">' +
          '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
          ' Add Task to All' +
          '<svg class="qt-arrow" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      qtPosition(anchorRect);
    }

    // Date picker sub-panel (shared by single and bulk)
    function qtShowDatePicker(returnAction, anchorRect) {
      qtMenu.innerHTML =
        '<div class="qt-back" data-qt-action="back">' +
          '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back' +
        '</div>' +
        '<div class="qt-header" style="border-top:none;margin-top:0;">Set due date</div>' +
        '<div class="qt-input-row">' +
          '<input type="date" id="qt-date-input" value="' + qtTodayInput() + '">' +
          '<button class="qt-confirm-btn" data-qt-action="' + returnAction + '-confirm">Set</button>' +
        '</div>';
      qtPosition(anchorRect);
      // Focus the input after render
      setTimeout(() => document.getElementById('qt-date-input')?.focus(), 50);
    }

    function qtShowTemplates(anchorRect, isBulk) {
      const taskTpls = _tlNoteTemplates.filter(t => t.subType === 'task' && t.enabled !== false);
      const bulkAttr = isBulk ? ' data-bulk="1"' : '';
      qtMenu.innerHTML =
        '<div class="qt-back" data-qt-action="back">' +
          '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back' +
        '</div>' +
        '<div class="qt-header" style="border-top:none;margin-top:0;">Pick a task template</div>' +
        '<div class="qt-tpl-list">' +
          (taskTpls.length
            ? taskTpls.map(t => '<div class="qt-tpl-item" data-qt-action="create-task" data-tpl-id="' + t.id + '"' + bulkAttr + '>' + _tlEsc(t.name) + '</div>').join('')
            : '<div class="qt-tpl-empty">No task templates found.<br>Add some in the manager.</div>') +
        '</div>';
      qtPosition(anchorRect);
    }

    function qtPosition(anchorRect) {
      qtMenu.style.display = 'block';
      const menuH = qtMenu.offsetHeight || 200;
      const spaceBelow = window.innerHeight - anchorRect.bottom - 6;
      const top = spaceBelow >= menuH ? anchorRect.bottom + 4 : anchorRect.top - menuH - 4;
      const left = Math.min(anchorRect.left, window.innerWidth - 190);
      qtMenu.style.top  = top + 'px';
      qtMenu.style.left = left + 'px';
    }

    // Dismiss on outside click
    document.addEventListener('click', e => {
      if (_qtActiveId && !qtMenu.contains(e.target) && !e.target.closest('.qt-trigger')) qtClose();
    }, true);

    const tbody = document.getElementById('__gb-tl-tbody');
    const sub   = document.getElementById('__gb-tl-hdr-sub');
  
    // ── Dropdown Binding Logic ───────────────────────────────────────────────
    const bindDropdown = (baseId, onChangeCallback) => {
      const wrap = document.getElementById('wrap_' + baseId);
      const btn = document.getElementById('btn_' + baseId);
      const menu = document.getElementById('menu_' + baseId);
      const label = document.getElementById('label_' + baseId);
      const hidden = document.getElementById('__gb-' + baseId);
      if (!wrap || !btn || !menu || !label || !hidden) return;
  
      const options = menu.querySelectorAll('.tl-dropdown-option');
  
      // Re-add listener ONLY if not previously bound
      if (!btn.dataset.bound) {
        btn.dataset.bound = "true";
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = menu.classList.contains('open');
          document.querySelectorAll('.tl-dropdown-menu.open').forEach(m => m.classList.remove('open'));
          document.querySelectorAll('.tl-dropdown-btn.open').forEach(b => b.classList.remove('open'));
          
          if (!isOpen) {
            menu.classList.add('open');
            btn.classList.add('open');
          }
        });
        
        document.addEventListener('click', (e) => {
          if (!wrap.contains(e.target)) {
            menu.classList.remove('open');
            btn.classList.remove('open');
          }
        });
      }
  
      // Clear old listeners by cloning (if needed, but simple re-assignment of options is fine)
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          label.textContent = opt.querySelector('span')?.textContent || opt.textContent;
          hidden.value = val;
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          menu.classList.remove('open');
          btn.classList.remove('open');
          if (onChangeCallback) onChangeCallback(val);
        });
      });
    };
  
    // ── Wire all events ───────────────────────────────────────────────────────
  
    const close = () => {
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .15s';
      
      _tlSelectedTasks.clear();
      _tlLastCheckedIndex = -1;
      qtClose();
      
      setTimeout(() => { overlay.remove(); qtMenu.remove(); }, 160);
      _tlOverlay = null;
    };
    document.getElementById('__gb-tl-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  
    const onKey = e => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  
    // Search
    document.getElementById('__gb-tl-search')?.addEventListener('input', e => {
      _tlSearchQ = e.target.value;
      const n = tlRenderRows(tbody);
      tlUpdateCount(n, _tlAllTasks.length);
    });
  
    // Filters
    bindDropdown('tl-filter-status', (val) => {
      _tlFilterStatus = val;
      const n = tlRenderRows(tbody);
      tlUpdateCount(n, _tlAllTasks.length);
    });
    
    bindDropdown('tl-filter-pri', (val) => {
      _tlFilterPri = val;
      const n = tlRenderRows(tbody);
      tlUpdateCount(n, _tlAllTasks.length);
    });
  
    // Sort on column header click
    document.querySelector('#__gb-tl-table thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-col]');
      if (!th) return;
      const col = +th.dataset.col;
      if (_tlSortCol === col) {
        _tlSortDir = _tlSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _tlSortCol = col; _tlSortDir = 'asc';
      }
      document.querySelectorAll('#__gb-tl-table thead th[data-col]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(_tlSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      const n = tlRenderRows(tbody);
      tlUpdateCount(n, _tlAllTasks.length);
    });
    
    // Select All Checkbox
    document.getElementById('tl-check-all')?.addEventListener('click', (e) => {
      const checkAll = e.currentTarget;
      const isChecked = checkAll.classList.contains('checked');
      const visible = tlGetVisible();
      if (isChecked) {
        visible.forEach(t => _tlSelectedTasks.delete(t.id));
      } else {
        visible.forEach(t => _tlSelectedTasks.add(t.id));
      }
      tlRenderRows(tbody); // Re-render to apply classes
    });

    // Open Selected Tabs
    document.getElementById('btn-open-tabs')?.addEventListener('click', () => {
      if (_tlSelectedTasks.size === 0) return;
      const tasksToOpen = _tlAllTasks.filter(t => _tlSelectedTasks.has(t.id));
      tasksToOpen.forEach(t => {
        if (t.contactUrl) {
          window.open(t.contactUrl, '_blank');
        }
      });
    });


    // ── Run Campaign Engine ───────────────────────────────────────────────────
    document.getElementById('btn-run-campaign')?.addEventListener('click', async () => {
      if (!_tlSelectedCampaign) return alert('Select a campaign from the dropdown first.');
      if (_tlSelectedTasks.size === 0) return alert('Select at least one task to run the campaign on.');

      const campaign = _tlCampaigns.find(c => c.id === _tlSelectedCampaign);
      if (!campaign || !campaign.steps?.length) return alert('Campaign has no steps. Click + to edit it.');

      const { featureFlags, emailSignature, gbEmployeeId } = await chrome.storage.local.get(['featureFlags', 'emailSignature', 'gbEmployeeId']);
      const isPA  = featureFlags?.replyWithTemplateEnabled && featureFlags?.powerAutomateUrl;
      const empId = gbEmployeeId || '0';

      // Delay = campaign setting (with jitter), falls back to featureFlags global
      const delayBase = Math.max(5, campaign.delayBase ?? 60);
      const delayTol  = Math.max(0, campaign.delayTolerance ?? 20);
      const calcDelay = () => delayBase + Math.floor(Math.random() * (delayTol + 1));

      // Build template lookup map (email templates + note templates combined)
      const tplMap = {};
      _tlAccountTemplates.forEach(t => { tplMap[t.id] = t; });
      _tlNoteTemplates.forEach(t => { tplMap[t.id] = t; });

      // Weighted random pick for A/B splits
      function pickSplit(splits) {
        if (!splits?.length) return null;
        const total = splits.reduce((s, sp) => s + (sp.pct || 0), 0);
        let r = Math.random() * total, cum = 0;
        for (const sp of splits) { cum += (sp.pct || 0); if (r < cum) return sp.templateId; }
        return splits[splits.length - 1].templateId;
      }

      const runBtn = document.getElementById('btn-run-campaign');
      runBtn.disabled = true;
      const origBtnText = runBtn.textContent;

      const tasksToRun = Array.from(_tlSelectedTasks);
      let paEmailsSentThisRun = 0; // only delay after at least one PA email actually went out

      for (let i = 0; i < tasksToRun.length; i++) {
        const id   = tasksToRun[i];
        const task = _tlAllTasks.find(t => t.id === id);
        if (!task || !task.contactUrl) continue;

        // Inter-contact delay: PA only, only after at least one email was actually sent
        // (filters may have skipped previous contacts entirely — no need to rate-limit nothing)
        const hasExplicitDelay = campaign.steps.some(s => s.type === 'delay');
        if (paEmailsSentThisRun > 0 && isPA && !hasExplicitDelay) {
          const delaySec = calcDelay();
          for (let s = delaySec; s > 0; s--) {
            runBtn.textContent = `Waiting ${s}s… (${i}/${tasksToRun.length})`;
            if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        runBtn.textContent = `Running ${i + 1}/${tasksToRun.length}…`;

        const tr = document.querySelector(`tr[data-id="${id}"]`);
        const actionTd = tr?.querySelector('.tl-action-cell');
        const spinnerHTML = `<div style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;"><div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:var(--gb-brand-label,#7db82a);border-radius:50% !important;animation:__gbTlSpin .7s linear infinite;"></div></div>`;
        if (actionTd) actionTd.innerHTML = spinnerHTML;

        try {
          // Fetch contact page for vars + email
          const resp = await new Promise(res => chrome.runtime.sendMessage({ action: 'fetchRaw', url: task.contactUrl }, res));
          if (!resp?.ok) throw new Error('Contact page fetch failed');
          const doc  = new DOMParser().parseFromString(resp.text, 'text/html');
          const base = doc.createElement('base');
          base.href  = 'https://api.golfballs.com/golfballs/adminnew/';
          doc.head.appendChild(base);

          const vars = tlExtractVarsFromDoc(doc);

          // Augment vars with order/email data for template variable injection
          const _orderTrs = [...doc.querySelectorAll('table.dtORD tbody tr')];
          vars.orderCount     = String(_orderTrs.length);
          vars.totalSpend     = '$' + _orderTrs.reduce((s,tr)=>{
            return s + (parseFloat((tr.querySelectorAll('td')[3]?.textContent||'').replace(/[$,]/g,''))||0);
          }, 0).toFixed(2);
          const _lastDateTd   = _orderTrs[0]?.querySelectorAll('td')[2];
          vars.lastOrderDate  = _lastDateTd?.textContent.trim() || '';
          const _itemTrs      = [...doc.querySelectorAll('table.dtOI tbody tr')];
          vars.recentBrands   = [...new Set(_itemTrs.map(tr => {
            const name = tr.querySelector('td')?.textContent.trim() || '';
            return _TL_BRANDS.find(b => name.toLowerCase().startsWith(b.toLowerCase())) || '';
          }).filter(Boolean))].slice(0,4).join(', ');

          const fmt  = d => `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
          // renderStr is used only for task subject/description (plain string templates).
          // Email templates use resolveAllVarsAsync per-step so all builtins resolve correctly.
          const renderStr = str => (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);


          // ── Campaign runner ─────────────────────────────────────────────────
          // executeStep handles all types including branch (recursive child execution).
          // sentThisRun: tracks subjects sent THIS run so gate checks work mid-run.
          // firedBranchGroups: mutual exclusion — once a branch in a group fires, rest skip.
          const sentThisRun      = new Set();
          const firedBranchGroups = new Set();

          async function executeStep(step) {

            // ── BRANCH: if/then block ──────────────────────────────────────────
            if (step.type === 'branch') {
              if (step.branchGroup && firedBranchGroups.has(step.branchGroup)) return;
              if (!await tlEvaluateConditions(step, doc, vars)) return;

              // Lock group immediately — this is the right branch for this contact.
              // Prevents other branches in same group from firing even if no email sends.
              if (step.branchGroup) firedBranchGroups.add(step.branchGroup);

              // Execute child steps — only 1 email fires per run.
              // Task steps only run if an email was sent this run.
              let emailSentInBranch = false;
              for (const child of (step.steps || [])) {
                if (child.type === 'email') {
                  if (emailSentInBranch) continue; // already sent one — skip remaining emails
                  if (child.brandFilter?.length && !tlCheckBrandFilter(doc, child.brandFilter)) continue;
                  if (!await tlEvaluateConditions(child, doc, vars)) continue;
                  if (!tlCheckEmailGate(doc, child, sentThisRun)) continue;
                  if (!tlMatchesSubjectFilter(doc, child)) continue;
                  const tplId = pickSplit(child.splits);
                  const tpl   = tplMap[tplId];
                  if (!tpl) throw new Error(`Email template not found (${tplId})`);
                  let toEmail = vars.contactEmail || '';
                  let resolved = {};
                  if (typeof resolveAllVarsAsync === 'function') {
                    const rx = await resolveAllVarsAsync(tpl.vars, tpl.toField, doc);
                    resolved = rx.resolved || {};
                    if (rx.toEmail) toEmail = rx.toEmail;
                  }
                  const ctx = { ...vars, ...resolved };
                  const renderTpl = str => (str||'').replace(/\{\{(\w+)\}\}/g, (_,k) => ctx[k] ?? `{{${k}}}`);
                  if (!toEmail?.includes('@')) throw new Error('No email address found');
                  const subject  = renderTpl(tpl.subject);
                  const bodyHtml = renderTpl(tpl.body);
                  if (isPA) {
                    let html = bodyHtml;
                    if (emailSignature) html += '<br><div>' + emailSignature + '</div>';
                    const paResult = await new Promise(res => chrome.runtime.sendMessage({
                      action: 'paAutomate', paUrl: featureFlags.powerAutomateUrl,
                      payload: { emails: [{ to: toEmail, subject, htmlBody: html, replyMode: child.replyMode || tpl.replyMode || 'standalone' }] }
                    }, res));
                    if (paResult?.results?.[0]?.status !== 'sent') throw new Error(`PA: ${paResult?.results?.[0]?.error || 'Send failed'}`);
                  } else {
                    window.open(`mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(tlToPlainText(bodyHtml))}`, '_blank');
                  }
                  if (child.subject) sentThisRun.add(child.subject.toLowerCase());
                  emailSentInBranch = true;
                  paEmailsSentThisRun++;

                } else if (child.type === 'complete_task') {
                  if (!emailSentInBranch) continue;
                  // Optional gate: only complete if a specific email was sent this run
                  if (child.skipIfNotSent?.length) {
                    const missing = child.skipIfNotSent.some(t => !sentThisRun.has(t.toLowerCase()));
                    if (missing) continue;
                  }
                  await tlCompleteTask(id);
                  task.status = 'Complete';
                  _tlSelectedTasks.delete(id);
                  if (tr) { tr.classList.add('is-complete'); tr.classList.remove('selected'); tr.querySelector('.row-check')?.classList.remove('checked'); }

                } else if (child.type === 'create_task') {
                  if (!emailSentInBranch) continue;
                  // Gate: only create if the specific email that unlocks this task was sent this run
                  if (child.skipIfNotSent?.length) {
                    const missing = child.skipIfNotSent.some(t => !sentThisRun.has(t.toLowerCase()));
                    if (missing) continue;
                  }
                  if (!await tlEvaluateConditions(child, doc, vars)) continue;
                  const tpl = tplMap[child.noteTemplateId];
                  if (tpl && vars.contactId) {
                    const today = new Date();
                    const due   = tpl.daysOut != null ? (() => { const d=new Date(); d.setDate(d.getDate()+tpl.daysOut); return fmt(d); })() : fmt(today);
                    const payload = {
                      TaskID:'', Subject:renderStr(tpl.subject||tpl.name), Description:renderStr(tpl.body||''),
                      LiveDate:fmt(today), DueDate:due, taskCategoryID:String(tpl.categoryId||'0'), taskStatusID:'1',
                      Priority:String(tpl.priority||'2'), contactID:String(vars.contactId),
                      leadID:'0', employeeID:String(empId), caseID:0
                    };
                    await fetch(`https://api.golfballs.com/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(payload))}`, {credentials:'include'});
                  }

                } else if (child.type === 'delay') {
                  if (!emailSentInBranch) continue;
                  if (isPA) {
                    const base = Math.max(5, child.delayBase ?? delayBase);
                    const tol  = Math.max(0, child.delayTolerance ?? delayTol);
                    const sec  = base + Math.floor(Math.random() * (tol + 1));
                    for (let s = sec; s > 0; s--) {
                      runBtn.textContent = `Waiting ${s}s…`;
                      if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
                      await new Promise(r => setTimeout(r, 1000));
                    }
                  }
                }
              }
              // Signal to outer loop if email sent and campaign wants to stop
              if (emailSentInBranch) sentThisRun.add('__branch_sent__');
              return;
            }
            if (step.type === 'email') {
              if (step.brandFilter?.length && !tlCheckBrandFilter(doc, step.brandFilter)) return;
              if (!await tlEvaluateConditions(step, doc, vars)) return;
              if (!tlCheckEmailGate(doc, step, sentThisRun)) return;
              if (!tlMatchesSubjectFilter(doc, step)) return;
              const tplId = pickSplit(step.splits);
              const tpl   = tplMap[tplId];
              if (!tpl) throw new Error(`Email template not found (${tplId})`);
              let toEmail = vars.contactEmail || '';
              let resolved = {};
              if (typeof resolveAllVarsAsync === 'function') {
                const rx = await resolveAllVarsAsync(tpl.vars, tpl.toField, doc);
                resolved = rx.resolved || {};
                if (rx.toEmail) toEmail = rx.toEmail;
              }
              const ctx = { ...vars, ...resolved };
              const renderTpl = str => (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
              const email = toEmail;
              if (!email?.includes('@')) throw new Error('No email address found');
              const subject  = renderTpl(tpl.subject);
              const bodyHtml = renderTpl(tpl.body);
              if (isPA) {
                let html = bodyHtml;
                if (emailSignature) html += '<br><div>' + emailSignature + '</div>';
                const paResult = await new Promise(res => chrome.runtime.sendMessage({
                  action: 'paAutomate', paUrl: featureFlags.powerAutomateUrl,
                  payload: { emails: [{ to: email, subject, htmlBody: html, replyMode: step.replyMode || tpl.replyMode || 'standalone' }] }
                }, res));
                if (paResult?.results?.[0]?.status !== 'sent') throw new Error(`PA: ${paResult?.results?.[0]?.error || 'Send failed'}`);
              } else {
                window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(tlToPlainText(bodyHtml))}`, '_blank');
              }
              if (step.subject) sentThisRun.add(step.subject.toLowerCase());
              paEmailsSentThisRun++;
              return;
            }

            // ── COMPLETE TASK ──────────────────────────────────────────────────
            if (step.type === 'complete_task') {
              if (!await tlEvaluateConditions(step, doc, vars)) return;
              await tlCompleteTask(id);
              task.status = 'Complete';
              _tlSelectedTasks.delete(id);
              if (tr) { tr.classList.add('is-complete'); tr.classList.remove('selected'); tr.querySelector('.row-check')?.classList.remove('checked'); }
              return;
            }

            // ── DELAY ──────────────────────────────────────────────────────────
            if (step.type === 'delay') {
              if (!await tlEvaluateConditions(step, doc, vars)) return;
              if (isPA) {
                const base = Math.max(5, step.delayBase ?? delayBase);
                const tol  = Math.max(0, step.delayTolerance ?? delayTol);
                const sec  = base + Math.floor(Math.random() * (tol + 1));
                for (let s = sec; s > 0; s--) {
                  runBtn.textContent = `Waiting ${s}s… (step delay, ${i+1}/${tasksToRun.length})`;
                  if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
                  await new Promise(r => setTimeout(r, 1000));
                }
                runBtn.textContent = `Running ${i + 1}/${tasksToRun.length}…`;
              }
              return;
            }

            // ── CREATE TASK ────────────────────────────────────────────────────
            if (step.type === 'create_task') {
              if (!await tlEvaluateConditions(step, doc, vars)) return;
              if (step.brandFilter?.length && !tlCheckBrandFilter(doc, step.brandFilter)) return;
              const tpl = tplMap[step.noteTemplateId];
              if (tpl && vars.contactId) {
                const today = new Date();
                const due   = tpl.daysOut != null ? (() => { const d = new Date(); d.setDate(d.getDate() + tpl.daysOut); return fmt(d); })() : fmt(today);
                const payload = {
                  TaskID: '', Subject: renderStr(tpl.subject || tpl.name), Description: renderStr(tpl.body || ''),
                  LiveDate: fmt(today), DueDate: due, taskCategoryID: String(tpl.categoryId || '0'), taskStatusID: '1',
                  Priority: String(tpl.priority || '2'), contactID: String(vars.contactId),
                  leadID: '0', employeeID: String(empId), caseID: 0
                };
                await fetch(`https://api.golfballs.com/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
              }
              return;
            }
          }

          for (const step of campaign.steps) {
            await executeStep(step);
            // Stop processing further steps if campaign is set to stop after first send
            if (campaign.stopAfterFirstSend !== false && sentThisRun.has('__branch_sent__')) break;
          }

          // Success
          if (actionTd) actionTd.innerHTML = `<div style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;"><svg width="18" height="18" fill="none" stroke="var(--gb-brand-label,#7db82a)" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>`;

        } catch (err) {
          console.error('[GB TL] campaign error', id, err);
          if (actionTd) actionTd.innerHTML = `<div style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;"><span style="color:var(--gb-error,#c86060);font-size:11px;font-weight:600;" title="${err.message}">Error</span></div>`;
        }
      }

      runBtn.disabled = false;
      runBtn.textContent = origBtnText;
      tlUpdateSelectionCounters();
      tlUpdateCount(tlGetVisible().length, _tlAllTasks.length);
    });
    // Row Actions (Checkboxes & Complete/Reopen)
    tbody.addEventListener('click', async e => {
      // 1. Checkboxes (with Shift-Click logic)
      const rowCheck = e.target.closest('.row-check');
      if (rowCheck) {
        // Prevent text highlighting when shift clicking
        if (e.shiftKey) window.getSelection()?.removeAllRanges();

        const id = rowCheck.dataset.id;
        const visible = tlGetVisible();
        const currentIndex = visible.findIndex(t => t.id === id);
        const isSelecting = !_tlSelectedTasks.has(id);

        if (e.shiftKey && _tlLastCheckedIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(_tlLastCheckedIndex, currentIndex);
          const end = Math.max(_tlLastCheckedIndex, currentIndex);
          const rows = tbody.querySelectorAll('tr[data-id]');
          
          for (let i = start; i <= end; i++) {
            const tId = visible[i].id;
            const tr = rows[i];
            if (!tr) continue;
            const check = tr.querySelector('.row-check');
            
            if (isSelecting) {
              _tlSelectedTasks.add(tId);
              if (check) check.classList.add('checked');
              tr.classList.add('selected');
            } else {
              _tlSelectedTasks.delete(tId);
              if (check) check.classList.remove('checked');
              tr.classList.remove('selected');
            }
          }
        } else {
          // Standard single click
          const tr = rowCheck.closest('tr');
          if (isSelecting) {
            _tlSelectedTasks.add(id);
            rowCheck.classList.add('checked');
            tr.classList.add('selected');
          } else {
            _tlSelectedTasks.delete(id);
            rowCheck.classList.remove('checked');
            tr.classList.remove('selected');
          }
        }

        _tlLastCheckedIndex = currentIndex;
        tlUpdateSelectionCounters();
        return;
      }

      // 2. Quick Task trigger (per-row only — bulk handled below)
      const qtTrigger = e.target.closest('.qt-trigger[data-id]');
      if (qtTrigger) {
        const taskId = qtTrigger.dataset.id;
        if (_qtActiveId === taskId) { qtClose(); return; }
        _qtActiveId = taskId;
        qtShowMain(taskId, qtTrigger.getBoundingClientRect());
        return;
      }
    });

    // Bulk Quick Task button
    document.getElementById('btn-bulk-qt')?.addEventListener('click', function() {
      if (_qtActiveId === 'bulk') { qtClose(); return; }
      _qtActiveId = 'bulk';
      qtShowBulk(this.getBoundingClientRect());
    });

    // ── Quick Task menu action handler ────────────────────────────────────────
    qtMenu.addEventListener('click', async e => {
      const item = e.target.closest('[data-qt-action]');
      if (!item) return;
      const action = item.dataset.qtAction;
      const taskId = _qtActiveId;  // either a task ID string or 'bulk'
      const isBulk = taskId === 'bulk';

      // ── Navigation ──────────────────────────────────────────────────────
      if (action === 'new-task')      { qtShowTemplates(_qtAnchorRect, false); return; }
      if (action === 'bulk-new-task') { qtShowTemplates(_qtAnchorRect, true);  return; }
      if (action === 'set-date')      { qtShowDatePicker('set-date',   _qtAnchorRect); return; }
      if (action === 'bulk-set-date') { qtShowDatePicker('bulk-set-date', _qtAnchorRect); return; }
      if (action === 'back') {
        isBulk ? qtShowBulk(_qtAnchorRect) : qtShowMain(taskId, _qtAnchorRect);
        return;
      }

      // ── Helpers ─────────────────────────────────────────────────────────
      const spinner = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:var(--gb-brand-label,#7db82a);border-radius:50% !important;animation:__gbTlSpin .7s linear infinite;"></div>';

      function rowSpinner(id) {
        const tr = document.querySelector('#__gb-tl-tbody tr[data-id="' + id + '"]');
        const td = tr?.querySelector('.tl-action-cell');
        const btn = td?.querySelector('.qt-trigger');
        if (btn) { btn.disabled = true; btn.innerHTML = spinner; }
        return { tr, td, btn };
      }
      function rowRestoreBtn(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = 'Quick Task <svg class="qt-chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
      }
      function rowDueTd(tr, dateStr) {
        // dateStr is MM/DD/YYYY — update the visible cell and strip overdue class
        const td = tr?.querySelector('.tl-due');
        if (td) { td.textContent = dateStr; tr.classList.remove('overdue', 'due-today'); }
      }

      // ── Single-task actions ─────────────────────────────────────────────
      if (!isBulk && ['complete','reopen','push','create-task','set-date-confirm'].includes(action)) {
        const task = _tlAllTasks.find(t => t.id === taskId);
        if (!task) { qtClose(); return; }
        const { tr, td, btn } = rowSpinner(taskId);
        qtClose();

        try {
          if (action === 'complete') {
            await tlCompleteTask(taskId);
            task.status = 'Complete';
            const n = tlRenderRows(tbody); tlUpdateCount(n, _tlAllTasks.length);

          } else if (action === 'reopen') {
            await tlReopenTask(taskId);
            task.status = 'New';
            const n = tlRenderRows(tbody); tlUpdateCount(n, _tlAllTasks.length);

          } else if (action === 'push') {
            const days = Math.max(1, parseInt(document.getElementById('tl-push-days')?.value || '7', 10));
            await tlPushTaskDate(taskId, days);
            const nd = new Date(); nd.setDate(nd.getDate() + days);
            const fmt = d => (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();
            task.due = fmt(nd); task.dueDate = nd;
            rowDueTd(tr, task.due);
            rowRestoreBtn(btn);

          } else if (action === 'set-date-confirm') {
            const val = document.getElementById('qt-date-input')?.value;
            const apiDate = qtDateInputToApi(val);
            if (!apiDate) { rowRestoreBtn(btn); return; }
            await tlSetTaskDate(taskId, apiDate);
            const parts = apiDate.split('/');
            task.due = apiDate; task.dueDate = new Date(parseInt(parts[2]), parseInt(parts[0])-1, parseInt(parts[1]));
            rowDueTd(tr, apiDate);
            rowRestoreBtn(btn);

          } else if (action === 'create-task') {
            const tpl = _tlNoteTemplates.find(t => t.id === item.dataset.tplId);
            if (!tpl) { rowRestoreBtn(btn); return; }
            const { gbEmployeeId } = await chrome.storage.local.get('gbEmployeeId');
            const empId = gbEmployeeId || '0';
            const BASE = 'https://api.golfballs.com';
            const taskData = await fetch(BASE + '/golfballs/crm/Admin/Task/Get.ajax?' + taskId, { credentials: 'include' }).then(r => r.json());
            const contactID = String(taskData.contactID || 0);
            const today = new Date();
            const fmt = d => (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();
            const due = tpl.daysOut != null ? (() => { const d = new Date(); d.setDate(d.getDate() + tpl.daysOut); return fmt(d); })() : fmt(today);
            const payload = { TaskID:'', Subject: tpl.subject || tpl.name, Description: tpl.body || '',
              LiveDate: fmt(today), DueDate: due, taskCategoryID: String(tpl.categoryId||'0'), taskStatusID:'1',
              Priority: String(tpl.priority||'2'), contactID, leadID:'', employeeID: String(empId), caseID:0 };
            await fetch(BASE + '/golfballs/crm/Admin/Task/Create.ajax?' + encodeURIComponent(JSON.stringify(payload)), { credentials:'include' });
            rowRestoreBtn(btn);
            if (typeof showGbNotification === 'function') showGbNotification('Task \u201c' + (tpl.name||tpl.subject) + '\u201d created.', 'success', 3500);
          }

        } catch(err) {
          console.error('[GB TL] Quick Task error', action, taskId, err);
          rowRestoreBtn(btn);
          if (typeof showGbNotification === 'function') showGbNotification('Quick Task failed: ' + err.message, 'error', 5000);
        }
        return;
      }

      // ── Bulk actions ────────────────────────────────────────────────────
      if (isBulk && ['bulk-complete','bulk-push','bulk-set-date-confirm','create-task'].includes(action)) {
        const bulkQtBtn = document.getElementById('btn-bulk-qt');
        qtClose();
        if (bulkQtBtn) { bulkQtBtn.disabled = true; bulkQtBtn.textContent = '\u2026'; }

        const toRun = Array.from(_tlSelectedTasks);
        const fmt = d => (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();

        for (const id of toRun) {
          const task = _tlAllTasks.find(t => t.id === id);
          if (!task) continue;
          const tr = document.querySelector('#__gb-tl-tbody tr[data-id="' + id + '"]');
          const btn = tr?.querySelector('.qt-trigger');
          if (btn) { btn.disabled = true; btn.innerHTML = spinner; }

          try {
            if (action === 'bulk-complete') {
              await tlCompleteTask(id);
              task.status = 'Complete';
              _tlSelectedTasks.delete(id);
              if (tr) { tr.classList.add('is-complete'); tr.classList.remove('selected'); tr.querySelector('.row-check')?.classList.remove('checked'); }
              if (btn) btn.innerHTML = '<svg fill="none" stroke="var(--gb-brand-label,#7db82a)" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

            } else if (action === 'bulk-push') {
              const days = Math.max(1, parseInt(document.getElementById('tl-push-days')?.value || '7', 10));
              await tlPushTaskDate(id, days);
              const nd = new Date(); nd.setDate(nd.getDate() + days);
              task.due = fmt(nd); task.dueDate = nd;
              rowDueTd(tr, task.due);
              rowRestoreBtn(btn);

            } else if (action === 'bulk-set-date-confirm') {
              const val = document.getElementById('qt-date-input')?.value;
              const apiDate = qtDateInputToApi(val);
              if (!apiDate) { rowRestoreBtn(btn); continue; }
              await tlSetTaskDate(id, apiDate);
              const parts = apiDate.split('/');
              task.due = apiDate; task.dueDate = new Date(parseInt(parts[2]), parseInt(parts[0])-1, parseInt(parts[1]));
              rowDueTd(tr, apiDate);
              rowRestoreBtn(btn);

            } else if (action === 'create-task') {
              const tpl = _tlNoteTemplates.find(t => t.id === item.dataset.tplId);
              if (!tpl) { rowRestoreBtn(btn); continue; }
              const { gbEmployeeId } = await chrome.storage.local.get('gbEmployeeId');
              const empId = gbEmployeeId || '0';
              const BASE = 'https://api.golfballs.com';
              const taskData = await fetch(BASE + '/golfballs/crm/Admin/Task/Get.ajax?' + id, { credentials:'include' }).then(r => r.json());
              const contactID = String(taskData.contactID || 0);
              const today = new Date();
              const due = tpl.daysOut != null ? (() => { const d = new Date(); d.setDate(d.getDate() + tpl.daysOut); return fmt(d); })() : fmt(today);
              const payload = { TaskID:'', Subject: tpl.subject||tpl.name, Description: tpl.body||'',
                LiveDate: fmt(today), DueDate: due, taskCategoryID: String(tpl.categoryId||'0'), taskStatusID:'1',
                Priority: String(tpl.priority||'2'), contactID, leadID:'', employeeID: String(empId), caseID:0 };
              await fetch(BASE + '/golfballs/crm/Admin/Task/Create.ajax?' + encodeURIComponent(JSON.stringify(payload)), { credentials:'include' });
              rowRestoreBtn(btn);
            }

          } catch(err) {
            console.error('[GB TL] Bulk Quick Task error', action, id, err);
            if (tr) { tr.style.background = 'rgba(200,96,96,0.15)'; tr.style.outline = '1px solid rgba(200,96,96,0.35)'; tr.title = err.message; }
            rowRestoreBtn(btn);
          }
        }

        if (bulkQtBtn) { bulkQtBtn.disabled = false; bulkQtBtn.innerHTML = 'Quick Task <svg class="qt-chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'; }
        tlUpdateSelectionCounters();
        if (action === 'bulk-complete') { const n = tlRenderRows(tbody); tlUpdateCount(n, _tlAllTasks.length); }
        if (action === 'create-task' && typeof showGbNotification === 'function') {
          const tpl = _tlNoteTemplates.find(t => t.id === item.dataset.tplId);
          showGbNotification('Tasks created for ' + toRun.length + ' contact' + (toRun.length !== 1 ? 's' : '') + '.', 'success', 3500);
        }
      }
    });

  // ── Load tasks & Templates ────────────────────────────────────────────────────
  
    const loadTasksAndTemplates = async () => {
      const reloadBtn = document.getElementById('__gb-tl-reload');
      if (reloadBtn) reloadBtn.classList.add('spinning');
      tbody.innerHTML = `<tr class="tl-state-row"><td colspan="9"><div style="display:flex;align-items:center;justify-content:center;gap:12px;"><div style="width:18px;height:18px;border:3px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2);border-top-color:var(--gb-brand-label, #7db82a);border-radius:50% !important;animation:__gbTlSpin .7s linear infinite;"></div>Loading tasks…</div></td></tr>`;
      
      try {
        // Fetch templates, note templates, and campaigns
        const storageData = await chrome.storage.local.get(['templates', 'noteTemplates', 'campaigns']);
        _tlAccountTemplates = (storageData.templates    || []).filter(t => t.type === 'account' && t.enabled !== false);
        _tlNoteTemplates    = storageData.noteTemplates || [];
        _tlCampaigns        = storageData.campaigns     || [];

        const campaignMenu = document.getElementById('menu_tl-campaign-add');
        if (campaignMenu) {
          if (_tlCampaigns.length) {
            campaignMenu.innerHTML = '<div class="tl-dropdown-option selected" data-value=""><span>— select campaign —</span></div>' +
              _tlCampaigns.map(c => `<div class="tl-dropdown-option" data-value="${_tlEsc(c.id)}"><span>${_tlEsc(c.name)}</span></div>`).join('');
          } else {
            campaignMenu.innerHTML = '<div class="tl-dropdown-option selected" data-value=""><span>No campaigns — click + to create</span></div>';
          }
          const lbl = document.getElementById('label_tl-campaign-add');
          if (lbl) lbl.textContent = '— select campaign —';
          bindDropdown('tl-campaign-add', val => { _tlSelectedCampaign = val; });
        }

        // + button opens campaign editor (wire once)
        const newCampaignBtn = document.getElementById('btn-tl-new-campaign');
        if (newCampaignBtn && !newCampaignBtn.__ceWired) {
          newCampaignBtn.__ceWired = true;
          newCampaignBtn.addEventListener('click', () => {
            if (typeof window.__gbShowCampaignEditor !== 'function') return;
            // Hide TL — don't remove, preserves task list state and selections
            const tlOvr = document.getElementById('__gb-tl-overlay');
            if (tlOvr) {
              tlOvr.style.transition = 'opacity .18s ease';
              tlOvr.style.opacity = '0';
              setTimeout(() => { tlOvr.style.display = 'none'; }, 180);
            }

            const refreshTlCampaigns = updatedCampaigns => {
              _tlCampaigns = updatedCampaigns || [];
              const campaignMenu = document.getElementById('menu_tl-campaign-add');
              if (!campaignMenu) return;
              campaignMenu.innerHTML = (_tlCampaigns.length
                ? '<div class="tl-dropdown-option selected" data-value=""><span>— select campaign —</span></div>' +
                  _tlCampaigns.map(c => `<div class="tl-dropdown-option" data-value="${_tlEsc(c.id)}"><span>${_tlEsc(c.name)}</span></div>`).join('')
                : '<div class="tl-dropdown-option selected" data-value=""><span>No campaigns — click + to create</span></div>');
              const lbl = document.getElementById('label_tl-campaign-add');
              if (lbl) lbl.textContent = '— select campaign —';
              _tlSelectedCampaign = '';
              bindDropdown('tl-campaign-add', val => { _tlSelectedCampaign = val; });
            };

            window.__gbShowCampaignEditor(
              // onUpdate (Save clicked) — refresh dropdown only, CE stays open
              updatedCampaigns => {
                refreshTlCampaigns(updatedCampaigns);
              },
              // onClose (Close / Cancel / Escape / backdrop) — refresh dropdown + restore TL
              updatedCampaigns => {
                refreshTlCampaigns(updatedCampaigns);
                const tlOvr2 = document.getElementById('__gb-tl-overlay');
                if (tlOvr2) {
                  tlOvr2.style.display = '';
                  requestAnimationFrame(() => requestAnimationFrame(() => { tlOvr2.style.opacity = '1'; }));
                }
              }
            );
          });
        }

        // Fetch Tasks
        _tlSelectedTasks.clear();
        _tlAllTasks = await tlFetchTasks();

        const n = tlRenderRows(tbody);
        if (sub) sub.textContent = `${_tlAllTasks.length} tasks loaded`;

      } catch(e) {
        tbody.innerHTML = `<tr class="tl-state-row"><td colspan="9" style="color:var(--gb-error, #c86060);">Failed to load tasks: ${e.message}</td></tr>`;
        if (sub) sub.textContent = 'Error loading tasks';
      }
      if (reloadBtn) reloadBtn.classList.remove('spinning');
    };
  
    await loadTasksAndTemplates();
    document.getElementById('__gb-tl-reload')?.addEventListener('click', loadTasksAndTemplates);
  }
  
  // ── Configurable keyboard shortcut (default Ctrl+X) ─────────────────────────
  (function registerTaskListShortcut() {
    chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
      const raw = keyboardShortcuts?.taskList;
      const key = (raw === undefined ? 'x' : raw).toLowerCase();
      if (!key) return;
      document.addEventListener('keydown', e => {
        if (!e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.key.toLowerCase() !== key) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        e.preventDefault();
        __gbShowTaskListModal();
      });
    });
  })();
  
  window.__gbShowTaskListModal = __gbShowTaskListModal;
  
} // end guard