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

const LIGHT_TEXT = '#eceef2';

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

/* A grayscale text color (low chroma) gets unified to the standard
   light text so every shade of gray an email throws at us reads the
   same on the dark surface — both the dark grays (footers, black
   body text) AND the muted light grays (e.g. a job-title line) that
   otherwise look washed-out and inconsistent next to the body. Only
   already-near-white text is left as-is (it's already legible), and
   saturated colors (high chroma — links, brand marks, warnings) keep
   their hue. */
function needsLighten(v) {
  const c = parseColor(v);
  if (!c) return false;
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; // 0..1
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return chroma <= 40 && lum < 0.82;
}

/* THEME-AWARE text fix. Emails are authored for a white background
   with dark text. On a DARK theme that dark text would be invisible,
   so we lighten the dark/gray runs. On a LIGHT theme the surface is
   already light, so the email's dark text is correct as-authored —
   lightening it (the previous behavior) turned it near-white and it
   vanished. So we only rewrite text colors when the pane is dark. */
function normaliseEmailDom(container, isDark) {
  let seen = 0; let changed = 0;
  container.querySelectorAll('*').forEach((el) => {
    /* White / near-white backgrounds → transparent so the email blends
       into the pane's own surface (works in both themes — the host
       surface shows through). */
    const bgAttr = el.getAttribute && el.getAttribute('bgcolor');
    if (bgAttr && isLightBg(bgAttr)) el.setAttribute('bgcolor', 'transparent');

    if (el.style) {
      if (isLightBg(el.style.backgroundColor)) el.style.backgroundColor = 'transparent';
      if (isLightBg(el.style.background)) el.style.background = 'transparent';
      if (isDark && el.style.color) { seen += 1; if (needsLighten(el.style.color)) { el.style.color = LIGHT_TEXT; changed += 1; } }
    }

    const colorAttr = el.getAttribute && el.getAttribute('color');
    if (isDark && colorAttr) { seen += 1; if (needsLighten(colorAttr)) { el.setAttribute('color', LIGHT_TEXT); changed += 1; } }
  });
  if (isDark) {
    /* Outlook sets body color via <style> class rules (p.MsoNormal
       { color:#242424 }) the per-element walk never sees — rewrite
       grayish colors there too. */
    container.querySelectorAll('style').forEach((s) => {
      const css = s.textContent || '';
      const next = css.replace(/color\s*:\s*([^;}!]+)/gi, (m, val) =>
        (needsLighten(val) ? `color: ${LIGHT_TEXT}` : m));
      if (next !== css) { s.textContent = next; changed += 1; }
    });
  }
  try {
    // eslint-disable-next-line no-console
    console.log('[gb-email] normalise — dark', isDark, 'seen', seen, 'changed', changed);
  } catch { /* ignore */ }
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
          padding: 20px 22px;
          background: var(--gb-surface-1, ${isDark ? '#1e2024' : '#ffffff'});
          color: var(--gb-text-primary, ${isDark ? '#e8eaed' : '#1a1a1a'});
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
    if (content) normaliseEmailDom(content, isDark);
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
