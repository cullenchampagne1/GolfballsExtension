/* ───────────────────────────────────────────────────────────────
   custom-page-host-bridge.js — main-world DataTables seam.

   Custom-page UIs run in Chrome's isolated content-script world, so they can
   share DOM with the CRM but cannot see the page-owned window.jQuery object.
   The native CRM keeps non-visible DataTable rows detached from the document;
   this tiny MAIN-world listener materializes those rows when the isolated
   custom-pages engine asks for them.
─────────────────────────────────────────────────────────────── */
(function () {
  if (window.__gbCustomPageHostBridgeReady) return;
  window.__gbCustomPageHostBridgeReady = true;

  var REQUEST_EVENT = '__gbCustomPageExpandHostTables';
  var READY_EVENT = '__gbCustomPageHostTablesReady';
  var TABLES = [
    '#TableTasks',
    '#TableCompletedTasks',
    '#TableOpportunities',
    '#ActivityTable',
    'table.PCHTable',
    'table.AHTable',
    'table.CHTable',
    'table.LHTable',
    'table.OHTable',
  ];

  function legacySettingsFor(jq, element) {
    var settings = (jq.fn && (jq.fn.dataTableSettings
      || (jq.fn.dataTable && jq.fn.dataTable.settings))) || [];
    for (var i = 0; i < settings.length; i++) {
      if (settings[i] && settings[i].nTable === element) return settings[i];
    }
    return null;
  }

  function expandTable(jq, element) {
    // DataTables 1.10+ API.
    try {
      if (jq.fn.dataTable
          && typeof jq.fn.dataTable.isDataTable === 'function'
          && jq.fn.dataTable.isDataTable(element)) {
        var modern = jq(element).DataTable();
        if (modern && modern.page && typeof modern.page.len === 'function') {
          if (modern.page.len() === -1) return false;
          modern.page.len(-1).draw(false);
          return true;
        }
      }
    } catch (error) { /* fall through to the CRM's legacy API */ }

    // Golfballs CRM still ships DataTables 1.9. Its capital DataTable alias
    // returns a jQuery object, not the 1.10 API, so `.page.len()` never existed
    // and the old bridge silently left every table on its first 10 rows.
    try {
      var settings = legacySettingsFor(jq, element);
      if (!settings || settings._iDisplayLength === -1) return false;
      settings._iDisplayStart = 0;
      settings._iDisplayLength = -1;
      var instance = settings.oInstance;
      if (!instance || typeof instance.fnDraw !== 'function') {
        instance = jq(element).dataTable();
      }
      if (instance && typeof instance.fnDraw === 'function') instance.fnDraw(false);
      return true;
    } catch (error) { return false; }
  }

  function expand() {
    var expanded = 0;
    try {
      var jq = window.jQuery;
      if (jq && jq.fn && jq.fn.dataTable) {
        for (var i = 0; i < TABLES.length; i++) {
          var selector = TABLES[i];
          try {
            // Query actual elements, not a jQuery id selector. Account pages
            // contain TWO #TableTasks nodes (a native CRM duplicate-id bug);
            // selector-based lookup only ever expanded one of them.
            var elements = document.querySelectorAll(selector);
            for (var j = 0; j < elements.length; j++) {
              if (expandTable(jq, elements[j])) expanded += 1;
            }
          } catch (inner) { /* keep expanding the remaining tables */ }
        }
      }
    } catch (error) { /* host jQuery is optional */ }

    try {
      document.documentElement.setAttribute('data-gb-host-tables-expanded', String(expanded));
      document.dispatchEvent(new Event(READY_EVENT));
    } catch (error) {}
  }

  document.addEventListener(REQUEST_EVENT, expand);
})();
