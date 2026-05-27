import { useEffect, useState, useSyncExternalStore } from 'react';

/* ───────────────────────────────────────────────────────────────
   actionRegistry — singleton store for the bottom-right Actions
   Shelf. Features (modals, page-content scripts, smart-detection
   probes) call `register(action)` to advertise something the user
   can do. The shelf renders them grouped + filtered against the
   current context (page type + open-modal stack).

   Cross-bundle sharing
   --------------------
   Each content_script entry in manifest.json is its own JavaScript
   bundle, so importing this module from (say) crm-search.js and
   actions-shelf.js would normally produce two independent copies —
   pushModal in one bundle wouldn't reach subscribers in the other.

   To fix that we build the registry once and stash it on window as
   `__gbActionRegistry`. Every subsequent bundle that imports this
   module reuses the existing instance. Result: register / pushModal
   from any content script lands in the same _state and notifies
   every React tree that subscribed via useActionRegistry().

   The shelf decides what's "smart" by matching each action's
   `smartFor` page list and `whenModalOpen` modal list against the
   current context. Modal matches go in a dedicated section; page
   matches go under "Smart for this page".
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

function _build() {
  // All mutable state lives in this single object so the registry's
  // methods (which close over it) and the React hook (which reads
  // via accessors) see the same data — even when imported from a
  // different content-script bundle that re-reads the same window
  // singleton.
  const state = {
    actions: new Map(),    // id → action
    page: null,            // current page key (e.g. 'contact')
    pageLabel: '',         // human-readable for the shelf header
    pageSubLabel: '',
    modalStack: [],        // top = most recent { id, label }
    subscribers: new Set(),
    version: 0,            // bumped on every change for useSyncExternalStore
  };

  function notify() {
    state.version += 1;
    for (const fn of state.subscribers) fn();
  }

  const r = {
    /* Exposed so the React hook can use it as getSnapshot. Stable
       primitive (number) so React's identity check passes when
       nothing has actually changed. */
    _state: state,

    /* ── Action registration ──────────────────────────────────── */
    register(action) {
      if (!action || !action.id) throw new Error('actionRegistry.register: action.id required');
      state.actions.set(action.id, action);
      notify();
      // Return an unregister fn so callers don't have to remember the id.
      return () => r.unregister(action.id);
    },
    unregister(id) {
      if (state.actions.delete(id)) notify();
    },
    clear() {
      if (state.actions.size === 0) return;
      state.actions.clear();
      notify();
    },

    /* ── Page context ────────────────────────────────────────── */
    setPage(page, label = '', subLabel = '') {
      if (state.page === page && state.pageLabel === label && state.pageSubLabel === subLabel) return;
      state.page = page;
      state.pageLabel = label;
      state.pageSubLabel = subLabel;
      notify();
    },
    getPage() { return state.page; },
    getPageLabel() { return state.pageLabel; },
    getPageSubLabel() { return state.pageSubLabel; },

    /* ── Modal stack ─────────────────────────────────────────── */
    // Modals push themselves on mount, pop on close. Top of stack
    // is the "active" modal — shelf reads it to surface modal-aware
    // smart actions in a dedicated section. Stack allows nested
    // modals (e.g. CRMSearch → QueryBuilder) to both count as
    // "open" but the topmost is the primary context.
    //
    // Each entry is { id, label }. The id-only legacy contract
    // still works (label defaults to '').
    pushModal(modalId, label) {
      if (!modalId) return;
      const entry = (typeof modalId === 'object')
        ? { id: modalId.id, label: modalId.label || '' }
        : { id: modalId, label: label || '' };
      if (!entry.id) return;
      state.modalStack.push(entry);
      notify();
    },
    popModal(modalId) {
      if (!modalId) { state.modalStack.pop(); notify(); return; }
      const id = (typeof modalId === 'object') ? modalId.id : modalId;
      for (let i = state.modalStack.length - 1; i >= 0; i--) {
        if (state.modalStack[i].id === id) {
          state.modalStack.splice(i, 1);
          notify();
          return;
        }
      }
    },
    getModalStack() { return state.modalStack.slice(); },
    getTopModal() {
      const top = state.modalStack[state.modalStack.length - 1];
      return top ? top.id : null;
    },
    getTopModalLabel() {
      const top = state.modalStack[state.modalStack.length - 1];
      return top ? (top.label || '') : '';
    },

    /* ── Read ────────────────────────────────────────────────── */
    getActions() { return Array.from(state.actions.values()); },

    /* ── Subscribe ───────────────────────────────────────────── */
    subscribe(fn) {
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },
  };

  return r;
}

