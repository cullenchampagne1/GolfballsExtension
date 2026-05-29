import React, { useEffect, useRef } from 'react';

/* ───────────────────────────────────────────────────────────────
   EmailHtmlView — renders an opened email's HTML body inside a
   Shadow DOM so the message's own CSS can't leak into (or be
   clobbered by) the extension's styles, and without an <iframe>
   (which would hit cross-origin / session-cookie walls when the
   email references golfballs.com assets).

   Dark-mode normalisation
   ───────────────────────
   The legacy modal rendered the email on a WHITE card with black
   text (literal Outlook look). The user wants it to read like
   dark-mode Outlook instead — and to be visually distinct from
   the dark modal chrome around it ("distinguish the thread from
   the files we're opening"). So:

     • :host paints a dark surface with light text + color-scheme
       dark, so any element WITHOUT an explicit color inherits a
       legible light-on-dark default.
     • A normalise pass rewrites EXPLICIT light backgrounds
       (white / near-white, via bgcolor attr or inline style) to a
       dark surface token, and EXPLICIT dark text (black / near-
       black) to a light grey — so hand-styled marketing emails
       don't render as black-on-black or blinding white blocks.
     • Images, brand colors, and mid-tones are left untouched.

   The host gets a slightly lifted surface + inset border so the
   email body reads as a separate "document" sitting inside the
   thread column.
─────────────────────────────────────────────────────────────── */

const WHITE_BG = /^(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,?\s*1?\s*\))$/i;
/* Near-white catch for the common marketing-email canvas colors
   (#fafafa, #f5f5f5, #eeeeee, etc.) — light enough that dark text
   on them would otherwise be the only legible combo. */
const NEAR_WHITE = /^#(f[0-9a-f]|e[0-9a-f])[0-9a-f]{4}$/i;
const DARK_TXT = /^(#000000|#000|#111111|#111|#222222|#222|#333333|#333|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,?\s*1?\s*\))$/i;

const DARK_SURFACE = '#1e2024';   // matches the surface-1 family
const LIGHT_TEXT   = '#d6d8dc';

function isLightBg(v) {
  if (!v) return false;
  const s = v.trim();
  return WHITE_BG.test(s) || NEAR_WHITE.test(s);
}

function normaliseEmailDom(container) {
  container.querySelectorAll('*').forEach((el) => {
    // bgcolor attribute (table-based emails lean on this heavily)
    const bgAttr = el.getAttribute && el.getAttribute('bgcolor');
    if (bgAttr && isLightBg(bgAttr)) el.setAttribute('bgcolor', DARK_SURFACE);

    if (el.style) {
      if (isLightBg(el.style.backgroundColor)) el.style.backgroundColor = DARK_SURFACE;
      if (isLightBg(el.style.background)) el.style.background = DARK_SURFACE;
      if (el.style.color && DARK_TXT.test(el.style.color.trim())) el.style.color = LIGHT_TEXT;
    }

    const colorAttr = el.getAttribute && el.getAttribute('color');
    if (colorAttr && DARK_TXT.test(colorAttr.trim())) el.setAttribute('color', LIGHT_TEXT);
  });
}

export function EmailHtmlView({ html, style }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    /* base href keeps relative links/images resolving against the
       mail host; color-scheme:dark hands the email's own form
       controls + default colors a dark baseline. */
    shadow.innerHTML = `
      <base href="https://api.golfballs.com">
      <style>
        :host {
          display: block;
          color-scheme: dark;
          padding: 20px 22px;
          background: var(--gb-surface-1, ${DARK_SURFACE});
          color: var(--gb-text-secondary, ${LIGHT_TEXT});
          font-family: Calibri, 'Segoe UI', Arial, sans-serif;
          font-size: 13px;
          line-height: 1.6;
        }
        #gb-email-content { max-width: 100%; }
        #gb-email-content * { max-width: 100%; box-sizing: border-box; }
        #gb-email-content a { color: var(--gb-brand-label, #8fce2e); }
        #gb-email-content img { height: auto; }
        #gb-email-content table { max-width: 100% !important; }
      </style>
      <div id="gb-email-content">${html || ''}</div>
    `;
    const content = shadow.querySelector('#gb-email-content');
    if (content) normaliseEmailDom(content);
  }, [html]);

  return (
    <div style={{
      borderRadius: 'var(--gb-r-md)',
      border: '1px solid var(--gb-border-default)',
      background: 'var(--gb-surface-1)',
      overflow: 'auto',
      ...style,
    }}>
      <div ref={hostRef} />
    </div>
  );
}
