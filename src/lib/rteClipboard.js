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
