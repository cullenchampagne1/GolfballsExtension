/* ───────────────────────────────────────────────────────────────
   submitCallLog.js — single source of truth for posting a call-log
   template to the CRM's activity log.

   This is a verbatim port of the GET-form-then-POST-with-fields
   flow from the legacy quick-action panel (src/vanilla/call-log-
   panel.js → submitCallLog) wrapped in a clean async API that
   both the playground and the production content-script can call.

   Flow:
     1. Validate the template has a callCategory (CRM rejects 0).
     2. Validate we have enough context to attach the log
        somewhere — contactId, phone, employeeId. If anything's
        missing we bail with an `error` instead of guessing, so a
        sandbox/mock call surfaces the missing piece instead of
        writing an orphan record.
     3. GET /golfballs/adminnew/Default.aspx?Page=272 — the CRM's
        activity-log form. We need the hidden ASP.NET VIEWSTATE +
        EVENTVALIDATION fields out of that response.
     4. Overlay our template's tbCategory/tbSubject/tbBody/Voicemail
        on top of the scraped form.
     5. POST the populated form back to the same URL. The CRM
        commits the activity to its database.

   Returns `{ ok: true }` on success, `{ ok: false, error: <string> }`
   on any validation OR transport failure. Never throws — the
   caller (the CallLog modal) feeds the error directly into a
   toast, so the rep sees what went wrong without needing devtools.
─────────────────────────────────────────────────────────────── */

const BASE = 'https://api.golfballs.com';

const hasChromeRuntime = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage; }
  catch { return false; }
};

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local?.get; }
  catch { return false; }
};

/**
 * Read whatever call-context the current DOM exposes. Returns an
 * object — fields we can't find come back as empty strings. Safe
 * to call from anywhere (returns mostly-empty outside a contact
 * page). Caller does validation.
 *
 * The selectors mirror the legacy call-log-panel.js getters so
 * the same contact pages keep working.
 */
export async function readCallContext() {
  const out = { contactId: '', phone: '', contactName: '', employeeId: '', contactType: 'contact' };
  if (typeof document === 'undefined') return out;

  // contactId — try URL first, fallback to the hidden form input.
  const hrefMatch = (typeof location !== 'undefined' ? location.href : '').match(/[?&]customerID=(\d+)/i);
  if (hrefMatch) {
    out.contactId = hrefMatch[1];
  } else {
    out.contactId = document.getElementById('tbContactId')?.value?.trim() || '';
  }

  // phone — strip non-digits the way the legacy panel does, since
  // the CRM URL expects bare digits in the query string.
  const phoneEl = document.getElementById('lblContactPhoneNumber');
  const rawPhone = (phoneEl?.querySelector?.('a')?.textContent || phoneEl?.textContent || '').trim();
  out.phone = rawPhone.replace(/\D/g, '');

  // contactName — split across two labels on the contact page.
  const first = (document.getElementById('lblContactFirstName')?.textContent || '').trim();
  const last  = (document.getElementById('lblContactLastName')?.textContent  || '').trim();
  out.contactName = `${first} ${last}`.trim();

  // employeeId — comes from chrome.storage.local, set by the auth flow.
  if (hasChromeStorage()) {
    try {
      out.employeeId = await new Promise((resolve) => {
        chrome.storage.local.get('gbEmployeeId', (d) => resolve(d?.gbEmployeeId || ''));
      });
    } catch { /* leave empty */ }
  }

  return out;
}

/**
 * Submit a single call-log template to the CRM.
 *
 *   template — Template object (preset from noteTemplates OR the
 *              synthetic one buildCustomTemplate() produces). Must
 *              have a non-zero callCategory.
 *   context  — { contactId, phone, employeeId, contactName? }.
 *              All required. Missing fields short-circuit with a
 *              clear error so sandbox/mock calls fail loud.
 *
 * Returns Promise<{ ok: true } | { ok: false, error: string }>.
 * Never throws — every error path resolves with a string the modal
 * can drop straight into a toast.
 */
