/* ───────────────────────────────────────────────────────────────
   submitCaseCategory.js — apply a category/subcategory to a CRM case.

   Ported verbatim from _submitCategoryUpdate in the (removed) vanilla
   text-preview.js: read the case (Get.ajax), merge the new
   Category/Subcategory, and write it back (Update.ajax). Both go
   through the background fetchRaw bridge for the right session cookies.
─────────────────────────────────────────────────────────────── */

const BASE = 'https://api.golfballs.com';

const send = (msg) => new Promise((res) => {
  try { chrome.runtime.sendMessage(msg, (r) => { if (chrome.runtime.lastError) res(null); else res(r); }); }
  catch { res(null); }
});

/** Resolve the acting employee id from the page / storage. */
export async function getEmployeeId() {
  const el = typeof document !== 'undefined' ? document.getElementById('tbCurrentAdmin') : null;
  if (el?.value?.trim()) return el.value.trim();
  if (typeof window !== 'undefined') {
    if (window.Case?.ClosedBy) return String(window.Case.ClosedBy);
    if (window.__gbEmployeeId) return String(window.__gbEmployeeId);
  }
  try {
    const data = await new Promise((res) => chrome.storage.local.get(['gbEmployeeId', 'featureFlags'], res));
    const id = data?.gbEmployeeId || data?.featureFlags?.gbEmployeeId;
    if (id) return String(id);
  } catch { /* ignore */ }
  return null;
}

/** Apply the category. Returns { ok: true } | { ok: false, error }. */
export async function submitCaseCategory(caseId, category, subcategory) {
  if (!caseId) return { ok: false, error: 'No caseID found.' };
  try {
    const getResp = await send({ action: 'fetchRaw', url: `${BASE}/golfballs/crm/Admin/MyCase/Get.ajax?${caseId}` });
    let caseData = {};
    try { caseData = JSON.parse(getResp?.text || '{}'); } catch { /* ignore */ }
    if (!caseData.caseID) return { ok: false, error: 'Could not read case data.' };

    const employeeId = await getEmployeeId();
    const payload = {
      Name:        caseData.Name      || '',
      Direction:   caseData.Direction || 'In',
      Channel:     caseData.Channel   || 'Email',
      Category:    category,
      Subcategory: subcategory || category,
      Owner:       String(caseData.OwnerID || '1'),
      caseID:      String(caseId),
      Department:  String(caseData.DepartmentID || '2'),
      Status:      3,
    };
    if (employeeId) payload.ClosedBy = String(employeeId);

    const upResp = await send({ action: 'fetchRaw', url: `${BASE}/golfballs/crm/Admin/MyCase/Update.ajax?${JSON.stringify(payload)}` });
    let result = {};
    try { result = JSON.parse(upResp?.text || '{}'); } catch { /* ignore */ }

    const ok = result.caseID === parseInt(caseId, 10) || /success|ok/i.test(upResp?.text || '');
    if (!ok && upResp?.text && upResp.text.length < 200) return { ok: false, error: upResp.text };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unknown error' };
  }
}
