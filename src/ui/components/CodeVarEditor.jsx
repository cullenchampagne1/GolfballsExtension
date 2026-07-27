import React, { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { linter, lintGutter, forceLinting } from '@codemirror/lint';
import {
  syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, syntaxTree,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import { contactSchema } from '../../lib/page-schemas/contact.js';
import { listPaths } from '../../lib/page-engine/resolve.js';
import { describeHelpers, staticCheck } from '../../lib/page-engine/code-runtime.js';
import { lintTemplateRefs } from '../../lib/codeEngine/templateLint.js';
import { APPROVED_CONTACT_FIELDS } from '../../lib/codeEngine/contracts.js';

const APPROVED_FIELD_NAMES = Object.keys(APPROVED_CONTACT_FIELDS);
import { Btn } from './Btn.jsx';
import { Tag } from './Tag.jsx';
import { Spinner } from '../shared.jsx';
import { I, Icon } from '../icons.jsx';
import { CODE_RECIPES } from '../../lib/codeRecipes.js';

/* ───────────────────────────────────────────────────────────────
   CodeVarEditor — CodeMirror 6 authoring surface for `code`
   variables.

   A code variable's body runs with three bindings (see
   page-engine/code-runtime.js):
     ctx    the page's extracted JSON ("json block")
     vars   variables resolved before this one
     h      helpers — h.fmt.*, h.coalesce, and the async server
            read-only helpers h.fetchText / h.fetchJson / h.catalog
   and must return a value that's coerced to a string for the email.

   Surface:
     • JS syntax highlight + bracket matching + history.
     • Autocomplete for the three namespaces — ctx.<schema paths>,
       vars.<other variable names>, h.<helpers>.
     • Inline lint: compiles the body (sync OR async per its use of
       await/h.server) and surfaces compile/blocklist errors.
     • "Test on page" — runs the body against the live order tab via
       window.__gbResolveVars and shows the rendered result.

   Props:
     value     string  — the code body
     onChange  (body) => void
     typeId    'order'|'case'|'account' — gates ctx.* completions
               (only account/contact pages have a schema today)
     varNames  string[] — other variables in the template (vars.*)
     placeholder string
─────────────────────────────────────────────────────────────── */

const CodeIcon = (p) => <Icon {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></Icon>;

/* ctx.* options come from the unified contact/account schema — the
   same tree the VariableSchemaPicker shows. Built once. */
const CTX_OPTIONS = (() => {
  try {
    return listPaths(contactSchema, {}).map((n) => ({
      label: 'ctx.' + n.path,
      type: n.type === 'object' || n.type === 'array' ? 'class' : 'property',
      detail: n.type,
    }));
  } catch { return []; }
})();

const HELPERS_DESC = describeHelpers();
const HELPER_OPTIONS = Object.keys(HELPERS_DESC).map((k) => ({
  label: k, type: 'function', detail: HELPERS_DESC[k].signature,
}));

/* A body is async when it awaits or calls one of the async server
   helpers — drives both the compile path (AsyncFunction) and the
   resolver's `async` flag. */
export function isAsyncBody(s) {
  return /\bawait\b/.test(s || '') || /\bh\.(send|fetchText|fetchJson)\b/.test(s || '');
}

const GB_HIGHLIGHT = HighlightStyle.define([
  { tag: t.keyword,                       color: 'var(--gb-brand-label)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--gb-success-fg)' },
  { tag: [t.number, t.bool, t.null],      color: 'var(--gb-info-fg)' },
  { tag: t.propertyName,                  color: 'var(--gb-text-primary)' },
  { tag: t.variableName,                  color: 'var(--gb-text-secondary)' },
  { tag: t.comment,                       color: 'var(--gb-text-muted)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--gb-warning-fg)' },
  { tag: t.operator,                      color: 'var(--gb-text-tertiary)' },
]);

const GB_THEME = EditorView.theme({
  '&': {
    fontSize: '11.5px',
    backgroundColor: 'var(--gb-surface-2)',
    color: 'var(--gb-text-primary)',
    border: '1px solid var(--gb-border-default)',
    borderRadius: 'var(--gb-r-sm)',
    /* Height (maxHeight cap OR fill) is set per-instance below so `fill`
       is authoritative — no cross-theme override race. */
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--gb-brand-tint-border)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': {
    fontFamily: 'var(--gb-font-mono)',
    /* ~3 lines of bottom padding keep room below the last line so the
       autocomplete dropdown always has space to open downward. */
    padding: '8px 0 52px',
    caretColor: 'var(--gb-brand-label)',
    minHeight: '128px',
  },
  '.cm-line': { padding: '0 8px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--gb-text-ghost)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 8px', minWidth: '18px' },
  '.cm-activeLine': { backgroundColor: 'var(--gb-fill-faint)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--gb-text-muted)' },
  '.cm-cursor': { borderLeftColor: 'var(--gb-brand-label)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--gb-brand-tint-soft)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--gb-surface-1)',
    border: '1px solid var(--gb-border-default)',
    borderRadius: 'var(--gb-r-sm)',
    color: 'var(--gb-text-secondary)',
    fontFamily: 'var(--gb-font-mono)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': { maxWidth: '300px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--gb-font-mono)', fontSize: '10.5px', maxHeight: '112px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '1px 7px', lineHeight: '1.45' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--gb-brand-tint-medium)',
    color: 'var(--gb-brand-label)',
  },
  '.cm-completionDetail': {
    color: 'var(--gb-text-muted)', fontStyle: 'normal', marginLeft: '8px',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy var(--gb-error-fg)' },
}, { dark: true });

/* Height is authoritative per-instance: `fill` stretches the editor to its
   flex container (no cap); otherwise it grows to ~22 lines then scrolls. */
const heightTheme = (fill) => EditorView.theme(fill
  ? {
    '&': { height: '100%', maxHeight: 'none' },
    '.cm-scroller': { overflow: 'auto', flex: '1 1 auto' },
    '.cm-content': { paddingBottom: '16px', minHeight: '100%' },
  }
  : { '&': { maxHeight: '360px' } });

/* The identifier chain under the cursor (e.g. "actions.sendEmail"), for the
   live docs panel. Expands over word + dot chars around the caret. */
function tokenAt(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const col = pos - line.from;
  const isIdent = (ch) => ch && /[\w$.]/.test(ch);
  let start = col; let end = col;
  while (start > 0 && isIdent(text[start - 1])) start -= 1;
  while (end < text.length && isIdent(text[end])) end += 1;
  return text.slice(start, end).replace(/^\.+|\.+$/g, '');
}

/* Completions for the campaign-code bindings — page / user / actions. */
const BINDING_OPTIONS = {
  actions: [
    { label: 'actions.sendEmail', type: 'function', detail: '(email) — saved or {subject,body}' },
    { label: 'actions.createTask', type: 'function', detail: '(task) — saved or {subject,…}' },
    { label: 'actions.completeTask', type: 'function', detail: '({id}) — complete an existing or newly created task' },
    { label: 'actions.logCall', type: 'function', detail: '(call) — saved or {subject,…}' },
    { label: 'actions.addNote', type: 'function', detail: '({subject,body}) — CRM activity note' },
  ],
  user: [
    { label: 'user.emails', type: 'variable', detail: 'saved emails []' },
    { label: 'user.tasks', type: 'variable', detail: 'saved tasks []' },
    { label: 'user.calls', type: 'variable', detail: 'saved calls []' },
    { label: 'user.email', type: 'function', detail: '(name) → saved email (throws if missing)' },
    { label: 'user.task', type: 'function', detail: '(name) → saved task' },
    { label: 'user.call', type: 'function', detail: '(name) → saved call' },
  ],
  page: [
    { label: 'page.contact', type: 'variable', detail: 'the contact being run (read + edit)' },
    { label: 'page.contacts', type: 'variable', detail: 'the audience []' },
    { label: 'page.count', type: 'variable', detail: 'audience size' },
    { label: 'page.account', type: 'variable', detail: 'hydrated account fields' },
    { label: 'page.orders', type: 'variable', detail: 'order history [] — number, summary, date, revenue, status' },
    { label: 'page.items', type: 'variable', detail: 'aggregate ordered items []' },
    { label: 'page.relatedContacts', type: 'variable', detail: 'contacts listed on this account []' },
    { label: 'page.tasks', type: 'variable', detail: 'open/done CRM tasks — .open[i].complete()' },
    { label: 'page.evaluate', type: 'function', detail: '(ref) → outbound — renders a saved template (a step)' },
  ],
};

export function CodeVarEditor({ value, onChange, typeId, varNames = [], placeholder, hideActions = false, fill = false, onContext, bindings = null }) {
  const hostRef    = useRef(null);
  const viewRef    = useRef(null);
  const onChangeRef = useRef(onChange);
  const onContextRef = useRef(onContext);
  onContextRef.current = onContext;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const valueRef   = useRef(value || '');
  const ctxOptsRef = useRef(typeId === 'account' ? CTX_OPTIONS : []);
  const varNamesRef = useRef(varNames);

  onChangeRef.current = onChange;
  ctxOptsRef.current  = typeId === 'account' ? CTX_OPTIONS : [];
  varNamesRef.current = varNames;

  const [testing, setTesting] = useState(false);
  const [result,  setResult]  = useState(null); // { value } | { error }
  const [recipesOpen, setRecipesOpen] = useState(false);

  // Mount the editor once. Completion + lint read from refs so the
  // view never has to be rebuilt when varNames / typeId change.
  useEffect(() => {
    if (!hostRef.current) return undefined;

    const completionSource = (context) => {
      // Inside user.email("… / user.task("… / user.call("…  → the saved names.
      const line = context.state.doc.lineAt(context.pos);
      const upto = line.text.slice(0, context.pos - line.from);
      const nameCall = upto.match(/\buser\.(email|task|call)\(\s*["']([^"']*)$/);
      if (nameCall) {
        const b = bindingsRef.current || {};
        const list = nameCall[1] === 'email' ? b.emails : nameCall[1] === 'task' ? b.tasks : b.calls;
        const opts = (list || []).map((n) => ({ label: n, type: 'text', detail: `saved ${nameCall[1]}` }));
        if (!opts.length) return null;
        return { from: context.pos - nameCall[2].length, options: opts, validFor: /[^"']*/ };
      }

      const before = context.matchBefore(/[\w$.[\]'"-]*/);
      if (!before || (before.from === before.to && !context.explicit)) return null;
      // user.emails.<Id> / user.tasks.<Id> / user.calls.<Id> → the code ids.
      // page.contact.<field> → editable fields · page.tasks.<method>.
      const pageMember = before.text.match(/^page\.(contact|tasks)\.[\w$]*$/);
      if (pageMember) {
        const opts = pageMember[1] === 'contact'
          ? APPROVED_FIELD_NAMES.map((f) => ({ label: `page.contact.${f}`, type: 'property', detail: 'editable field' }))
          : [
            { label: 'page.tasks.open', type: 'variable', detail: 'open tasks []' },
            { label: 'page.tasks.done', type: 'variable', detail: 'completed tasks []' },
            { label: 'page.tasks.completeAll', type: 'function', detail: 'complete every open task' },
            { label: 'page.tasks.completeLatest', type: 'function', detail: 'complete the latest' },
          ];
        return { from: before.from, options: opts, validFor: /^[\w$.]*$/ };
      }
      const keyed = before.text.match(/^user\.(emails|tasks|calls)\.[\w$]*$/);
      if (keyed) {
        const b = bindingsRef.current || {};
        const ids = keyed[1] === 'emails' ? b.emailIds : keyed[1] === 'tasks' ? b.taskIds : b.callIds;
        const opts = (ids || []).map((id) => ({ label: `user.${keyed[1]}.${id}`, type: 'variable', detail: `saved ${keyed[1].slice(0, -1)}` }));
        if (opts.length) return { from: before.from, options: opts, validFor: /^[\w$.]*$/ };
      }
      const head = before.text.split(/[.[]/)[0];
      let options = null;
      if (head === 'ctx')       options = ctxOptsRef.current;
      else if (head === 'vars') options = varNamesRef.current.map((n) => ({ label: 'vars.' + n, type: 'variable' }));
      else if (head === 'h')    options = HELPER_OPTIONS;
      else if (BINDING_OPTIONS[head]) options = BINDING_OPTIONS[head];
      if (!options || options.length === 0) return null;
      return { from: before.from, options, validFor: /^[\w$.[\]'"-]*$/ };
    };

    const cmLinter = (view) => {
      const body = view.state.doc.toString();
      if (!body.trim()) return [];
      const diags = [];
      // Syntax errors from the Lezer parse tree — no eval, so it's safe
      // on extension pages (new Function is blocked under MV3 CSP).
      syntaxTree(view.state).cursor().iterate((node) => {
        if (node.type.isError) {
          const to = node.to > node.from ? node.to : Math.min(view.state.doc.length, node.from + 1);
          diags.push({ from: node.from, to, severity: 'error', message: 'Syntax error' });
        }
      });
      // Length + blocklist (regex, CSP-safe).
      const issue = staticCheck(body);
      if (issue) diags.push({ from: 0, to: Math.max(1, body.length), severity: 'error', message: issue });
      // Missing saved-template dependencies — user.email("X") where X isn't saved.
      for (const r of lintTemplateRefs(body, bindingsRef.current)) {
        diags.push({ from: r.from, to: r.to, severity: 'error', message: r.message });
      }
      return diags;
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          closeBrackets(),
          indentOnInput(),
          highlightActiveLine(),
          javascript(),
          heightTheme(fill),
          syntaxHighlighting(GB_HIGHLIGHT, { fallback: true }),
          /* Default (in-editor, absolute) tooltip positioning. The editor
             lives under <body data-gb-scale="editor"> (a CSS zoom/scale),
             so position:fixed or a document.body portal lands in the wrong
             coordinate space and the dropdown disappears. Staying in-editor
             keeps it in the same scaled space; we just make sure nothing
             clips it (see GB_THEME — no overflow:hidden on the editor). */
          autocompletion({ override: [completionSource], icons: true, activateOnTyping: true }),
          linter(cmLinter, { delay: 300 }),
          lintGutter(),
          cmPlaceholder(placeholder || 'e.g. h.fmt.title(ctx.contact.firstName)'),
          EditorView.lineWrapping,
          GB_THEME,
          keymap.of([
            indentWithTab,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const next = u.state.doc.toString();
              valueRef.current = next;
              onChangeRef.current?.(next);
            }
            // Report the token under the caret so the docs panel can follow along.
            if ((u.docChanged || u.selectionSet) && onContextRef.current) {
              onContextRef.current(tokenAt(u.state));
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run the linter when the saved-template bindings load/change, so a
  // missing-dependency error appears without needing an edit first.
  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [bindings]);

  // External value sync — e.g. parent reset on a kind switch. Only
  // dispatch when the incoming value actually differs from the live
  // doc so we don't fight the updateListener.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if ((value || '') !== current) {
      valueRef.current = value || '';
      view.dispatch({ changes: { from: 0, to: current.length, insert: value || '' } });
    }
  }, [value]);

  const runTest = () => {
    const body = valueRef.current;
    if (!body.trim()) return;
    if (typeof window.__gbResolveVars !== 'function') {
      setResult({ error: 'Open the editor from an order tab to test against a live page.' });
      return;
    }
    setTesting(true);
    setResult(null);
    Promise.resolve(window.__gbResolveVars({ __preview: { type: 'code', body, async: isAsyncBody(body) } }))
      .then((res) => {
        const v = res?.resolved?.__preview;
        if (typeof v === 'string' && v.startsWith('<code-var error:')) {
          setResult({ error: v.replace(/^<code-var error:\s*/, '').replace(/>$/, '') });
        } else {
          setResult({ value: v == null ? '' : String(v) });
        }
      })
      .catch((e) => setResult({ error: String(e?.message || e) }))
      .finally(() => setTesting(false));
  };

  return (
    <div style={fill
      ? { display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }
      : { display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={hostRef} style={fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined} />

      {/* Namespace legend + test action — hidden when actions are hidden
          (e.g. the campaign code editor, which has its own bindings/docs). */}
      {!hideActions && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <NsChip label="ctx" hint={typeId === 'account' ? 'page json' : 'empty here'} dim={typeId !== 'account'} />
          <NsChip label="vars" hint="other vars" />
          <NsChip label="h" hint="helpers" />
          {!hideActions && <span style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)' }}>· returns coerced to text</span>}
        </span>
        <div style={{ flex: 1 }} />
        {!hideActions && (
        <div style={{ position: 'relative' }}>
          <Btn size="xs" variant="ghost" icon={<I.bolt />} onClick={() => setRecipesOpen((o) => !o)}>
            Recipes
          </Btn>
          {recipesOpen && (
            <>
              {/* Full-screen click-away. */}
              <div onClick={() => setRecipesOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
              {/* Opens upward (bottom:100%) so a long menu doesn't hit the
                  form's bottom overflow:hidden. In-flow within the scaled
                  page, so it positions correctly. */}
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, width: 250, zIndex: 6,
                background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
                borderRadius: 'var(--gb-r-md)', boxShadow: '0 8px 24px rgba(0,0,0,.32)', overflow: 'hidden',
              }}>
                <div style={{ padding: '6px 10px', fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', background: 'var(--gb-surface-2)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
                  Insert recipe
                </div>
                {CODE_RECIPES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { onChange?.(r.body); setRecipesOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                      background: 'transparent', border: 'none', borderBottom: '1px solid var(--gb-border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 2, lineHeight: 1.4 }}>{r.description}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        )}
        {!hideActions && (
        <Btn
          size="xs"
          variant="tinted"
          icon={testing ? <Spinner size={10} /> : <CodeIcon />}
          disabled={testing}
          onClick={runTest}
        >
          {testing ? 'Running…' : 'Test on page'}
        </Btn>
        )}
      </div>
      )}

      {/* Test result */}
      {result && (
        <div style={{
          padding: '7px 10px',
          borderRadius: 'var(--gb-r-sm)',
          border: '1px solid ' + (result.error ? 'var(--gb-error-tint-border, var(--gb-border-default))' : 'var(--gb-brand-tint-border)'),
          background: result.error ? 'var(--gb-error-tint-soft, var(--gb-fill-subtle))' : 'var(--gb-brand-tint-soft)',
          fontSize: 11,
          display: 'flex', alignItems: 'flex-start', gap: 7,
        }}>
          {result.error
            ? <Tag tone="error" size="xs" icon={<I.close />}>ERROR</Tag>
            : <Tag tone="brand" size="xs" icon={<I.check />}>RESULT</Tag>}
          <span style={{
            fontFamily: 'var(--gb-font-mono)', fontSize: 10.5,
            color: result.error ? 'var(--gb-error-fg)' : 'var(--gb-text-primary)',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap', flex: 1,
          }}>
            {result.error || (result.value === '' ? '— empty string —' : result.value)}
          </span>
        </div>
      )}
    </div>
  );
}

function NsChip({ label, hint, dim }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      padding: '1px 6px', borderRadius: 'var(--gb-r-sm)',
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-subtle)',
      opacity: dim ? 0.55 : 1,
    }}>
      <code style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--gb-brand-label)' }}>{label}</code>
      <span style={{ fontSize: 9, color: 'var(--gb-text-muted)' }}>{hint}</span>
    </span>
  );
}