export async function submitCallLog({ template, context } = {}) {
  const tpl = template || {};
  const ctx = context  || {};

  /* ── 1. Template validation ──────────────────────────────── */
  const callCategory = parseInt(tpl.callCategory, 10) || 0;
  if (!callCategory) {
    return {
      ok: false,
      error: 'Template has no category set. Open Notes editor and pick a CRM category first.',
    };
  }

  /* ── 2. Context validation — the "safe in sandbox" bit ────
       Each of these is something the CRM needs to actually attach
       the log entry to a contact. If any are missing we refuse to
       submit — that's exactly what we want when running in the
       playground with mocked data, OR if smart-detection failed
       to read a real contact page. */
  const missing = [];
  if (!ctx.contactId)  missing.push('contact ID');
  if (!ctx.phone)      missing.push('phone number');
  if (!ctx.employeeId) missing.push('employee ID');
  if (missing.length) {
    return {
      ok: false,
      error: `Missing ${missing.join(', ')}. Open from a real contact page first.`,
    };
  }

  /* ── 3. Runtime check — without chrome.runtime we can't reach
       the CRM at all (no shared auth cookies, no fetchRaw bridge).
       This is what makes the playground a true "safe sandbox": even
       if you fake the context fields, the submit still won't fire
       a real network call. */
  if (!hasChromeRuntime()) {
    return {
      ok: false,
      error: 'CRM bridge unavailable — not running in extension context.',
    };
  }

  /* ── 4. GET the activity-log form to scrape hidden ASP.NET fields */
  const urlDir = tpl.callDirection === 1 ? '1' : '2';
  const userName = encodeURIComponent(ctx.contactName || '');
  const pageUrl = `${BASE}/golfballs/adminnew/Default.aspx?Page=272`
    + `&phone=${encodeURIComponent(ctx.phone)}`
    + `&employeeId=${encodeURIComponent(ctx.employeeId)}`
    + `&userName=${userName}`
    + `&userId=${encodeURIComponent(ctx.contactId)}`
    + `&direction=${urlDir}`
    + `&callFrom=0`;

  let getResp;
  try {
    getResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'fetchRaw', url: pageUrl }, resolve);
    });
  } catch (err) {
    return { ok: false, error: `Couldn't reach the CRM: ${err?.message || err}` };
  }
  if (!getResp?.ok) {
    return { ok: false, error: `CRM returned HTTP ${getResp?.status || 'error'} loading the form.` };
  }

  const doc = new DOMParser().parseFromString(getResp.text, 'text/html');
  const form = doc.forms[0];
  if (!form) {
    return { ok: false, error: 'Activity-log form not found in the CRM response.' };
  }

  /* ── 5. Build the POST payload — copy the existing fields out
       of the scraped form (VIEWSTATE etc.) and overlay our template's
       category/subject/body/voicemail values. setField uses an
       ends-with selector because ASP.NET ids are prefixed with
       ctl00$… per parent control. */
  const formData = new URLSearchParams();
  for (const [key, val] of new FormData(form)) {
    formData.append(key, val);
  }
  const setField = (nameEndsWith, value) => {
    const input = form.querySelector(`[name$="${nameEndsWith}"]`);
    if (input) formData.set(input.name, value);
  };
  setField('tbCategory', String(callCategory));
  setField('tbSubject',  String(tpl.subject || tpl.name || 'Quick Log Entry'));
  setField('tbBody',     String(tpl.body || 'Logged via Call Log modal'));
  if (tpl.callVoicemail) setField('Voicemail', 'on');

  // ASP.NET needs the submit button's name+value to fire the right
  // server-side handler — otherwise it treats the POST as a postback
  // with no triggering control and ignores our fields.
  const submitBtn = form.querySelector('input[type="submit"][id*="btnSubmit"], button[type="submit"]');
  if (submitBtn?.name) {
    formData.set(submitBtn.name, submitBtn.value || 'Save Activity');
  }

  /* ── 6. POST it ──────────────────────────────────────────── */
  let postResp;
  try {
    postResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'fetchRaw',
        url: pageUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }, resolve);
    });
  } catch (err) {
    return { ok: false, error: `CRM POST failed: ${err?.message || err}` };
  }
  if (!postResp?.ok) {
    return { ok: false, error: `CRM rejected the submission (HTTP ${postResp?.status || 'error'}).` };
  }

  return { ok: true };
}
