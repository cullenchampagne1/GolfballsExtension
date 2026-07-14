/**
 * Sanitize untrusted email/editor markup before it enters the extension DOM.
 *
 * This is intentionally allowlist-based. It preserves ordinary email layout
 * (tables, typography, links, and images) while removing executable elements,
 * event attributes, active URL schemes, forms, embedded documents, and CSS
 * features that can initiate requests or escape the component boundary.
 */
const ALLOWED_TAGS = new Set([
  'A', 'ABBR', 'ADDRESS', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CENTER', 'CITE',
  'CODE', 'COL', 'COLGROUP', 'DEL', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HR', 'I', 'IMG', 'INS', 'KBD', 'LI', 'OL', 'P', 'PRE', 'Q', 'S',
  'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD',
  'TFOOT', 'TH', 'THEAD', 'TR', 'TT', 'U', 'UL',
]);

const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON',
  'SELECT', 'OPTION', 'TEXTAREA', 'META', 'LINK', 'BASE', 'SVG', 'MATH',
  'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'TEMPLATE', 'NOSCRIPT',
]);

const GLOBAL_ATTRS = new Set([
  'align', 'alt', 'aria-label', 'bgcolor', 'border', 'cellpadding', 'cellspacing',
  'class', 'colspan', 'dir', 'height', 'lang', 'role', 'rowspan', 'scope', 'start',
  'target', 'title', 'valign', 'width',
]);

const STYLE_PROPERTIES = new Set([
  'background', 'background-color', 'border', 'border-bottom', 'border-color',
  'border-left', 'border-radius', 'border-right', 'border-style', 'border-top',
  'border-width', 'color', 'display', 'font', 'font-family', 'font-size',
  'font-style', 'font-weight', 'height', 'letter-spacing', 'line-height', 'margin',
  'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height',
  'max-width', 'min-height', 'min-width', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'table-layout', 'text-align',
  'text-decoration', 'text-indent', 'text-transform', 'vertical-align',
  'white-space', 'width', 'word-break', 'word-spacing', 'overflow-wrap',
]);

function safeUrl(value, attribute) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  if (/^(?:https:|mailto:|tel:|cid:)/i.test(raw)) return raw;
  if (attribute === 'src' && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(raw)) return raw;
  if (/^(?:\/|\.\/|\.\.\/|#)/.test(raw) && !/^\/\//.test(raw)) return raw;
  return '';
}

function safeStyle(value) {
  return String(value || '').split(';').map((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 1) return '';
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const val = declaration.slice(separator + 1).trim();
    if (!STYLE_PROPERTIES.has(property) || !val) return '';
    if (/url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|javascript:|@import/i.test(val)) return '';
    return `${property}:${val}`;
  }).filter(Boolean).join(';');
}

/** Return a safe HTML fragment. Requires a browser DOM (or jsdom in tests). */
export function sanitizeHtml(value) {
  const source = String(value || '');
  if (!source || typeof document === 'undefined') return '';
  const container = document.createElement('template');
  container.innerHTML = source;

  const elements = Array.from(container.content.querySelectorAll('*'));
  for (const element of elements) {
    if (DROP_WITH_CONTENT.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction'
          || name === 'xlink:href' || name === 'contenteditable') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const url = safeUrl(attribute.value, name);
        if (url) element.setAttribute(name, url); else element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'style') {
        const style = safeStyle(attribute.value);
        if (style) element.setAttribute('style', style); else element.removeAttribute('style');
        continue;
      }
      if (!GLOBAL_ATTRS.has(name) && !name.startsWith('data-gb-')) element.removeAttribute(attribute.name);
    }

    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noopener noreferrer');
      if (element.getAttribute('target') === '_blank') element.setAttribute('target', '_blank');
      else element.removeAttribute('target');
    }
    if (element.tagName === 'IMG') {
      element.setAttribute('referrerpolicy', 'no-referrer');
      element.setAttribute('loading', 'lazy');
      element.removeAttribute('srcset');
    }
  }

  return container.innerHTML;
}

export default sanitizeHtml;
