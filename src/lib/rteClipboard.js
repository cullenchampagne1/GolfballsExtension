/* ───────────────────────────────────────────────────────────────
   rteClipboard.js — clipboard serialization helpers for the rich-text
   email template editor. Kept out of the JSX component so the copy /
   paste behavior (variable chips → {{var}}, bullet lists → "- ") is
   unit-testable with jsdom.
─────────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* Escape plain text and turn newlines into <br> so a plain-text paste keeps
   its line breaks when re-inserted as HTML. {{ }} survive (not escaped) so a
   later highlightVars pass can turn them into chips. */
export function plainToHtml(text) {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');
}

/** Remove indentation-only root nodes from rich clipboard HTML. Under the
 * editor's former `white-space:pre-wrap` those source-code newlines painted as
 * extra visual lines around a pasted list. Orphaned list items are grouped so
 * copying only the bullets (without prose above/below) remains a real list. */
export function normalizePastedFragment(html) {
  if (typeof document === 'undefined') return String(html || '');
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === 3 && !node.textContent.trim()) node.remove();
  }
  let list = null;
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === 1 && node.tagName === 'LI') {
      if (!list) {
        list = document.createElement('ul');
        node.before(list);
      }
      list.appendChild(node);
    } else if (!(node.nodeType === 3 && !node.textContent.trim())) {
      list = null;
    }
  }
  return template.innerHTML;
}

const imageWidth = (image) => {
  const attr = Number.parseFloat(image.getAttribute('width') || '');
  const css = Number.parseFloat(image.style?.width || '');
  return Math.max(24, Math.min(600, Math.round(attr || css || 320)));
};

/** A resized editor image is a standalone email block. Pin its horizontal
 * margins instead of inheriting paragraph alignment from the insertion caret;
 * that inheritance made the same saved image center or drift right in Outlook.
 * Keep any deliberate vertical spacing from the pasted source. */
function anchorResizedImageLeft(image) {
  const marginTop = image.style?.marginTop || '';
  const marginBottom = image.style?.marginBottom || '';
  image.removeAttribute('align');
  image.setAttribute('data-gb-resized-image', 'true');
  image.style.removeProperty('margin');
  if (marginTop) image.style.marginTop = marginTop;
  if (marginBottom) image.style.marginBottom = marginBottom;
  image.style.marginLeft = '0';
  image.style.marginRight = 'auto';
  image.style.display = 'block';
}

/** Add editor-only resize chrome around ordinary pasted images. */
export function decorateEditorImages(html) {
  if (typeof document === 'undefined') return String(html || '');
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  for (const image of Array.from(template.content.querySelectorAll('img'))) {
    if (image.closest('.gb-rte-image')) continue;
    const width = imageWidth(image);
    const wrapper = document.createElement('span');
    wrapper.className = 'gb-rte-image';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.style.cssText = `display:block;position:relative;width:${width}px;max-width:100%;margin-left:0;margin-right:auto`;
    image.setAttribute('width', String(width));
    image.style.width = `${width}px`;
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    anchorResizedImageLeft(image);
    image.replaceWith(wrapper);
    wrapper.appendChild(image);
    const handle = document.createElement('span');
    handle.className = 'gb-rte-image-resize';
    handle.title = 'Drag to resize';
    wrapper.appendChild(handle);
  }
  return template.innerHTML;
}

/** Remove editor-only image handles while retaining the selected dimensions. */
export function stripEditorDecorations(html) {
  if (typeof document === 'undefined') return String(html || '');
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  for (const wrapper of Array.from(template.content.querySelectorAll('.gb-rte-image'))) {
    const image = wrapper.querySelector('img');
    if (image) {
      anchorResizedImageLeft(image);
      wrapper.replaceWith(image);
    }
    else wrapper.remove();
  }
  template.content.querySelectorAll('.gb-rte-image-resize').forEach((node) => node.remove());
  return template.innerHTML;
}

/* Serialize an editor fragment (a DOM node) to clean plain text for the
   clipboard: variable chips become their {{name}} placeholder, list items get
   a "- " marker (so bullets don't paste as run-together lines), and block
   elements break the line. This is what makes copy/paste of variables and
   bullets sane when the target is a plain-text field or another app. */
export function fragToPlain(root) {
  let out = '';
  const walk = (node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.textContent; return; }   // text
      if (n.nodeType !== 1) return;                             // elements only
      if (n.classList && n.classList.contains('gb-rte-chip')) {
        const nameEl = n.querySelector('.gb-rte-chip-name');
        out += (nameEl || n).textContent || '';
        return;
      }
      const tag = n.tagName;
      if (tag === 'BR') { out += '\n'; return; }
      if (tag === 'LI') { out += '- '; walk(n); out += '\n'; return; }
      walk(n);
      if (/^(P|DIV|UL|OL|TR|H[1-6]|BLOCKQUOTE|PRE)$/.test(tag)) out += '\n';
    });
  };
  walk(root);
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}
