/* Force `!important` on every inline `border-radius` inside the
   extension's UI. React's `style` prop can't carry !important, so host
   pages that ship `* { border-radius: 0 !important }` (e.g. the
   golfballs.com / icustomize CRM stylesheets) flatten our rounded
   corners. This file watches the whole document, but only re-applies
   `border-radius` with `important` priority on elements that live
   inside an extension subtree — never on host-page elements.

   "Extension subtree" = the element (or any ancestor) either:
     - has an id starting with `__gb-` (mount roots created by
       mountFloating, actions-shelf, etc.), or
     - has any class starting with `gb-` (gb-modal-card, gb-dd-list,
       gb-rte-content, …). This is the only way to catch portal-rendered
       modals — FloatingPanel uses createPortal(…, document.body), so
       its content is OUTSIDE the __gb- mount root in the DOM tree.

   Idempotent — repeat calls bail. */

const ROOT_ID_PREFIX = '__gb-';
const CLASS_PREFIX = 'gb-';
let started = false;

/* On extension-owned pages (popup.html, editor.html, playground.html,
   charge.html) we OWN every element — no host-page DOM to be careful
   around — so we can patch everything. On content-script context
   (chrome injected into golfballs.com pages) we have to walk up and
   confirm the element is part of an extension subtree first. */
const IS_OWN_PAGE = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';

function isExtensionElement(el) {
  if (IS_OWN_PAGE) return true;
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    if (typeof cur.id === 'string' && cur.id.startsWith(ROOT_ID_PREFIX)) return true;
    const cl = cur.classList;
    if (cl && cl.length) {
      for (let i = 0; i < cl.length; i++) {
        if (cl[i].startsWith(CLASS_PREFIX)) return true;
      }
    }
    cur = cur.parentNode;
  }
  return false;
}

function patch(el) {
  if (!el || el.nodeType !== 1 || !el.style) return;
  const v = el.style.borderRadius;
  if (!v) return;
  if (el.style.getPropertyPriority('border-radius') === 'important') return;
  if (!isExtensionElement(el)) return;
  el.style.setProperty('border-radius', v, 'important');
}

function patchTree(root) {
  if (!root || root.nodeType !== 1) return;
  patch(root);
  if (root.querySelectorAll) {
    root.querySelectorAll('[style]').forEach(patch);
  }
}

export function startForceImportantBorderRadius() {
  if (started) return;
  if (typeof document === 'undefined') return;
  started = true;

  const wire = () => {
    patchTree(document.body);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          patch(m.target);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1) patchTree(n); });
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  };

  if (document.body) wire();
  else document.addEventListener('DOMContentLoaded', wire, { once: true });
}
