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

const LIGHT_TEXT = '#eceef2';   // unified light text (dark theme)
const DARK_TEXT  = '#1a1c1f';   // unified dark text  (light theme)

function isLightBg(v) {
  if (!v) return false;
  const s = v.trim();
  return WHITE_BG.test(s) || NEAR_WHITE.test(s);
}

/* Parse a CSS color string to {r,g,b} (0-255) or null. Handles
   #rgb, #rrggbb, rgb()/rgba(), and the few named colors emails
   actually use for text. */
const NAMED = { black: [0, 0, 0], gray: [128, 128, 128], grey: [128, 128, 128], dimgray: [105, 105, 105], dimgrey: [105, 105, 105] };
function parseColor(v) {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2] };
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

function lumChroma(c) {
  return {
    lum: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255, // 0..1
    chroma: Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b),
  };
}

/* WHITE-SHADE TEXT ENGINE. Emails hard-code text colors for a white
   canvas. Saturated/brand colors (links, warnings) are kept, but the
   grayscale runs are remapped so they stay legible on the active theme:
     • DARK theme  — dark / near-black / gray text → light (else it
                     vanishes on the dark surface).
     • LIGHT theme — near-white / very-light gray text → dark (else it
                     vanishes on the light surface).
   Mid-tone grays are left alone (legible either way). Returns the
   replacement color, or null to leave the original untouched. */
function remapTextColor(v, isDark) {
  const c = parseColor(v);
  if (!c) return null;
  const { lum, chroma } = lumChroma(c);
  if (chroma > 40) return null;                       // saturated hue — keep it
  if (isDark) return lum < 0.82 ? LIGHT_TEXT : null;  // darkish → lighten
  return lum > 0.62 ? DARK_TEXT : null;               // whitish → darken
}

/* Normalise the email body for the active theme. White / near-white
   backgrounds blend into the pane (→ transparent shows the current
   surface through); grayscale text is remapped by the white-shade
   engine above (both themes). Saturated colors + images are untouched. */
function normaliseEmailDom(container, isDark) {
  const fix = (v) => remapTextColor(v, isDark);
  container.querySelectorAll('*').forEach((el) => {
    const bgAttr = el.getAttribute && el.getAttribute('bgcolor');
    if (bgAttr && isLightBg(bgAttr)) el.setAttribute('bgcolor', 'transparent');

    if (el.style) {
      if (isLightBg(el.style.backgroundColor)) el.style.backgroundColor = 'transparent';
      if (isLightBg(el.style.background)) el.style.background = 'transparent';
      if (el.style.color) { const next = fix(el.style.color); if (next) el.style.color = next; }
    }

    const colorAttr = el.getAttribute && el.getAttribute('color');
    if (colorAttr) { const next = fix(colorAttr); if (next) el.setAttribute('color', next); }
  });

  /* Outlook sets body color via <style> class rules (p.MsoNormal
     { color:#242424 }) the per-element walk never sees — remap those
     too. The leading boundary keeps us from matching `background-color`. */
  container.querySelectorAll('style').forEach((s) => {
    const css = s.textContent || '';
    const next = css.replace(/(^|[;{\s])(color\s*:\s*)([^;}!]+)/gi, (m, pre, prop, val) => {
      const r = fix(val.trim());
      return r ? `${pre}${prop}${r}` : m;
    });
    if (next !== css) s.textContent = next;
  });
}

/* Does the email's own HTML already inset its content? Marketing /
   templated emails wrap in a padded table layout with their own
   gutters; plain Outlook div/p replies have none. Used to decide
   whether to add our own side padding (so we never double it up). */
function emailProvidesSidePadding(content) {
  const kids = Array.from(content.children).filter((n) => n.nodeType === 1);
  for (const k of kids) {
    if (k.tagName === 'TABLE') return true;
    try {
      const cs = getComputedStyle(k);
      if ((parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.marginLeft) || 0) >= 12) return true;
    } catch { /* ignore */ }
    if (k.querySelector && k.querySelector('table')) return true;
  }
  return false;
}

/* Is the extension theme dark? Decide from the resolved
   --gb-text-primary: a light primary text means a dark surface. */
function themeIsDark() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--gb-text-primary').trim();
    const c = parseColor(v);
    if (c) return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.5;
  } catch { /* ignore */ }
  return true; // default dark
}

export function EmailHtmlView({ html, style }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const isDark = themeIsDark();
    /* base href keeps relative links/images resolving against the
       mail host; color-scheme + surface/text follow the active theme
       (the --gb tokens already re-theme) so the email reads correctly
       in both dark and light. */
    shadow.innerHTML = `
      <base href="https://api.golfballs.com">
      <style>
        :host {
          display: block;
          color-scheme: ${isDark ? 'dark' : 'light'};
          padding: 16px 0;
          background: var(--gb-surface-1, ${isDark ? '#1e2024' : '#ffffff'});
          color: var(--gb-text-primary, ${isDark ? '#e8eaed' : '#1a1a1a'});
          font-family: Calibri, 'Segoe UI', Arial, sans-serif;
          font-size: 13px;
          line-height: 1.6;
        }
        /* Clamp EVERYTHING to the view width — emails ship fixed-width
           images / tables that otherwise stretch past the modal. The
           !important beats inline width/height + the email's own CSS. */
        #gb-email-content { max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; }
        #gb-email-content * { max-width: 100% !important; box-sizing: border-box; }
        #gb-email-content a { color: var(--gb-brand-label, #8fce2e); overflow-wrap: anywhere; }
        #gb-email-content img, #gb-email-content video { max-width: 100% !important; height: auto !important; }
        #gb-email-content table { max-width: 100% !important; table-layout: auto; }
      </style>
      <div id="gb-email-content">${html || ''}</div>
    `;
    const content = shadow.querySelector('#gb-email-content');
    if (content) {
      normaliseEmailDom(content, isDark);
      /* Add our own side gutter only when the email's HTML doesn't
         already inset its content — keeps padded marketing templates
         from getting a double gutter while plain replies still breathe. */
      if (!emailProvidesSidePadding(content)) {
        content.style.paddingLeft = '26px';
        content.style.paddingRight = '26px';
      }
    }
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
