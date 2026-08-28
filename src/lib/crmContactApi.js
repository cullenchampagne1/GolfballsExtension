/** Focused CRM contact transport shared by active modal and workflow tools. */
import { mergeContactCustomData } from './crmContact.js';

export function crmOrigin() {
  try {
    if (/(^|\.)golfballs\.com$/i.test(location.hostname)) return location.origin;
  } catch { /* use the canonical API host outside a CRM page */ }
  return 'https://api.golfballs.com';
}

export function gbToast(message, tone = 'info') {
  try {
    const toast = window.__gbToast;
    (toast && (toast[tone] || toast.info) || (() => {}))(message);
  } catch { /* a toast host is optional */ }
}

export async function crmGetContact(customerId) {
  const response = await fetch(
    `${crmOrigin()}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw new Error('contact lookup failed');
  const current = JSON.parse(await response.text());
  let customData = {};
  try {
    customData = current.CustomData
      ? (typeof current.CustomData === 'string' ? JSON.parse(current.CustomData) : current.CustomData)
      : {};
  } catch { customData = {}; }
  return { ...current, customData };
}

export async function crmUpdateContact(customerId, edits) {
  const base = crmOrigin();
  const response = await fetch(
    `${base}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw new Error('contact lookup failed');
  const current = JSON.parse(await response.text());
  const has = (key) => Object.prototype.hasOwnProperty.call(edits, key);
  const pick = (key, source) => (has(key) ? edits[key] : (source == null ? '' : source));
  const payload = {
    customerId: String(customerId),
    firstName: pick('firstName', current.firstName),
    middleInit: pick('middleInit', current.middleInit),
    lastName: pick('lastName', current.lastName),
    companyName: pick('companyName', current.companyName),
    jobTitle: pick('jobTitle', current.jobTitle),
    email: pick('email', current.email),
    phoneNumber: pick('phoneNumber', current.phoneNumber),
    zipCode: pick('zipCode', current.zipCode),
    UserType: String(has('UserType') ? edits.UserType : (current.userType == null ? 1 : current.userType)),
    userCountry: pick('userCountry', current.userCountry) || 'US',
    CustomData: mergeContactCustomData(current.CustomData, edits),
  };
  const update = await fetch(
    `${base}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`,
    { credentials: 'include' },
  );
  if (!update.ok) throw new Error('update failed');
}
