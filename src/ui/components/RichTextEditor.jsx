import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Icon } from '../icons.jsx';

/* ──────────────────────────────────────────────────────────────
   RichTextEditor — contenteditable rich-text surface with a
   functional toolbar (execCommand based) and {{variable}} chips.

   Powers both the email-template body and the email signature.

   Props:
     initialHtml  string  — content to load once on mount
     onChange     (html)  — emits stored-format HTML (chips → {{var}})
     variables    [{name}]— available variables for the insert menu
     singleLine   bool    — one-line mode: no toolbar, Enter disabled,
                            emits plain text (for the subject field)
     size         'sm'|'md' — overall density. 'sm' = compact toolbar,
                            tighter padding, smaller text. Default 'md'.
     minHeight    number  — body min-height override (full mode); when
                            omitted, falls back to the size's default
     placeholder  string
─────────────────────────────────────────────────────────────── */

/* ── Density presets — every size-dependent measurement lives here so
      'sm' and 'md' stay in lockstep. ──────────────────────────── */
const SIZES = {
  sm: {
    btnW: 22, btnH: 21, icon: 11, sepH: 13, toolbarPad: '3px 5px',
    pad: '10px 12px', font: 10.5, minHeight: 120,
    slPad: '6px 9px', slFont: 11,
    varH: 21, varFont: 10, varIcon: 9,
    phFull: { top: 10, left: 13, font: 10.5 },
    phLine: { top: 6,  left: 10, font: 11 },
  },
  md: {
    btnW: 26, btnH: 24, icon: 12, sepH: 14, toolbarPad: '4px 6px',
    pad: '14px', font: 11.5, minHeight: 160,
    slPad: '7px 10px', slFont: 12,
    varH: 24, varFont: 10.5, varIcon: 10,
    phFull: { top: 14, left: 14, font: 11.5 },
    phLine: { top: 7,  left: 10, font: 12 },
  },
};

