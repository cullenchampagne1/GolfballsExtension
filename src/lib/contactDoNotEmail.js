export const DO_NOT_CONTACT_MARKER = 'DO NOT CONTACT';

const MARKER_RE = /\bDO\s+NOT\s+CONTACT\b/i;
const MARKER_GLOBAL_RE = /\bDO\s+NOT\s+CONTACT\b/gi;

export function hasDoNotContactMarker(context) {
  return MARKER_RE.test(String(context || ''));
}

export function addDoNotContactMarker(context) {
  const notes = String(context || '').trim();
  if (hasDoNotContactMarker(notes)) return notes;
  return notes ? `${DO_NOT_CONTACT_MARKER}\n${notes}` : DO_NOT_CONTACT_MARKER;
}

export function removeDoNotContactMarker(context) {
  return String(context || '')
    .replace(MARKER_GLOBAL_RE, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function toggleDoNotContactMarker(context) {
  return hasDoNotContactMarker(context)
    ? removeDoNotContactMarker(context)
    : addDoNotContactMarker(context);
}

export function contactIdFromUrl(url) {
  return (String(url || '').match(/[?&]customerID=(\d{1,12})(?:[&#]|$)/i) || [])[1] || '';
}

const STYLE_ID = '__gb-do-not-email-style';
const BUTTON_ID = '__gb-do-not-email-toggle';
const EMAIL_CLASS = 'gb-do-not-email';

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #lblContactEmail.${EMAIL_CLASS},
    #lblContactEmail.${EMAIL_CLASS} a {
      text-decoration: line-through !important;
      text-decoration-thickness: 2px !important;
      text-decoration-color: #c9302c !important;
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

function findDoNotCallControl(actions) {
  return Array.from(actions?.querySelectorAll('a, button') || [])
    .find((element) => /do\s+not\s+call/i.test(element.textContent || '')) || null;
}

export function syncContactDoNotEmail(doc) {
  const contextCell = doc.getElementById('lblContactCustomDataContext');
  const emailCell = doc.getElementById('lblContactEmail');
  const button = doc.getElementById(BUTTON_ID);
  const active = hasDoNotContactMarker(contextCell?.textContent);

  emailCell?.classList.toggle(EMAIL_CLASS, active);
  if (emailCell) {
    if (active) {
      emailCell.title = 'Do not email — contact context is marked DO NOT CONTACT';
    } else if (emailCell.title.startsWith('Do not email')) {
      emailCell.removeAttribute('title');
    }
  }
  if (button) {
    button.textContent = active
      ? 'Remove From Do Not Email List'
      : 'Add To Do Not Email List';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  return active;
}

export function mountContactDoNotEmail({
  doc = document,
  href = location.href,
  updateContact,
  toast = globalThis.window?.__gbToast,
  MutationObserverImpl = doc.defaultView?.MutationObserver,
} = {}) {
  const customerId = contactIdFromUrl(href);
  const contextCell = doc.getElementById('lblContactCustomDataContext');
  const emailCell = doc.getElementById('lblContactEmail');
  const contactPortlet = emailCell?.closest('.portlet');
  const actions = contactPortlet?.querySelector('.portlet-title .actions');
  const doNotCallControl = findDoNotCallControl(actions);
  if (!customerId || !contextCell || !emailCell || !actions || !doNotCallControl) return null;

  ensureStyle(doc);
  let button = doc.getElementById(BUTTON_ID);
  if (!button) {
    button = doc.createElement('a');
    button.id = BUTTON_ID;
    button.href = '#';
    button.className = 'btn mini red';
    button.setAttribute('role', 'button');
    doNotCallControl.insertAdjacentElement('afterend', button);
  }

  const sync = () => syncContactDoNotEmail(doc);
  sync();

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    if (button.dataset.loading === '1' || typeof updateContact !== 'function') return;
    const currentContext = contextCell.textContent || '';
    const nextContext = toggleDoNotContactMarker(currentContext);
    const enabling = hasDoNotContactMarker(nextContext);
    button.dataset.loading = '1';
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'Updating…';
    try {
      await updateContact(customerId, { Context: nextContext });
      contextCell.textContent = nextContext;
      globalThis.window?.__gbPageEngine?.clearCache?.(doc);
      sync();
      const toastHost = toast || globalThis.window?.__gbToast;
      toastHost?.success?.(enabling ? 'Contact marked do not email' : 'Contact can receive email');
    } catch {
      sync();
      const toastHost = toast || globalThis.window?.__gbToast;
      toastHost?.error?.('Could not update email contact preference');
    } finally {
      delete button.dataset.loading;
      button.removeAttribute('aria-disabled');
    }
  });

  const observer = MutationObserverImpl ? new MutationObserverImpl(sync) : null;
  observer?.observe(contextCell, { childList: true, characterData: true, subtree: true });
  return { button, sync, disconnect: () => observer?.disconnect() };
}
