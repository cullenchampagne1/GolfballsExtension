import { useState, useSyncExternalStore } from 'react';

/* ───────────────────────────────────────────────────────────────
   actionRegistry — singleton store for the bottom-right Actions
   Shelf. Features (modals, page-content scripts, smart-detection
   probes) call `register(action)` to advertise something the user
   can do. The shelf renders them grouped + filtered against the
   current context (page type + open-modal stack).

   The shelf decides what's "smart" by matching each action's
   `smartFor` page list and `whenModalOpen` modal list against the
   current context. Smart actions float to the top.

   No React imports here — pure JS so it can be called from
   content-script entries, background-script handlers, anywhere.
   Subscribers (React hooks below) re-render on any change.
─────────────────────────────────────────────────────────────── */

/* Action shape:
   {
     id:           string                 // unique, required
     label:        string                 // primary text, required
     icon:         ReactElement           // <Svg> or icon component
     hint?:        string                 // secondary text under label
     handler:      () => void             // run on pick
     category?:    'page' | 'danger'      // grouping (default 'page')
     smartFor?:    string[]               // page keys where this is "smart"
     whenModalOpen?: string[]             // modal ids where this is "smart"
     kbd?:         string                 // shortcut display, e.g. "⌘K"
     badge?:       { label, tone }        // tag rendered on the right
     keepOpen?:    boolean                // don't auto-close shelf after pick
   }
*/

const _actions = new Map();   // id → action
let _page = null;             // current page key (e.g. 'contact', 'account')
let _pageLabel = '';          // human-readable for the shelf header
let _pageSubLabel = '';
let _modalStack = [];         // top of stack = most recent modal
const _subscribers = new Set();

function notify() {
  for (const fn of _subscribers) fn();
}

export const actionRegistry = {
  /* ── Action registration ──────────────────────────────────── */
  register(action) {
    if (!action || !action.id) throw new Error('actionRegistry.register: action.id required');
    _actions.set(action.id, action);
    notify();
    // Return an unregister function so callers can clean up on
    // teardown without remembering the id.
    return () => actionRegistry.unregister(action.id);
  },
  unregister(id) {
    if (_actions.delete(id)) notify();
  },
  clear() {
    if (_actions.size === 0) return;
    _actions.clear();
    notify();
  },

  /* ── Page context ────────────────────────────────────────── */
  // Features set the page context when smart-detection identifies it.
  // page is a stable string key ('contact', 'account', 'order', etc.).
  // label/subLabel are display strings for the shelf header.
  setPage(page, label = '', subLabel = '') {
    if (_page === page && _pageLabel === label && _pageSubLabel === subLabel) return;
    _page = page;
    _pageLabel = label;
    _pageSubLabel = subLabel;
    notify();
  },
  getPage() { return _page; },
  getPageLabel() { return _pageLabel; },
  getPageSubLabel() { return _pageSubLabel; },

  /* ── Modal stack ─────────────────────────────────────────── */
  // Modals push themselves on mount, pop on close. Top of stack
  // is the "active" modal — shelf reads it to surface modal-aware
  // smart actions. Stack allows nested modals (e.g. CRMSearch →
  // QueryBuilder) to both count as "open" but the topmost is the
  // primary context.
  pushModal(modalId) {
    if (!modalId) return;
    _modalStack.push(modalId);
    notify();
  },
  popModal(modalId) {
    // Remove the LAST occurrence so out-of-order closes (rare) still
    // do the right thing. If id is omitted, pops the top.
    if (!modalId) { _modalStack.pop(); notify(); return; }
    const i = _modalStack.lastIndexOf(modalId);
    if (i < 0) return;
    _modalStack.splice(i, 1);
    notify();
  },
  getModalStack() { return _modalStack.slice(); },
  getTopModal() { return _modalStack[_modalStack.length - 1] || null; },

  /* ── Read ────────────────────────────────────────────────── */
  getActions() { return Array.from(_actions.values()); },

  /* ── Subscribe ───────────────────────────────────────────── */
  subscribe(fn) {
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
  },
};

/* Group + filter the registry by current context. The shelf renders
   what this returns. Smart actions float; page actions catch the
   rest; danger actions get a divider above them in the UI.

   Smart matching:
     - page in action.smartFor → smart
     - topModal in action.whenModalOpen → smart
   An action can be smart for multiple reasons; counted once.

   An action that's smart for the current context is REMOVED from
   the page-actions list to avoid showing it twice. Danger actions
   are always under danger regardless of context. */
function getContextualActions() {
  const all = actionRegistry.getActions();
  const page = actionRegistry.getPage();
  const topModal = actionRegistry.getTopModal();

  const smart = [];
  const pageActions = [];
  const danger = [];

  for (const a of all) {
    if (a.category === 'danger' || a.tone === 'danger') {
      danger.push(a);
      continue;
    }
    const isSmart = (a.smartFor && a.smartFor.includes(page))
                 || (a.whenModalOpen && a.whenModalOpen.includes(topModal));
    if (isSmart) {
      smart.push(a);
    } else {
      pageActions.push(a);
    }
  }
  return { smart, page: pageActions, danger };
}

/* ── React hook ─────────────────────────────────────────────────
   useSyncExternalStore is the React-blessed way to subscribe to a
   non-React store — runs the snapshot, re-renders on subscribe-
   notify. The snapshot returns the contextual breakdown directly,
   so components just read what they need.

   Caveat: getContextualActions() returns a new object every call.
   To make this hook stable across renders WITHOUT object identity
   churn, the snapshot itself returns the registry's "version" and
   we re-derive in the component. Simpler: just track a counter
   and let the consumer call getContextualActions() once per render.
─────────────────────────────────────────────────────────────── */
let _version = 0;
actionRegistry.subscribe(() => { _version += 1; });

function subscribe(cb) {
  return actionRegistry.subscribe(cb);
}
function getSnapshot() {
  return _version;
}

export function useActionRegistry() {
  // Bump on every change. Consumer calls getContextualActions()
  // and reads page/modal state from the registry directly.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    actions: getContextualActions(),
    page: actionRegistry.getPage(),
    pageLabel: actionRegistry.getPageLabel(),
    pageSubLabel: actionRegistry.getPageSubLabel(),
    modalStack: actionRegistry.getModalStack(),
    topModal: actionRegistry.getTopModal(),
  };
}

