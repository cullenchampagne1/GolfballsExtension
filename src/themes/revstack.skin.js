/* ───────────────────────────────────────────────────────────────
   revstack.skin.js — the RevStack dashboard look as an extension skin.

   A skin is { vars, css }: `vars` override --gb-* tokens on <html>;
   `css` is the raw class-level layer injected into document.head + each
   registered shadow root.

   This one reskins the extension to the RevStack dashboard aesthetic —
   an aurora gradient background with frosted-glass blocks — proving the
   override engine can change the whole LOOK, not just colors. It is the
   JS source of truth; src/themes/revstack.css mirrors it as a readable
   stylesheet you can keep/edit as "the dashboard design".

   Almost everything is token-driven, because the shared primitives
   (Card and ModalShell) now read --gb-card-* / --gb-modal-*
   / --gb-app-bg. Inline styles beat plain class rules, so the raw `css`
   layer only adds things tokens can't express (pseudo-element sheen).
─────────────────────────────────────────────────────────────── */

export const REVSTACK_VARS = {
  /* ── App background: aurora tinted by the THEME PRIMARY. The accent
        radials derive from --gb-brand-label via color-mix, so the whole
        background tracks whatever primary the theme sets (green today,
        blue/purple/etc. if you recolor) instead of a baked-in hue. Only
        the deep base is a fixed near-black so text stays legible. ───── */
  '--gb-app-bg':
    'radial-gradient(1200px 820px at 6% -16%, color-mix(in srgb, var(--gb-brand-label) 20%, transparent), transparent 58%),'
    + 'radial-gradient(1050px 780px at 108% -8%, color-mix(in srgb, var(--gb-brand-label) 13%, transparent), transparent 56%),'
    + 'radial-gradient(1150px 1000px at 62% 120%, color-mix(in srgb, var(--gb-brand-label) 9%, transparent), transparent 60%),'
    + 'linear-gradient(168deg, #0c0f16 0%, #0a0d13 46%, #090a0f 100%)',

  /* ── Surfaces → translucent so the gradient reads through ─────── */
  '--gb-surface-deep':   'transparent',
  '--gb-surface-canvas': 'rgba(255,255,255,0.02)',
  '--gb-surface-1':      'rgba(255,255,255,0.045)',
  '--gb-surface-2':      'rgba(255,255,255,0.075)',
  '--gb-surface-3':      'rgba(255,255,255,0.11)',
  '--gb-surface-modal':  'rgba(17,21,28,0.66)',

  /* ── Borders → soft light hairlines ──────────────────────────── */
  '--gb-border-subtle':  'rgba(255,255,255,0.06)',
  '--gb-border-default': 'rgba(255,255,255,0.11)',
  '--gb-border-strong':  'rgba(255,255,255,0.18)',

  /* ── Text → legible on dark glass (force dark base regardless of
        the active variant so light/cream don't wash out) ───────── */
  '--gb-text-primary':   '#f3f6f8',
  '--gb-text-secondary': '#ccd3db',
  '--gb-text-tertiary':  '#9aa2ad',
  '--gb-text-muted':     '#6f7783',
  '--gb-text-ghost':     '#4a515b',
  '--gb-mode-fill-base': '255, 255, 255',
  '--gb-mode-fill-inverse': '0, 0, 0',

  /* ── Frosted-glass BLOCKS (Card) ─────────────────────────────── */
  '--gb-card-bg':     'rgba(255,255,255,0.05)',
  '--gb-card-blur':   'blur(18px) saturate(150%)',
  '--gb-card-border': '1px solid rgba(255,255,255,0.10)',
  '--gb-card-shadow': '0 8px 30px -10px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.05)',
  '--gb-card-radius': '11px',

  /* ── Frosted-glass MODALS ────────────────────────────────────── */
  '--gb-modal-bg':     'rgba(16,20,27,0.72)',
  '--gb-modal-blur':   'blur(28px) saturate(160%)',
  '--gb-modal-border': '1px solid rgba(255,255,255,0.12)',
  '--gb-modal-radius': '13px',
  '--gb-modal-shadow': '0 30px 80px -22px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,255,255,0.06)',

  /* ── Softer radii + darker scrim to match the dashboard ──────── */
  '--gb-r-sm':  '6px',
  '--gb-r-md':  '9px',
  '--gb-r-lg':  '11px',
  '--gb-r-xl':  '13px',
  '--gb-backdrop': 'rgba(6,8,12,0.62)',
};

/* Raw layer — the RevStack look is fully token-driven (the glass rim is the
   inset highlight baked into --gb-card-shadow / --gb-modal-shadow), so no
   class-level CSS is needed here. Left as the seam for future skins that want
   to target the gb-card / gb-modal / gb-app / gb-page class names directly.
   (Kept empty to avoid the inline-style-vs-class specificity trap.) */
export const REVSTACK_CSS = '';

export const REVSTACK_SKIN = { vars: REVSTACK_VARS, css: REVSTACK_CSS };
export default REVSTACK_SKIN;
