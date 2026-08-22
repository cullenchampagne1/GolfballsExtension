/* ───────────────────────────────────────────────────────────────
   variableResolution.js — shared template-variable helpers.

   The popup (React) and the content script (vanilla) both need to
   resolve template variables and drop sentences containing unresolved
   conditional placeholders. The popup imports from here directly;
   the vanilla content script keeps a parallel copy because it can't
   ESM-import inside a manifest-listed content script. This file is
   the canonical version — keep them in sync.
─────────────────────────────────────────────────────────────── */

/**
 * dropConditional(template, defs, resolved)
 *
 * Strips any block (sentence / line / paragraph, per `def.smart.conditionalScope`)
 * that contains a variable placeholder whose resolved value is empty AND
 * whose definition has `smart.conditional = true`. Used so opt-in conditional
 * vars don't leak `{{name}}` or "Hi ," style fragments into the rendered text.
 *
 * Call BEFORE the final `.replace(/\{\{...\}\}/g, …)` substitution pass.
 *
 * @param {string} template — raw text with {{var}} placeholders
 * @param {Record<string, { smart?: { conditional?: boolean, conditionalScope?: 'sentence'|'line'|'paragraph' } }>} defs
 *        — variable definitions keyed by name
 * @param {Record<string, string>} resolved — resolved values keyed by name
 * @returns {string}
 */
/**
 * renderTemplate(template, resolved, defs?)
 *
 * Substitutes `{{name}}` placeholders against `resolved`. Supports
 * the OR-block syntax `{{var1|var2|var3}}` — the substitution falls
 * through the pipe-separated candidates in order and returns the
 * first non-empty value. When none resolve, the expression renders blank;
 * unresolved editor diagnostics must never leak braces into sent mail.
 *
 * When `defs` is supplied, `dropConditional` runs first so
 * `smart.conditional` placeholders with empty values strip their
 * surrounding sentence / line / paragraph before substitution. The
 * conditional check looks up each candidate name independently —
 * an OR-block is "empty for conditional purposes" only when EVERY
 * candidate resolved empty.
 *
 * @param {string} template — raw text with {{var}} / {{a|b}} placeholders
 * @param {Record<string,string>} resolved — resolved values keyed by name
 * @param {Record<string,object>=} defs — variable definitions (optional)
 * @returns {string}
 */
export function renderTemplate(template, resolved, defs) {
  if (template == null) return '';
  const text = defs ? dropConditional(template, defs, resolved) : String(template);
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (orig, raw) => {
    /* Pipe-separated candidates. Each gets trimmed; empty parts are
       dropped (so `{{|x}}` collapses to `{{x}}` rather than rolling
       a stray empty pick into a no-op match). */
    const names = String(raw).split('|').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return '';
    for (const name of names) {
      const v = resolved?.[name];
      if (v != null && String(v).length > 0) return v;
    }
    return '';
  });
}

const CONDITIONAL_BLOCK = 'p,div,li,td,th,blockquote,h1,h2,h3,h4,h5,h6';

function removeEmptyBlock(block, root) {
  if (block === root) return;
  const meaningful = String(block.textContent || '').replace(/\u00a0/g, ' ').trim()
    || block.querySelector('img,hr,table,ul,ol');
  if (!meaningful) block.remove();
}

function domPoint(segments, offset, end = false) {
  const texts = segments.filter((segment) => segment.node);
  for (const segment of texts) {
    if (offset >= segment.start && offset <= segment.end) {
      return [segment.node, Math.max(0, Math.min(segment.node.data.length, offset - segment.start))];
    }
  }
  const fallback = end ? texts[texts.length - 1] : texts[0];
  return fallback ? [fallback.node, end ? fallback.node.data.length : 0] : null;
}