/* ── Toolbar icons ──────────────────────────────────────────── */
const Ic = {
  bold:      p => <Icon {...p}><path d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z"/></Icon>,
  italic:    p => <Icon {...p}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></Icon>,
  underline: p => <Icon {...p}><path d="M6 3v7a6 6 0 0012 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></Icon>,
  strike:    p => <Icon {...p}><path d="M16 4H9a3 3 0 00-2.83 4M14 12a4 4 0 010 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></Icon>,
  ul:        p => <Icon {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>,
  ol:        p => <Icon {...p}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></Icon>,
  link:      p => <Icon {...p}><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></Icon>,
  alignL:    p => <Icon {...p}><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></Icon>,
  alignC:    p => <Icon {...p}><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></Icon>,
  alignR:    p => <Icon {...p}><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></Icon>,
  bolt:      p => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  clear:     p => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13"/></Icon>,
};

/* ── Injected stylesheet (chips, placeholder, content defaults) ── */
const STYLE_ID = '__gb-rte-style';
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .gb-rte-content { outline: none; }
    .gb-rte-content p { margin: 0 0 8px; }
    .gb-rte-content p:last-child { margin-bottom: 0; }
    .gb-rte-content a { color: var(--gb-brand-label); }
    .gb-rte-content ul, .gb-rte-content ol { margin: 0 0 8px; padding-left: 22px; }
    /* Matches the design-spec Chip (components-reference.jsx:219 / Chip.jsx):
       clean inline pill, weight 500, no bolt/divider. Click still opens the
       smart-options submenu via onChipClick. */
    .gb-rte-chip {
      display: inline-flex; align-items: center;
      padding: 3px 8px; margin: 0 1px;
      border-radius: var(--gb-r-sm);
      background: var(--gb-brand-tint-soft);
      border: 1px solid var(--gb-brand-tint-border);
      color: var(--gb-brand-label);
      font-family: var(--gb-font-mono); font-size: 0.9em; font-weight: 500;
      line-height: 1.4; vertical-align: baseline;
      white-space: nowrap; user-select: all; cursor: pointer;
    }
    .gb-rte-chip:hover { background: var(--gb-brand-tint-medium); }
    .gb-rte-ph {
      position: absolute; pointer-events: none;
      color: var(--gb-text-ghost);
    }`;
  (document.head || document.documentElement).appendChild(el);
}

/* ── {{var}} ↔ chip conversion ─────────────────────────────────── */
function chipHTML(name) {
  return `<span class="gb-rte-chip" contenteditable="false">{{${name}}}</span>`;
}
function highlightVars(html) {
  return String(html || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, n) => chipHTML(n.trim()));
}
function stripChips(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  tmp.querySelectorAll('.gb-rte-chip').forEach(s => {
    s.replaceWith(document.createTextNode(s.textContent || ''));
  });
  return tmp.innerHTML;
}

/* Plain text / newline body → HTML paragraphs (legacy templates). */
function normalizeInitial(html) {
  const s = String(html || '');
  if (s && !s.includes('<')) {
    return s.split('\n').map(l => (l.trim() ? `<p>${l}</p>` : '<p><br></p>')).join('');
  }
  return s;
}

/* ── Toolbar primitives ─────────────────────────────────────── */
function TBtn({ icon, active, onMouseDown, title, sz }) {
  return (
    <button
      type="button" title={title} onMouseDown={onMouseDown}
      style={{
        width: sz.btnW, height: sz.btnH, borderRadius: 4, border: 'none', cursor: 'pointer',
        background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
        color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {React.cloneElement(icon, { size: sz.icon })}
    </button>
  );
}
const Sep = ({ sz }) => (
  <div style={{ width: 1, height: sz.sepH, background: 'var(--gb-border-subtle)', margin: '0 3px' }} />
);

export function RichTextEditor({
  initialHtml, onChange, onChipClick, variables = [], singleLine = false,
  size = 'md', minHeight, placeholder = '',
}) {
  const sz       = SIZES[size] || SIZES.md;
  const bodyMinH = minHeight != null ? minHeight : sz.minHeight;

  const ref        = useRef(null);
  const savedRange = useRef(null);
  const [marks,   setMarks]   = useState({});
  const [empty,   setEmpty]   = useState(true);
  const [varMenu, setVarMenu] = useState(false);

  /* Load content once on mount. */
  useEffect(() => {
    ensureStyle();
    const el = ref.current;
    if (!el) return;
    el.innerHTML = highlightVars(normalizeInitial(initialHtml));
    setEmpty(!el.textContent.trim());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Emit stored-format content to the parent. */
  const emit = useCallback(() => {
    const el = ref.current;
    if (!el || !onChange) return;
    onChange(singleLine ? (el.textContent || '') : stripChips(el.innerHTML));
  }, [onChange, singleLine]);

  const refreshMarks = useCallback(() => {
    if (singleLine) return;
    try {
      setMarks({
        bold:      document.queryCommandState('bold'),
        italic:    document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike:    document.queryCommandState('strikeThrough'),
      });
    } catch { /* queryCommandState can throw without a selection */ }
  }, [singleLine]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current && ref.current.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  function exec(cmd, value) {
    ref.current?.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    try { document.execCommand(cmd, false, value ?? null); } catch { /* noop */ }
    saveSelection();
    refreshMarks();
    setEmpty(!ref.current.textContent.trim());
    emit();
  }

  function insertVariable(name) {
    setVarMenu(false);
    ref.current?.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand('insertHTML', false, chipHTML(name) + ' ');
    saveSelection();
    setEmpty(false);
    emit();
  }

  /* Paste — strip Word/Outlook junk, keep basic formatting. */
  function onPaste(e) {
    e.preventDefault();
    if (singleLine) {
      const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
      document.execCommand('insertText', false, text);
      return;
    }
    let html = e.clipboardData.getData('text/html');
    if (html) {
      html = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<(meta|link)[^>]*>/gi, '')
        .replace(/ (class|lang|style)="[^"]*"/gi, '')
        .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('script,style,object,embed,form,input').forEach(n => n.remove());
      document.execCommand('insertHTML', false, tmp.innerHTML);
    } else {
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    }
  }

  function onKeyDown(e) {
    if (singleLine && e.key === 'Enter') e.preventDefault();
  }

  // Clicking a {{variable}} chip opens its smart-options modal.
  function onClickContent(e) {
    if (!onChipClick) return;
    const chip = e.target?.closest?.('.gb-rte-chip');
    if (!chip) return;
    const name = (chip.textContent || '').replace(/[{}]/g, '').trim();
    if (name) onChipClick(name);
  }

  function onInput() {
    setEmpty(!ref.current.textContent.trim());
    saveSelection();
    refreshMarks();
    emit();
  }

  const md = fn => e => { e.preventDefault(); fn(); };

  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)', overflow: 'visible',
      background: 'var(--gb-surface-canvas)',
    }}>
      {/* ── Toolbar (full mode only) ── */}
      {!singleLine && (
        <div style={{
          position: 'relative',
          padding: sz.toolbarPad,
          background: 'var(--gb-surface-modal)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-md) var(--gb-r-md) 0 0',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
        }}>
          <TBtn sz={sz} icon={<Ic.bold />}      active={marks.bold}      title="Bold"           onMouseDown={md(() => exec('bold'))} />
          <TBtn sz={sz} icon={<Ic.italic />}    active={marks.italic}    title="Italic"         onMouseDown={md(() => exec('italic'))} />
          <TBtn sz={sz} icon={<Ic.underline />} active={marks.underline} title="Underline"      onMouseDown={md(() => exec('underline'))} />
          <TBtn sz={sz} icon={<Ic.strike />}    active={marks.strike}    title="Strikethrough"  onMouseDown={md(() => exec('strikeThrough'))} />
          <Sep sz={sz} />
          <TBtn sz={sz} icon={<Ic.alignL />} title="Align left"   onMouseDown={md(() => exec('justifyLeft'))} />
          <TBtn sz={sz} icon={<Ic.alignC />} title="Align center" onMouseDown={md(() => exec('justifyCenter'))} />
          <TBtn sz={sz} icon={<Ic.alignR />} title="Align right"  onMouseDown={md(() => exec('justifyRight'))} />
          <Sep sz={sz} />
          <TBtn sz={sz} icon={<Ic.ul />} title="Bullet list"   onMouseDown={md(() => exec('insertUnorderedList'))} />
          <TBtn sz={sz} icon={<Ic.ol />} title="Numbered list" onMouseDown={md(() => exec('insertOrderedList'))} />
          <TBtn sz={sz} icon={<Ic.link />} title="Insert link"  onMouseDown={md(() => {
            const url = window.prompt('Link URL:', 'https://');
            if (url) exec('createLink', url);
          })} />
          <Sep sz={sz} />
          <label title="Text color" style={{
            width: sz.btnW, height: sz.btnH, borderRadius: 4, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gb-text-tertiary)', position: 'relative',
          }}>
            <span style={{ fontSize: 11, fontWeight: 800 }}>A</span>
            <span style={{ position: 'absolute', bottom: 3, left: 6, right: 6, height: 3, borderRadius: 1, background: 'currentColor' }} />
            <input
              type="color" defaultValue="#7db82a"
              onMouseDown={saveSelection}
              onInput={e => exec('foreColor', e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </label>
          <TBtn sz={sz} icon={<Ic.clear />} title="Clear formatting" onMouseDown={md(() => exec('removeFormat'))} />

          {variables.length > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); saveSelection(); setVarMenu(v => !v); }}
                style={{
                  height: sz.varH, padding: '0 7px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: varMenu ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
                  color: 'var(--gb-brand-label)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: sz.varFont, fontWeight: 700,
                }}
              >
                <Ic.bolt size={sz.varIcon} /> Variable
              </button>
              {varMenu && (
                <VarMenu variables={variables} onPick={insertVariable} onClose={() => setVarMenu(false)} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Editable surface ── */}
      <div style={{ position: 'relative' }}>
        {empty && placeholder && (
          <span className="gb-rte-ph" style={{
            top:  singleLine ? sz.phLine.top  : sz.phFull.top,
            left: singleLine ? sz.phLine.left : sz.phFull.left,
            fontSize: singleLine ? sz.phLine.font : sz.phFull.font,
          }}>{placeholder}</span>
        )}
        <div
          ref={ref}
          className="gb-rte-content"
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onClick={onClickContent}
          onKeyUp={() => { saveSelection(); refreshMarks(); }}
          onMouseUp={() => { saveSelection(); refreshMarks(); }}
          onBlur={saveSelection}
          style={{
            padding: singleLine ? sz.slPad : sz.pad,
            minHeight: singleLine ? 'auto' : bodyMinH,
            fontSize: singleLine ? sz.slFont : sz.font,
            fontWeight: singleLine ? 600 : 400,
            lineHeight: 1.6,
            color: 'var(--gb-text-primary)',
            fontFamily: 'var(--gb-font-sans)',
            whiteSpace: singleLine ? 'nowrap' : 'pre-wrap',
            overflowX: singleLine ? 'auto' : 'visible',
          }}
        />
      </div>

      {/* ── Inline variable inserter for single-line mode ── */}
      {singleLine && variables.length > 0 && (
        <SingleLineVarBar variables={variables} onPick={insertVariable} onOpen={saveSelection} />
      )}
    </div>
  );
}

/* ── Variable dropdown menu (full-mode toolbar) ─────────────── */
function VarMenu({ variables, onPick, onClose }) {
  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [onClose]);
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 4px)', right: 6, zIndex: 50,
        minWidth: 170, maxHeight: 220, overflowY: 'auto',
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-modal)', padding: 4,
      }}
    >
      {variables.map(v => (
        <button
          key={v.name} type="button"
          onMouseDown={e => { e.preventDefault(); onPick(v.name); }}
          style={{
            width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
            padding: '6px 8px', borderRadius: 5, background: 'transparent',
            color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)',
            fontSize: 11, fontWeight: 600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {`{{${v.name}}}`}
        </button>
      ))}
    </div>
  );
}

/* ── Variable chips row under a single-line field ───────────── */
function SingleLineVarBar({ variables, onPick, onOpen }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4,
      padding: '6px 8px',
      borderTop: '1px solid var(--gb-border-subtle)',
      background: 'var(--gb-surface-modal)',
      borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)',
    }}>
      {variables.map(v => (
        <button
          key={v.name} type="button"
          onMouseDown={e => { e.preventDefault(); onOpen(); onPick(v.name); }}
          style={{
            border: '1px solid var(--gb-brand-tint-border)',
            background: 'var(--gb-brand-tint-soft)',
            color: 'var(--gb-brand-label)',
            borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
            fontFamily: 'var(--gb-font-mono)', fontSize: 10, fontWeight: 600,
          }}
        >
          {`{{${v.name}}}`}
        </button>
      ))}
    </div>
  );
}
