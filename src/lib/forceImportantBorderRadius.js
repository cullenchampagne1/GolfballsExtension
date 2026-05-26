/* Force `!important` on every inline `border-radius` inside the
   extension's UI roots. React's `style` prop can't carry !important,
   so host pages that ship `* { border-radius: 0 !important }`
   (e.g. the golfballs.com / icustomize CRM stylesheets) flatten our
   rounded corners. This file walks every element under any extension
   mount root (id beginning with `__gb-`) and re-applies whatever
   `border-radius` React just wrote with the `important` priority.

   Idempotent — repeat calls bail. Cheap — only fires on actual
   style-attribute changes inside our own subtrees, not host page DOM. */

const ROOT_ID_PREFIX = '__gb-';
let started = false;

function patch(el) {
  if (!el || el.nodeType !== 1 || !el.style) return;
  const v = el.style.borderRadius;
  if (v && el.style.getPropertyPriority('border-radius') !== 'important') {
    el.style.setProperty('border-radius', v, 'important');
  }
}

function patchTree(root) {
  patch(root);
  if (root.querySelectorAll) {
    root.querySelectorAll('[style]').forEach(patch);
  }
}

function observe(root) {
  if (root.__gbBrObserved) return;
  root.__gbBrObserved = true;
  patchTree(root);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        patch(m.target);
      } else if (m.type === 'childList') {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) patchTree(n); });
      }
    }
  });
  mo.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });
}

export function startForceImportantBorderRadius() {
  if (started) return;
  if (typeof document === 'undefined') return;
  started = true;

  const scanForRoots = () => {
    document.querySelectorAll(`[id^="${ROOT_ID_PREFIX}"]`).forEach(observe);
  };

  const watchForRoots = () => {
    scanForRoots();
    const bodyMo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (typeof n.id === 'string' && n.id.startsWith(ROOT_ID_PREFIX)) {
            observe(n);
          }
        }
      }
    });
    bodyMo.observe(document.body, { childList: true });
  };

  if (document.body) {
    watchForRoots();
  } else {
    document.addEventListener('DOMContentLoaded', watchForRoots, { once: true });
  }
}
