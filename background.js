// background.js
importScripts('defaults.js');

let editorWindowId   = null;

// ── Seed default state on first install ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return; // skip updates and browser_update

  // Only write keys that don't already exist — never overwrite user data
  chrome.storage.local.get(null, (existing) => {
    const toWrite = {};
    for (const [key, value] of Object.entries(GB_FACTORY_DEFAULTS)) {
      if (!(key in existing)) {
        toWrite[key] = value;
      }
    }
    if (Object.keys(toWrite).length) {
      chrome.storage.local.set(toWrite, () => {
        console.log('[GB] Seeded factory defaults:', Object.keys(toWrite).join(', '));
      });
    }
  });
});

/**
 * Central message router for the extension background service worker.
 * Handles image proxying, calendar fetches/postbacks, iframe API calls,
 * proof-link generation, window management, and element-picker relay.
 * Every handler that performs async work must return `true` to keep the
 * message channel open until sendResponse is called.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Relay a message to all frames in the sender's tab ──────────────────────
  if (msg.action === 'broadcastToFrames' && msg.payload) {
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: 'No sender tab' }); return true; }
    chrome.tabs.sendMessage(tabId, msg.payload, { frameId: undefined })
      .catch(err => console.warn('[GB] broadcastToFrames failed:', err.message));
    sendResponse({ ok: true });
    return true;
  }

  
  // ── 1. Image Proxy ─────────────────────────────────────────
  if (msg.action === 'proxyFetchImage' && msg.url) {
    fetch(msg.url)
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = await r.arrayBuffer();
        const type = r.headers.get('content-type') || 'image/png';
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
        }
        sendResponse({ ok: true, dataUrl: `data:${type};base64,${btoa(binary)}` });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── 1b. Raw text/body fetch (email preview, API calls) ────────
  /**
   * Fetches a URL and returns its raw text body with the session cookies
   * included (credentials:'include'). Used by the email preview feature.
   */
  if (msg.action === 'fetchRaw' && msg.url) {
    const opts = { credentials: 'include' };
    if (msg.method && msg.method.toUpperCase() !== 'GET') {
      opts.method = msg.method.toUpperCase();
      if (msg.headers) opts.headers = msg.headers;
      if (msg.body)    opts.body    = msg.body;
    }
    fetch(msg.url, opts)
      .then(async r => {
        const text = await r.text();
        sendResponse({ ok: r.ok, status: r.status, text });
      })
      .catch(err => sendResponse({ ok: false, error: String(err), text: '' }));
    return true;
  }

  // ── 2. Brand product catalog fetch (for recommended_replacement) ──
  // Loads /Golf-Balls/{slug}.html, extracts __NEXT_DATA__, returns Solr docs.
  if (msg.action === 'fetchBrandProducts' && msg.slug) {
    const url = `https://www.golfballs.com/Golf-Balls/${encodeURIComponent(msg.slug)}.html`;
    fetch(url, {
      headers: { 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      credentials: 'include'
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
 
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error('__NEXT_DATA__ not found');
 
      const nextData = JSON.parse(m[1]);
      const page     = nextData?.props?.pageProps?.contentManagerPage?.page;
      const deps     = page?.dependencies;
      if (!Array.isArray(deps)) throw new Error('No dependencies array');
 
      let products = [];
      for (const dep of deps) {
        const docs = dep?.value?.response?.docs;
        if (Array.isArray(docs) && docs.length > 0) { products = docs; break; }
      }
      sendResponse({ ok: true, products });
    })
    .catch(err => {
      console.warn('[GB] fetchBrandProducts error:', err.message);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── 2. Calendar HTML Proxy (GET — initial state fetch) ─────
  if (msg.action === 'fetchCalendarState' && msg.url) {
    console.log("[Background] Fetching URL:", msg.url);
    
    const fetchHeaders = {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9",
      "upgrade-insecure-requests": "1"
    };

    if (msg.cookieStr)  fetchHeaders["Cookie"]        = msg.cookieStr;
    if (msg.adminToken) fetchHeaders["adminsession"]  = msg.adminToken;

    fetch(msg.url, {
      headers: fetchHeaders,
      referrer: msg.referrer,
      referrerPolicy: "unsafe-url",
      method: "GET",
      mode: "cors",
      credentials: "include",
      cache: "no-store"
    })
    .then(async r => {
      console.log(`[Background] Response Status: ${r.status}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      if (html.includes('login') || html.includes('Log In')) {
        throw new Error("Server rejected session cookies and redirected to login screen.");
      }
      sendResponse({ ok: true, html: html });
    })
    .catch(err => {
      console.error("[Background] Fetch Error:", err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── 7. Generate Proof Link (Scrape & Post) ─────────────────
  // ── 7. Generate Proof Link (Scrape & Post) ─────────────────
  if (msg.action === 'generateProofLink') {
    console.log('[Background] Initiating Proof Generation for Customer:', msg.customerId);
    
    const baseUrl = `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=128&customerID=${msg.customerId || ''}`;

    fetch(baseUrl, { method: 'GET' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load Create page');
        const html = await r.text();

        const vsMatch  = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
        const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
        const evMatch  = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

        if (!vsMatch) throw new Error('Could not find __VIEWSTATE');

        // Build payload using the user's custom form inputs
        const formData = new FormData();
        formData.append('__EVENTTARGET', '');
        formData.append('__EVENTARGUMENT', '');
        formData.append('__VIEWSTATE', vsMatch[1]);
        formData.append('__VIEWSTATEGENERATOR', vsgMatch ? vsgMatch[1] : '');
        formData.append('__EVENTVALIDATION', evMatch ? evMatch[1] : '');
        
        formData.append('ctl00$inputName', msg.proofName || `Proof - ${msg.orderId}`);
        formData.append('ctl00$inputKeywords', '');
        formData.append('ctl00$inputNotes', msg.notes || '');
        formData.append('ctl00$inputLogoType', msg.logoType || 'Ball');
        formData.append('ctl00$inputCustomerID', msg.customerId || '');
        formData.append('ctl00$DropDownSalesRep', msg.salesRepId || '0'); 
        formData.append('ctl00$DropDownArtist', msg.artistId || '42'); 
        formData.append('ctl00$DropDownStatus', msg.logoStatus || '1'); 
        
        // Use a proper File object instead of a blank Blob just to be safe with ASP.NET
        formData.append('ctl00$LogoUpload', new File([""], "empty.png", { type: "image/png" }));
        formData.append('ctl00$Button1', 'Create Logo');

        console.log('[Background] POSTing to:', baseUrl);

        return fetch(baseUrl, {
          method: 'POST',
          body: formData,
          redirect: 'follow'
        });
      })
      .then(async r => {
        const finalUrl = new URL(r.url);
        const messageParam = finalUrl.searchParams.get('message');
        
        if (messageParam && messageParam.includes('http')) {
          const cleanLink = messageParam.replace('New Job Link ', '').trim();
          console.log("Proof Link: " + cleanLink)
          sendResponse({ ok: true, proofLink: cleanLink });
        } else {
          // 🚨 IF IT FAILS, READ THE HTML TO SEE ASP.NET'S ERROR 🚨
          const htmlResponse = await r.text();
          console.error('[GB] Server rejected the form. Final URL:', r.url);
          
          // Try to scrape any red ASP.NET error spans to make it blatantly obvious
          const errorMatch = htmlResponse.match(/<span[^>]*style="color:Red[^>]*>([\s\S]*?)<\/span>/i);
          if (errorMatch) {
             console.error('🚨 ASP.NET ERROR MESSAGE:', errorMatch[1].replace(/<[^>]*>?/gm, '').trim());
          }
          
          throw new Error('Server rejected the form. Check Background Console for details.');
        }
      })
      .catch(err => {
        console.error('[Background] Proof Generation Error:', err);
        sendResponse({ ok: false, error: err.message });
      });

    return true; 
  }

  // ── 3. Calendar Date-Selection POST ────────────────────────
  // Fires a __doPostBack equivalent for ApprovalDate or DeliveryCommitment.
  // Returns the fresh { viewState, viewStateGen, eventValidation } from the
  // server response so the caller can chain the next step.
  if (msg.action === 'postCalendarForm') {
    const params = new URLSearchParams();
    params.set('__EVENTTARGET',        msg.eventTarget   || '');
    params.set('__EVENTARGUMENT',      msg.eventArgument || '');
    params.set('__VIEWSTATE',          msg.viewState     || '');
    params.set('__VIEWSTATEGENERATOR', msg.viewStateGen  || '');
    params.set('__EVENTVALIDATION',    msg.eventValidation || '');

    console.log(`[Background] postCalendarForm → target=${msg.eventTarget} arg=${msg.eventArgument}`);

    fetch(msg.url, {
      method:      'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      body:        params.toString()
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();

      // DOMParser is not available in service workers — use targeted regex instead.
      // The attribute order in ASP.NET output is always: id="…" value="…"
      let vsMatch  = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
      const evMatch  = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

      if (!vsMatch) {
        // Sometimes the attribute order is reversed: value="…" … id="…"
        const vsAlt = html.match(/name="__VIEWSTATE"[^>]*value="([^"]+)"/);
        if (!vsAlt) throw new Error('__VIEWSTATE missing from server response. Session may have expired.');
        vsMatch = vsAlt; // reassign to continue
      }

      console.log(`[Background] postCalendarForm ✓ — new ViewState extracted.`);
      sendResponse({ ok: true, state: {
        viewState:       vsMatch[1],
        viewStateGen:    vsgMatch ? vsgMatch[1] : msg.viewStateGen,
        eventValidation: evMatch  ? evMatch[1]  : msg.eventValidation
      }});
    })
    .catch(err => {
      console.error('[Background] postCalendarForm error:', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── 4. Calendar Final Submit ────────────────────────────────
  // Equivalent to clicking "Update Delivery Date".
  // At this point ViewState already encodes the two selected dates.
  if (msg.action === 'submitCalendarUpdate') {
    const params = new URLSearchParams();
    params.set('__EVENTTARGET',                  '');
    params.set('__EVENTARGUMENT',                '');
    params.set('__VIEWSTATE',                    msg.viewState     || '');
    params.set('__VIEWSTATEGENERATOR',           msg.viewStateGen  || '');
    params.set('__EVENTVALIDATION',              msg.eventValidation || '');
    params.set('ctl00$btnUpdateDeliveryDate',    'Update Delivery Date');

    console.log('[Background] submitCalendarUpdate → firing final submit');

    fetch(msg.url, {
      method:      'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      body:        params.toString()
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      // Detect silent redirect-to-login failure
      if (html.includes('id="login"') || (html.toLowerCase().includes('log in') && !html.includes('btnUpdateDeliveryDate'))) {
        throw new Error('Session expired during submit. Please refresh the order page and try again.');
      }
      console.log('[Background] submitCalendarUpdate ✓');
      sendResponse({ ok: true });
    })
    .catch(err => {
      console.error('[Background] submitCalendarUpdate error:', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // Broadcasts to all frames, but only executes in admin.icustomize.com
  if (msg.action === 'chargeApiProxy') {
    chrome.storage.local.get('orderTabId', async ({ orderTabId }) => {
      console.log('[GB Charge BG] chargeApiProxy', msg.url, '| tabId:', orderTabId);

      if (!orderTabId) {
        const err = 'No orderTabId — reopen popup from the order page.';
        console.error('[GB Charge BG]', err);
        sendResponse({ ok: false, status: 0, text: '', error: err });
        return;
      }

      // Serialise body
      let bodyStr = null;
      if (msg.body !== null && msg.body !== undefined) {
        if (typeof msg.body === 'string') {
          const n = Number(msg.body);
          bodyStr = isNaN(n) ? JSON.stringify(msg.body) : String(n);
        } else {
          bodyStr = JSON.stringify(msg.body);
        }
      }

      try {
        // Execute in ALL frames attached to the order tab
        const results = await chrome.scripting.executeScript({
          target: { tabId: orderTabId, allFrames: true },
          world: 'MAIN', // <-- CRITICAL: Forces script out of the extension sandbox and into the native page context
          func: async (url, method, bodyStr) => {
            
            // GUARD: Only proceed if we are inside the correct iframe
            if (window.location.origin !== 'https://admin.icustomize.com') {
              return { ignored: true };
            }

            console.log('[GB Charge FRAME] origin:', location.origin, '| fetch', method, url);

            const isMasterApi  = url.includes('master.api.icustomize.com');
            const isSaveAdjust = url.includes('SaveAdjustment');
            const useJson      = isMasterApi || isSaveAdjust;

            const headers = {
              'Content-Type': useJson ? 'application/json;charset=UTF-8' : 'application/x-www-form-urlencoded',
              'Accept': 'application/json, text/plain, */*'
            };

            // Bulletproof JWT scanner (Ported directly from your iframe_content.js)
            function findJWT(storage) {
                for (let i = 0; i < storage.length; i++) {
                    try {
                        const val = storage.getItem(storage.key(i));
                        if (typeof val === 'string' && val.includes('eyJ')) {
                            const match = val.match(/(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/);
                            if (match) return match[1];
                        }
                    } catch(e) {}
                }
                return null;
            }

            // Check Local, then Session, then Cookies
            let token = findJWT(localStorage) || findJWT(sessionStorage);
            if (!token) {
               const match = document.cookie.match(new RegExp('(^| )adminsession=([^;]+)', 'i'));
               if (match) token = match[2];
            }

            if (token) {
              // Be surgical with headers to avoid CORS Preflight rejections
              if (isMasterApi) {
                  headers['adminsession'] = token;
                  console.log('[GB Charge FRAME] Token found. Setting adminsession for Master API.');
              } else {
                  headers['authorization'] = token;
                  console.log('[GB Charge FRAME] Token found. Setting authorization for Private API.');
              }
            } else {
              console.warn('[GB Charge FRAME] Token NOT found! The request will likely fail CORS.');
            }

            try {
              const resp = await fetch(url, {
                method: method || 'POST',
                headers,
                credentials: 'omit', // <-- REVERTED: Do not send cookies, the Authorization header is enough
                body: bodyStr != null ? bodyStr : undefined
              });
              const text = await resp.text();
              console.log('[GB Charge FRAME] response', resp.status, text.slice(0, 300));
              return { ok: resp.ok, status: resp.status, text, error: null };
            } catch (err) {
              console.error('[GB Charge FRAME] fetch threw:', err.name, err.message);
              return { ok: false, status: 0, text: '', error: err.name + ': ' + err.message };
            }
          },
          args: [msg.url, msg.method || 'POST', bodyStr]
        });

        // Isolate the result from the iframe that didn't ignore the request
        const validResult = results?.find(r => r.result && !r.result.ignored);

        if (validResult) {
          sendResponse(validResult.result);
        } else {
          const err = 'Could not find admin.icustomize.com iframe. Please ensure the Credit Card Adjustment portlet is visible on the order page.';
          console.error('[GB Charge BG]', err);
          sendResponse({ ok: false, status: 0, text: '', error: err });
        }

      } catch (err) {
        console.error('[GB Charge BG] executeScript threw:', err.name, err.message);
        sendResponse({ ok: false, status: 0, text: '', error: err.name + ': ' + err.message });
      }
    });
    return true;
  }

    // ── 6. Open Charge Window ───────────────────────────────────
  if (msg.action === 'openChargeWindow') {
    chrome.storage.local.set({ chargeContext: msg.context }, () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('charge.html'),
        type: 'popup',
        width: 500,
        height: 600
      });
    });
    sendResponse({ success: true });
    return true;
  }

  // ── Open / focus editor popup window ───────────────────────
  if (msg.action === 'openCaseTplEditor') {
    // Open or focus editor window, then tell it to navigate to case templates
    const focusAndNav = (windowId) => {
      chrome.windows.update(windowId, { focused: true });
      // Find the editor tab in that window and send it a navigation message
      chrome.tabs.query({ windowId }, tabs => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.includes('editor.html')) {
            chrome.tabs.sendMessage(tab.id, { action: 'GB_OPEN_CASE_TPL_EDITOR' }).catch(() => {});
          }
        });
      });
    };
    if (editorWindowId !== null) {
      chrome.windows.get(editorWindowId, win => {
        if (chrome.runtime.lastError || !win) {
          editorWindowId = null;
          createEditorWindow();
          // Nav will fire when editor sends ready ping
        } else {
          focusAndNav(editorWindowId);
        }
      });
    } else {
      createEditorWindow();
    }
    // Store intent so newly-opened editor can navigate on load
    chrome.storage.session?.set({ pendingNav: 'case-tpl' }).catch(() =>
      chrome.storage.local.set({ pendingNav: 'case-tpl' })
    );
    sendResponse({ success: true });
    return true;
  }

  if (msg.action === 'openEditor') {
    if (editorWindowId !== null) {
      chrome.windows.get(editorWindowId, (win) => {
        if (chrome.runtime.lastError || !win) {
          editorWindowId = null;
          createEditorWindow();
        } else {
          chrome.windows.update(editorWindowId, { focused: true });
        }
        sendResponse({ success: true });
      });
    } else {
      createEditorWindow();
      sendResponse({ success: true });
    }
    return true;
  }

  // ── Start pick: inject content script, switch to order tab ─
  if (msg.action === 'startPick') {
    chrome.storage.local.get(['orderTabId', 'editorTabId'], ({ orderTabId, editorTabId }) => {
      if (!orderTabId) {
        sendResponse({ error: "No order tab" });
        return;
      }
      chrome.storage.local.set({ pickMode: { active: true, fieldId: msg.fieldId, editorTabId } }, () => {
        chrome.scripting.executeScript(
          { target: { tabId: orderTabId }, files: [
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
      ] },
          () => {
            chrome.tabs.sendMessage(orderTabId, { action: 'enterPickMode' });
            chrome.tabs.update(orderTabId, { active: true });
            chrome.windows.update(msg.editorWindowId || editorWindowId, { focused: false });
            sendResponse({ success: true });
          }
        );
      });
    });
    return true;
  }


  // ── Hover preview during pick mode ────────────────────────────
  if (msg.action === 'pickHover') {
    chrome.storage.local.set({ pickHover: { text: msg.text, ts: Date.now() } });
    return false;
  }

  // ── Keepalive ping — prevents service worker from going idle during campaign delays ──
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  // ── Power Automate: post email payload to HTTP trigger ─────────────────────
  if (msg.action === 'paAutomate') {
    const { paUrl, payload } = msg;
    if (!paUrl) { sendResponse({ ok: false, error: 'No Power Automate URL configured.' }); return true; }
    (async () => {
      try {
        // Inline remote <img> sources as base64 data URIs so the images
        // are self-contained and survive email delivery — recipients no
        // longer depend on their client fetching external / hotlink-
        // protected / relative URLs (the cause of "half-broken" images).
        if (payload && Array.isArray(payload.emails)) {
          for (const em of payload.emails) {
            if (em && typeof em.htmlBody === 'string') {
              em.htmlBody = await inlineEmailImages(em.htmlBody);
            }
          }
        }
        // PA direct-trigger URLs return 202 Accepted with no JSON body.
        // Treat any 2xx as success — don't require a parseable body.
        const r = await fetch(paUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        if (r.ok) {
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            if (typeof data.ok === 'boolean') {
              sendResponse({ ok: data.ok, sent: data.sent, failed: data.failed, results: data.results });
            } else {
              sendResponse({ ok: true, results: [{ status: 'sent' }] });
            }
          } catch {
            sendResponse({ ok: true, results: [{ status: 'sent' }] });
          }
        } else {
          const body = await r.text();
          console.warn('[GB PA] HTTP error', r.status, body.slice(0, 200));
          sendResponse({ ok: false, error: `HTTP ${r.status}` });
        }
      } catch (e) {
        console.warn('[GB PA] Request failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }


  if (msg.action === 'downloadEml') {
    chrome.downloads.download({
      url:      msg.dataUrl,
      filename: msg.filename || 'reply.eml',
      saveAs:   false,        // go straight to Downloads, don't prompt
    }, (downloadId) => {
      sendResponse({ ok: !chrome.runtime.lastError, downloadId });
    });
    return true;
  }

  // ── Microsoft Graph: get OAuth token (PKCE via chrome.identity) ────────────
  if (msg.action === 'graphGetToken') {
    chrome.storage.local.get(['featureFlags', 'gbGraphToken'], async (data) => {
      const flags = data.featureFlags || {};
      if (!flags.replyWithTemplateEnabled) {
        sendResponse({ ok: false, disabled: true });
        return;
      }

      // Return cached token if still valid (5 min buffer)
      const cached = data.gbGraphToken;
      if (cached?.accessToken && cached.expiresAt - Date.now() > 300_000) {
        sendResponse({ ok: true, token: cached.accessToken });
        return;
      }

      const CLIENT_ID = flags.graphClientId || '';
      if (!CLIENT_ID) {
        sendResponse({ ok: false, error: 'Azure Client ID not configured. Add it in Settings → Features.' });
        return;
      }

      // Use specific tenant if configured, otherwise 'common' (requires multi-tenant app)
      const TENANT   = flags.graphTenantId || 'common';
      const REDIRECT = `https://${chrome.runtime.id}.chromiumapp.org/`;
      const SCOPE    = 'https://graph.microsoft.com/Mail.ReadWrite offline_access';
      const verifier  = gbGenCodeVerifier();
      const challenge = await gbCodeChallenge(verifier);

      const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?`
        + new URLSearchParams({
            client_id:             CLIENT_ID,
            response_type:         'code',
            response_mode:         'query',   // force code into query string, not fragment
            redirect_uri:          REDIRECT,
            scope:                 SCOPE,
            code_challenge:        challenge,
            code_challenge_method: 'S256',
            prompt:                'select_account',
          }).toString();

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'Auth cancelled' });
          return;
        }
        try {
          const parsed = new URL(responseUrl);

          // Surface any Azure error before looking for code
          const azureError = parsed.searchParams.get('error');
          if (azureError) {
            const desc = parsed.searchParams.get('error_description') || azureError;
            throw new Error(`Azure error: ${desc}`);
          }

          // Code comes in query string (?code=) for SPA apps.
          // Fall back to hash fragment (#code=) for Web platform apps.
          let code = parsed.searchParams.get('code');
          if (!code) {
            const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
            code = hashParams.get('code');
          }
          if (!code) {
            throw new Error(`No code in redirect. Full URL: ${responseUrl.slice(0, 200)}`);
          }

          const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     CLIENT_ID,
              grant_type:    'authorization_code',
              code,
              redirect_uri:  REDIRECT,
              code_verifier: verifier,
              scope:         SCOPE,
            }).toString(),
          });
          const tokenData = await tokenResp.json();
          if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

          const tokenRecord = {
            accessToken:  tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt:    Date.now() + (tokenData.expires_in * 1000),
          };
          await new Promise(r => chrome.storage.local.set({ gbGraphToken: tokenRecord }, r));
          sendResponse({ ok: true, token: tokenData.access_token });
        } catch(e) {
          sendResponse({ ok: false, error: e.message });
        }
      });
    });
    return true;
  }

  // ── Microsoft Graph: sign out ───────────────────────────────────────────────
  if (msg.action === 'graphSignOut') {
    chrome.storage.local.remove('gbGraphToken', () => sendResponse({ ok: true }));
    return true;
  }

  // ── Microsoft Graph: send fresh email (no threading) ──────────────────────
  if (msg.action === 'graphSendFresh') {
    chrome.storage.local.get(['featureFlags', 'gbGraphToken'], async (data) => {
      const flags = data.featureFlags || {};
      if (!flags.replyWithTemplateEnabled) { sendResponse({ ok: false, disabled: true }); return; }

      let token = data.gbGraphToken?.accessToken;
      if (!token || data.gbGraphToken.expiresAt - Date.now() < 60_000) {
        const refreshed = await gbRefreshToken(data.gbGraphToken?.refreshToken, flags.graphClientId || '');
        if (!refreshed.ok) { sendResponse({ ok: false, error: refreshed.error, needsAuth: true }); return; }
        token = refreshed.token;
      }

      try {
        // DRAFT MODE (testing) — create draft, do not send
        const resp = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: msg.subject,
            body: { contentType: 'HTML', content: msg.htmlBody },
            toRecipients: [{ emailAddress: { address: msg.to } }],
          }),
        });
        if (!resp.ok && resp.status !== 202) {
          if (resp.status === 401) { sendResponse({ ok: false, error: 'Token expired', needsAuth: true }); return; }
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || `Graph ${resp.status}`);
        }
        sendResponse({ ok: true });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }


  if (msg.action === 'graphSendReply') {
    chrome.storage.local.get(['featureFlags', 'gbGraphToken'], async (data) => {
      const flags = data.featureFlags || {};
      if (!flags.replyWithTemplateEnabled) {
        sendResponse({ ok: false, disabled: true });
        return;
      }

      let token = data.gbGraphToken?.accessToken;
      if (!token || data.gbGraphToken.expiresAt - Date.now() < 60_000) {
        const refreshed = await gbRefreshToken(data.gbGraphToken?.refreshToken, flags.graphClientId || '');
        if (!refreshed.ok) { sendResponse({ ok: false, error: refreshed.error, needsAuth: true }); return; }
        token = refreshed.token;
      }

      const auth = { 'Authorization': `Bearer ${token}` };
      try {
        // Step 1: Create draft from raw MIME
        const createResp = await fetch('https://graph.microsoft.com/v1.0/me/messages/$value', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'text/plain' },
          body: msg.mimeBase64,
        });
        if (!createResp.ok) {
          const err = await createResp.json().catch(() => ({}));
          if (createResp.status === 401) { sendResponse({ ok: false, error: 'Token expired', needsAuth: true }); return; }
          throw new Error(err.error?.message || `Graph ${createResp.status}`);
        }
        const draft = await createResp.json();

        // DRAFT MODE (testing) — skip send, leave as draft in Drafts folder
        // const sendResp = await fetch(...)
        sendResponse({ ok: true });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }

  // ── Microsoft Graph: check auth state ──────────────────────────────────────
  if (msg.action === 'graphCheckAuth') {
    chrome.storage.local.get(['featureFlags', 'gbGraphToken'], (data) => {
      const flags   = data.featureFlags || {};
      const enabled = !!flags.replyWithTemplateEnabled;
      const hasToken = !!(data.gbGraphToken?.accessToken);
      const expired  = data.gbGraphToken ? data.gbGraphToken.expiresAt - Date.now() < 60_000 : true;
      sendResponse({ enabled, hasToken, expired: hasToken && expired });
    });
    return true;
  }


  // ── Element picked by content script ───────────────────────
  if (msg.action === 'elementPicked') {
    chrome.storage.local.get('pickMode', ({ pickMode }) => {
      if (!pickMode?.active) {
        sendResponse({ ignored: true });
        return;
      }
      chrome.storage.local.set({
        pickMode: { active: false },
        pickResult: { fieldId: pickMode.fieldId, selector: msg.selector, text: msg.text, ts: Date.now() }
      }, () => {
        if (editorWindowId) chrome.windows.update(editorWindowId, { focused: true });
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // ── Cancel pick ────────────────────────────────────────────
  if (msg.action === 'cancelPick') {
    chrome.storage.local.set({ pickMode: { active: false } });
    if (editorWindowId) chrome.windows.update(editorWindowId, { focused: true });
    // removed "return true;"
  }
});

/**
 * Opens a new popup window containing the template editor and stores both
 * the window ID and its tab ID in chrome.storage.local so other parts of
 * the extension can target it.
 */
function createEditorWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('editor.html'),
    type: 'popup', width: 860, height: 700
  }, (win) => {
    editorWindowId = win.id;
    chrome.tabs.query({ windowId: win.id }, (tabs) => {
      if (tabs[0]) chrome.storage.local.set({ editorTabId: tabs[0].id });
    });
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === editorWindowId) editorWindowId = null;
});


// ── Email image inlining ──────────────────────────────────────────────────────
// Outgoing emails reference images by URL. External / hotlink-protected /
// relative URLs frequently fail to load in the recipient's inbox ("half-broken"
// images). Before a Power Automate send we fetch each remote image and rewrite
// its <img src> to a self-contained base64 data URI.

const GB_MAX_IMG_BYTES = 3 * 1024 * 1024; // skip images larger than 3 MB

/** ArrayBuffer → base64 string (chunked to stay within the call-stack limit). */
function gbBufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Rewrites every remote <img src> in an HTML string to a base64 data URI.
 * Best-effort: any image that can't be fetched keeps its original src, and a
 * failure never blocks the send. data:/cid: sources and unresolvable relative
 * paths are left untouched.
 * @param {string} html
 * @returns {Promise<string>}
 */
async function inlineEmailImages(html) {
  if (!html || typeof html !== 'string' || html.indexOf('<img') === -1) return html;

  // Collect unique src values from <img> tags.
  const urls   = new Set();
  const imgRe  = /<img\b[^>]*>/gi;
  const srcRe  = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
  let m;
  while ((m = imgRe.exec(html))) {
    const sm = m[0].match(srcRe);
    const url = sm && (sm[1] || sm[2] || '').trim();
    if (url) urls.add(url);
  }
  if (!urls.size) return html;

  // Fetch + convert each remote image.
  const map = {};
  await Promise.all([...urls].map(async (raw) => {
    if (/^data:/i.test(raw)) return;                  // already inline
    let fetchUrl = raw.replace(/&amp;/gi, '&');       // un-escape HTML entities
    if (fetchUrl.startsWith('//')) fetchUrl = 'https:' + fetchUrl;
    if (!/^https?:\/\//i.test(fetchUrl)) return;      // relative / blob: / cid: — can't resolve here
    try {
      const resp = await fetch(fetchUrl, { referrerPolicy: 'no-referrer' });
      if (!resp.ok) { console.warn('[GB PA] image fetch failed', resp.status, fetchUrl); return; }
      const type = resp.headers.get('content-type') || 'image/png';
      if (!/^image\//i.test(type)) return;            // not an image
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > GB_MAX_IMG_BYTES) { console.warn('[GB PA] image too large, left as URL', fetchUrl); return; }
      map[raw] = `data:${type};base64,${gbBufToBase64(buf)}`;
    } catch (e) {
      console.warn('[GB PA] image inline error', fetchUrl, e.message);
    }
  }));

  const origs = Object.keys(map);
  if (!origs.length) return html;

  // Replace longest URLs first so a shorter URL can't corrupt a longer one
  // that contains it as a substring.
  let out = html;
  origs.sort((a, b) => b.length - a.length);
  for (const orig of origs) out = out.split(orig).join(map[orig]);
  return out;
}


// ── Graph OAuth PKCE helpers ──────────────────────────────────────────────────

function gbGenCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function gbCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function gbRefreshToken(refreshToken, clientId) {
  if (!refreshToken || !clientId) return { ok: false, error: 'No refresh token or client ID' };
  try {
    const REDIRECT = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        redirect_uri:  REDIRECT,
        scope:         'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      }).toString(),
    });
    const data2 = await resp.json();
    if (data2.error) throw new Error(data2.error_description || data2.error);
    const record = {
      accessToken:  data2.access_token,
      refreshToken: data2.refresh_token || refreshToken,
      expiresAt:    Date.now() + (data2.expires_in * 1000),
    };
    await new Promise(r => chrome.storage.local.set({ gbGraphToken: record }, r));
    return { ok: true, token: data2.access_token };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
