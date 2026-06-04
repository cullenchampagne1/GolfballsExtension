/* ───────────────────────────────────────────────────────────────
   sandbox-bridge.js — content-script side of the code-variable sandbox.

   MV3 forbids `new Function` in the content-script world, so we host a
   sandboxed iframe (sandbox.html → sandbox-eval.js) that CAN eval. This
   module:
     • lazily frames the sandbox page (once per page) and waits for ready,
     • posts code-var jobs to it and resolves with the body's value,
     • services the privileged-helper calls it proxies back
       (h.send / h.fetch* / h.catalog.* / h.domText) using the REAL
       helpers, which have chrome + the live DOM.

   See sandbox/sandbox-eval.entry.js for the other side + the protocol.
─────────────────────────────────────────────────────────────── */

import { helpersFor } from './code-runtime.js';

const SANDBOX_URL = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
  ? chrome.runtime.getURL('sandbox.html')
  : null;

let framePromise = null;        // Promise<HTMLIFrameElement> (resolved once ready)
const jobs = new Map();         // jobId → { resolve, reject }
const jobDocs = new Map();      // jobId → doc (for the domText proxy)
let seq = 0;
let listening = false;

function getByPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/* One window listener handles BOTH job results coming back from the
   sandbox and the privileged-helper calls it proxies out. */
function installListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', async (ev) => {
    const m = ev.data;
    if (!m || m.__gbSandbox == null) return;

    if (m.__gbSandbox === 'result') {
      const job = jobs.get(m.id);
      if (!job) return;
      jobs.delete(m.id); jobDocs.delete(m.id);
      if (m.ok) job.resolve(m.value); else job.reject(new Error(m.error || 'code var failed'));
      return;
    }

    if (m.__gbSandbox === 'hcall') {
      const frame = await framePromise.catch(() => null);
      const win = frame && frame.contentWindow;
      const reply = (ok, value, error) => { try { win && win.postMessage({ __gbSandbox: 'hresult', callId: m.callId, ok, value, error }, '*'); } catch {} };
      try {
        const doc = jobDocs.get(m.jobId) || (typeof document !== 'undefined' ? document : null);
        const h = helpersFor(doc);
        const fn = getByPath(h, m.path);
        if (typeof fn !== 'function') throw new Error(`unknown helper: h.${m.path}`);
        const value = await fn(...(Array.isArray(m.args) ? m.args : []));
        reply(true, value);
      } catch (e) {
        reply(false, undefined, (e && e.message) || String(e));
      }
    }
  });
}

function ensureFrame() {
  if (framePromise) return framePromise;
  installListener();
  framePromise = new Promise((resolve, reject) => {
    if (!SANDBOX_URL || typeof document === 'undefined') {
      reject(new Error('code sandbox is unavailable in this context'));
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = SANDBOX_URL;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:0;visibility:hidden;';
    let done = false;
    const settle = (fn, arg) => { if (done) return; done = true; window.removeEventListener('message', onReady); fn(arg); };
    const onReady = (ev) => {
      if (!iframe.contentWindow || ev.source !== iframe.contentWindow) return;
      if (!ev.data || ev.data.__gbSandbox !== 'ready') return;
      settle(resolve, iframe);
    };
    window.addEventListener('message', onReady);
    iframe.addEventListener('error', () => settle(reject, new Error('sandbox iframe failed to load')));
    (document.documentElement || document.body).appendChild(iframe);
    setTimeout(() => settle(reject, new Error('sandbox iframe load timed out')), 8000);
  });
  return framePromise;
}

/**
 * Run a code-variable body in the sandbox.
 * @param {string} body   the code-var body
 * @param {object} ctx    extracted page JSON (serializable)
 * @param {object} vars   previously-resolved vars (serializable)
 * @param {Document} doc  the document privileged DOM helpers should read
 * @returns {Promise<*>}  the body's return value
 */
export async function runInSandbox(body, ctx, vars = {}, doc = undefined) {
  const frame = await ensureFrame();
  const id = `j${++seq}`;
  jobDocs.set(id, doc || (typeof document !== 'undefined' ? document : null));
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    try {
      frame.contentWindow.postMessage({ __gbSandbox: 'run', id, body, ctx, vars }, '*');
    } catch (e) {
      jobs.delete(id); jobDocs.delete(id); reject(e); return;
    }
    setTimeout(() => {
      if (jobs.has(id)) { jobs.delete(id); jobDocs.delete(id); reject(new Error('code var timed out (no sandbox response)')); }
    }, 15000);
  });
}
