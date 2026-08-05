/* tracker-net-hook.js — MAIN-world request hook for Trackers.

   Runs in the PAGE's main world (manifest world:"MAIN", document_start) so it
   can see the WEBSITE's own fetch/XHR traffic, which never passes through our
   service worker. When the rep creates an opportunity or saves a proposal, the
   CRM's own request carries the record — this is where we notice.

   Deliberately thin. It knows the registry's MATCH RULES and nothing else: no
   extraction, no storage, no idea what an opportunity is. Matched exchanges go
   to the isolated content script by postMessage; that bridge forwards them to
   the background, which re-matches and is the only writer. Page code shares
   this world, so anything more here would be code the page can read and abuse.

   Rules are injected by the bridge (GB_TRACKER_RULES) rather than imported,
   because a RegExp cannot survive the message boundary — source + flags do. */
(function installTrackerNetHook() {
  if (window.__gbTrackerNetHook) return;
  window.__gbTrackerNetHook = true;

  var CAP = 250000;
  var rules = [];

  function cap(value) {
    if (value == null) return null;
    var string = String(value);
    return string.length > CAP ? string.slice(0, CAP) : string;
  }

  function compile(list) {
    var out = [];
    for (var i = 0; i < (list || []).length; i += 1) {
      var rule = list[i];
      try {
        out.push({
          method: String(rule.method || '*').toUpperCase(),
          re: new RegExp(rule.source, rule.flags || ''),
          wantsResponse: rule.wantsResponse !== false
        });
      } catch (e) { /* a malformed rule must not disable the rest */ }
    }
    return out;
  }

  /* The most specific answer the hook can give: does ANY rule want this, and
     does any of them want the response body (which costs a clone). */
  function interest(url, method) {
    var href = String(url || '');
    var verb = String(method || 'GET').toUpperCase();
    var matched = false;
    var wantsResponse = false;
    for (var i = 0; i < rules.length; i += 1) {
      var rule = rules[i];
      if (rule.method !== '*' && rule.method !== verb) continue;
      if (!rule.re.test(href)) continue;
      matched = true;
      if (rule.wantsResponse) wantsResponse = true;
    }
    return matched ? { wantsResponse: wantsResponse } : null;
  }

  function report(entry) {
    try {
      window.postMessage({ __gbTrackerNet: true, entry: entry }, window.location.origin);
    } catch (e) { /* origin mismatch — drop it */ }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || !data.__gbTrackerRules || !Array.isArray(data.rules)) return;
    rules = compile(data.rules);
  });

  /* ── fetch ── */
  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var want = rules.length ? interest(url, method) : null;
      if (!want) return originalFetch.apply(this, arguments);
      var body = (init && init.body != null && typeof init.body === 'string') ? init.body : '';
      var started = Date.now();
      var send = function (response, responseBody) {
        report({
          at: started, url: String(url), method: String(method).toUpperCase(),
          requestBody: cap(body) || null, responseBody: cap(responseBody),
          status: response ? response.status : 0, ok: !!(response && response.ok)
        });
      };
      return originalFetch.apply(this, arguments).then(function (response) {
        if (!want.wantsResponse) { send(response, null); return response; }
        var clone = null;
        try { clone = response.clone(); } catch (e) { /* unclonable stream */ }
        if (!clone) { send(response, null); return response; }
        clone.text().then(function (text) { send(response, text); })
          .catch(function () { send(response, null); });
        return response;
      });
    };
  }

  /* ── XMLHttpRequest ── */
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var open0 = XHR.prototype.open;
    var send0 = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__gbTrackMethod = method;
      this.__gbTrackUrl = url;
      return open0.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      var want = rules.length ? interest(this.__gbTrackUrl, this.__gbTrackMethod) : null;
      if (want) {
        var self = this;
        var started = Date.now();
        var requestBody = (typeof body === 'string') ? body : null;
        this.addEventListener('loadend', function () {
          try {
            report({
              at: started,
              url: String(self.__gbTrackUrl || ''),
              method: String(self.__gbTrackMethod || 'GET').toUpperCase(),
              requestBody: cap(requestBody),
              responseBody: want.wantsResponse && typeof self.responseText === 'string'
                ? cap(self.responseText) : null,
              status: self.status,
              ok: self.status >= 200 && self.status < 300
            });
          } catch (e) { /* teardown mid-flight */ }
        });
      }
      return send0.apply(this, arguments);
    };
  }
})();