function removeHtmlScope(root, textNode, tokenStart, tokenLength, scope) {
  const block = textNode.parentElement?.closest(CONDITIONAL_BLOCK) || root;
  if (scope === 'paragraph') {
    if (block === root) block.replaceChildren(); else block.remove();
    return;
  }
  if (scope === 'line') {
    const nodes = Array.from(block.querySelectorAll('*'));
    const priorBreaks = nodes.filter((node) => node.tagName === 'BR'
      && (node.compareDocumentPosition(textNode) & 4));
    const nextBreak = nodes.find((node) => node.tagName === 'BR'
      && (node.compareDocumentPosition(textNode) & 2));
    const range = document.createRange();
    if (priorBreaks.length) range.setStartAfter(priorBreaks[priorBreaks.length - 1]);
    else range.setStart(block, 0);
    if (nextBreak) range.setEndAfter(nextBreak);
    else range.setEnd(block, block.childNodes.length);
    range.deleteContents();
    removeEmptyBlock(block, root);
    return;
  }

  const segments = [];
  let text = '';
  const walker = document.createTreeWalker(block, 0xFFFFFFFF);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 3) {
      const start = text.length;
      text += node.data;
      segments.push({ node, start, end: text.length });
    } else if (node.nodeType === 1 && node.tagName === 'BR') {
      text += '\n';
    } else if (node.nodeType === 1 && node.tagName === 'IMG') {
      text += '\uFFFC';
    }
    node = walker.nextNode();
  }
  const own = segments.find((segment) => segment.node === textNode);
  if (!own) return;
  const absoluteStart = own.start + tokenStart;
  const absoluteEnd = absoluteStart + tokenLength;
  const prior = Math.max(text.lastIndexOf('.', absoluteStart - 1), text.lastIndexOf('!', absoluteStart - 1),
    text.lastIndexOf('?', absoluteStart - 1), text.lastIndexOf('\n', absoluteStart - 1));
  const endings = ['.', '!', '?', '\n'].map((mark) => text.indexOf(mark, absoluteEnd)).filter((at) => at >= 0);
  let start = prior + 1;
  let end = endings.length ? Math.min(...endings) + 1 : text.length;
  while (start < absoluteStart && /\s/.test(text[start])) start += 1;
  while (end < text.length && /[ \t]/.test(text[end])) end += 1;
  const startPoint = domPoint(segments, start);
  const endPoint = domPoint(segments, end, true);
  if (!startPoint || !endPoint) return;
  const range = document.createRange();
  range.setStart(...startPoint);
  range.setEnd(...endPoint);
  range.deleteContents();
  removeEmptyBlock(block, root);
}

function dropConditionalHtml(template, defs, resolved) {
  const root = document.createElement('div');
  root.innerHTML = String(template);
  const tokenRx = /\{\{\s*([^}]+?)\s*\}\}/g;
  let changed = true;
  while (changed) {
    changed = false;
    const walker = document.createTreeWalker(root, 4);
    let node = walker.nextNode();
    while (node) {
      tokenRx.lastIndex = 0;
      const match = tokenRx.exec(node.data);
      if (match) {
        const names = match[1].split('|').map((name) => name.trim()).filter(Boolean);
        const definition = names.map((name) => defs[name]).find((def) => def?.smart?.conditional);
        const hasValue = names.some((name) => resolved?.[name] != null && String(resolved[name]).length > 0);
        if (definition && !hasValue) {
          removeHtmlScope(root, node, match.index, match[0].length, definition.smart.conditionalScope || 'sentence');
          changed = true;
          break;
        }
      }
      node = walker.nextNode();
    }
  }
  return root.innerHTML;
}

export function dropConditional(template, defs, resolved) {
  if (!template || !defs) return template || '';
  if (typeof document !== 'undefined' && /<[a-z][\s\S]*>/i.test(String(template))) {
    return dropConditionalHtml(template, defs, resolved);
  }
  let out = String(template);
  const expressions = Array.from(out.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g), (match) => match[1]);
  for (const expression of new Set(expressions)) {
    const names = String(expression).split('|').map((name) => name.trim()).filter(Boolean);
    const conditionalDef = names.map((name) => defs[name]).find((def) => def?.smart?.conditional);
    if (!conditionalDef) continue;
    const hasValue = names.some((name) => {
      const value = resolved?.[name];
      return value != null && String(value).length > 0;
    });
    if (hasValue) continue;
    const placeholder = names
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*\\|\\s*');
    const smart = conditionalDef.smart;
    const scope = smart.conditionalScope || 'sentence';
    let rx;
    if (scope === 'paragraph') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*(\\n\\n|\\n?$)`, 'g');
    } else if (scope === 'line') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*\\n?`, 'g');
    } else {
      // Sentence: from the prior boundary (.!?¶ start) up to and including
      // the next sentence-ending punctuation. Lookbehind keeps the trailing
      // punctuation of the PREVIOUS sentence intact.
      rx = new RegExp(`(?:^|(?<=[.!?\\n]))\\s*[^.!?\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^.!?\\n]*[.!?]?\\s*`, 'g');
    }
    out = out.replace(rx, '');
  }
  return out;
}