/* Pick the shared singleton if one already exists on window; otherwise
   build + install our own. Doing this at module load means the FIRST
   content-script bundle to import this file wins, and every subsequent
   import (in any other bundle in the same window) reuses it. */
function _resolveShared() {
  if (typeof window === 'undefined') return _build();
  if (!window.__gbActionRegistry) {
    window.__gbActionRegistry = _build();
  }
  return window.__gbActionRegistry;
}

export const actionRegistry = _resolveShared();

/* Group + filter the registry by current context. The shelf renders
   what this returns.

   - Modal-smart: action.whenModalOpen includes the current top modal.
     These go in their own section (header derived from the modal's
     label) so the user immediately sees the modal-specific options.
   - Page-smart:  action.smartFor includes the current page. Under
     the existing "Smart for this page" header.
   - Everything else: "Page actions" (default category) or "Danger".

   Modal match wins over page match so an action eligible for both
   doesn't double-list. */
function getContextualActions() {
  const all = actionRegistry.getActions();
  const page = actionRegistry.getPage();
  const topModal = actionRegistry.getTopModal();

  const modalSmart = [];
  const pageSmart  = [];
  const pageActions = [];
  const danger     = [];

  for (const a of all) {
    if (a.category === 'danger' || a.tone === 'danger') {
      danger.push(a);
      continue;
    }
    const matchesModal = a.whenModalOpen && topModal && a.whenModalOpen.includes(topModal);
    const matchesPage  = a.smartFor && a.smartFor.includes(page);
    if (matchesModal)      modalSmart.push(a);
    else if (matchesPage)  pageSmart.push(a);
    else                   pageActions.push(a);
  }
  // Legacy `smart` field = union, for any consumer not yet migrated.
  const smart = [...modalSmart, ...pageSmart];
  return { modalSmart, pageSmart, smart, page: pageActions, danger };
}

/* ── React hook ─────────────────────────────────────────────────
   useSyncExternalStore is the React-blessed way to subscribe to a
   non-React store. We hand it a stable subscribe fn and a getSnapshot
   that returns a primitive (the version counter) — React re-renders
   the calling component whenever notify() bumps the counter.
─────────────────────────────────────────────────────────────── */
function subscribe(cb) {
  return actionRegistry.subscribe(cb);
}
function getSnapshot() {
  return actionRegistry._state.version;
}

export function useActionRegistry() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    actions: getContextualActions(),
    page: actionRegistry.getPage(),
    pageLabel: actionRegistry.getPageLabel(),
    pageSubLabel: actionRegistry.getPageSubLabel(),
    modalStack: actionRegistry.getModalStack(),
    topModal: actionRegistry.getTopModal(),
    topModalLabel: actionRegistry.getTopModalLabel(),
  };
}

/* ── Single-visible-modal coordination ──────────────────────────
   Modals call useModalTopState on mount with their id + display
   label. The hook pushes them onto the shared modal stack, listens
   for stack changes, and returns `true` only while THIS modal is
   the topmost — i.e. the only one that should be visible. Every
   modal in the codebase routes its FloatingPanel `visible` prop
   through this hook, so opening a new modal automatically hides
   whoever was on top, and closing the new one restores them.

   Pattern at the call site:

       const visible = useModalTopState('quick-task', 'Quick Task');
       return <FloatingPanel visible={visible}>...</FloatingPanel>;

   The state is preserved while hidden (FloatingPanel just fades
   out + pointer-events:none) so the user comes back to whatever
   they'd typed / selected. */
export function useModalTopState(id, label) {
  const [isTop, setIsTop] = useState(true);
  useEffect(() => {
    if (!id) return undefined;
    actionRegistry.pushModal(id, label);
    const compute = () => setIsTop(actionRegistry.getTopModal() === id);
    compute();
    const unsub = actionRegistry.subscribe(compute);
    return () => {
      unsub();
      actionRegistry.popModal(id);
    };
  }, [id, label]);
  return isTop;
}
