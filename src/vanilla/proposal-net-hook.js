/* proposal-net-hook.js — MAIN-world page hook for Proposal Debug.

   Runs in the PAGE's main world (manifest world:"MAIN", document_start) so it
   can see the WEBSITE's own proposal/email network calls (page fetch + XHR),
   which never pass through our background worker. Matched requests are posted to
   the isolated content script (proposal-debug) via window.postMessage; that
   bridge forwards them to the background, the single writer of the debug log.
   Only proposal/email-submit endpoints are captured — nothing else leaves here. */
(function () {
  if (window.__gbProposalNetHook) return;
  window.__gbProposalNetHook = true;

  var CAP = 1200000;
  function cap(s) { if (s == null) return null; s = String(s); return s.length > CAP ? s.slice(0, CAP) + '\n…[truncated]' : s; }

  function classify(url, body) {
    var u = String(url || '');
    if (body && body.indexOf('"emails"') !== -1) {
      try { var b = JSON.parse(body); if (b && Array.isArray(b.emails)) return { cat: 'email', label: 'Send Email — Power Automate' }; } catch (e) { /* */ }
    }
    var P = [
      [/\/user\/saveProposal\b/i,         'Save Proposal → opportunity'],
      [/\/user\/saveCart\b/i,             'Save Cart'],
      [/\/user\/promotion\b/i,            'Apply Promotion'],
      [/\/user\/getCart\//i,              'Load Cart'],
      [/\/user\/getPackageUpsellData\b/i, 'Gift-set Upsell Data'],
      [/CreateProposalEmail/i,            'CRM · Create Proposal Email'],
      [/TrackProposal/i,                  'CRM · Track Proposal'],
      [/Opportunity\/Update/i,            'CRM · Update Opportunity'],
      [/Opportunity\/Get/i,               'CRM · Get Opportunity']
    ];
    for (var i = 0; i < P.length; i++) if (P[i][0].test(u)) return { cat: 'proposal', label: P[i][1] };
    return null;
  }

  function record(cls, method, url, reqBody, started, status, ok, respBody, error) {
    try {
      window.postMessage({
        __gbProposalNet: true,
        entry: {
          ts: started, durationMs: Math.max(0, Date.now() - started),
          cat: cls.cat, label: cls.label, method: method, url: String(url),
          reqBody: cap(reqBody), status: status || 0, ok: !!ok,
          respBody: cap(respBody), error: error ? String(error) : null
        }
      }, '*');
    } catch (e) { /* */ }
  }

  /* ── fetch ── */
  var of = window.fetch;
  if (of) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var body = (init && init.body != null && typeof init.body === 'string') ? init.body : '';
      var cls = classify(url, body);
      if (!cls) return of.apply(this, arguments);
      var started = Date.now();
      return of.apply(this, arguments).then(function (resp) {
        var clone = null; try { clone = resp.clone(); } catch (e) { /* */ }
        if (clone) {
          clone.text().then(function (t) { record(cls, method, url, body || null, started, resp.status, resp.ok, t, null); })
            .catch(function () { record(cls, method, url, body || null, started, resp.status, resp.ok, null, null); });
        } else { record(cls, method, url, body || null, started, resp.status, resp.ok, null, null); }
        return resp;
      }).catch(function (e) { record(cls, method, url, body || null, started, 0, false, null, e); throw e; });
    };
  }

  /* ── XMLHttpRequest ── */
  var XO = window.XMLHttpRequest;
  if (XO && XO.prototype) {
    var open0 = XO.prototype.open, send0 = XO.prototype.send;
    XO.prototype.open = function (m, u) { this.__gbm = m; this.__gbu = u; return open0.apply(this, arguments); };
    XO.prototype.send = function (b) {
      var bodyStr = (typeof b === 'string') ? b : '';
      var cls = classify(this.__gbu, bodyStr);
      if (cls) {
        var self = this, started = Date.now(), body = (typeof b === 'string') ? b : null;
        this.addEventListener('loadend', function () {
          try { record(cls, self.__gbm || 'GET', self.__gbu, body, started, self.status, self.status >= 200 && self.status < 300, (typeof self.responseText === 'string' ? self.responseText : null), null); } catch (e) { /* */ }
        });
      }
      return send0.apply(this, arguments);
    };
  }
})();
