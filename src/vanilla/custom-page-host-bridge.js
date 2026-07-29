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

  function expand() {
    var expanded = 0;
    try {
      var jq = window.jQuery;
      if (jq && jq.fn && jq.fn.dataTable) {
        for (var i = 0; i < TABLES.length; i++) {
          var selector = TABLES[i];
          try {
            if (!jq.fn.dataTable.isDataTable(selector)) continue;
            var table = jq(selector).DataTable();
            if (!table || !table.page || typeof table.page.len !== 'function') continue;
            if (table.page.len() !== -1) {
              table.page.len(-1).draw(false);
              expanded += 1;
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
