/* ───────────────────────────────────────────────────────────────
   revstack.skin.js — the RevStack dashboard look as an extension skin.

   A skin is { vars, css }: `vars` override --gb-* tokens on <html> (they
   inherit into every surface, including the custom-page shadow DOM);
   `css` is the raw class-level layer injected into document.head + each
   registered shadow root.

   This one reskins the extension to the RevStack dashboard aesthetic —
   an aurora gradient background with frosted-glass blocks — proving the
   override engine can change the whole LOOK, not just colors. It is the
   JS source of truth; src/themes/revstack.css mirrors it as a readable
   stylesheet you can keep/edit as "the dashboard design".

   Almost everything is token-driven, because the shared primitives
   (Card, ModalShell, the page frame) now read --gb-card-* / --gb-modal-*
   / --gb-app-bg. Inline styles beat plain class rules, so the raw `css`
   layer only adds things tokens can't express (pseudo-element sheen).
─────────────────────────────────────────────────────────────── */

export const REVSTACK_VARS = {
  /* ── App background: layered aurora over near-black ───────────── */
  '--gb-app-bg':
    'radial-gradient(1100px 760px at 12% -12%, rgba(143,206,46,0.16), transparent 58%),'
    + 'radial-gradient(980px 720px at 104% -4%, rgba(78,120,210,0.16), transparent 55%),'
    + 'radial-gradient(900px 900px at 50% 120%, rgba(120,90,200,0.10), transparent 60%),'
    + 'linear-gradient(165deg, #0c1017 0%, #0a0d13 42%, #08090d 100%)',

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
  '--gb-card-radius': '16px',

  /* ── Frosted-glass MODALS ────────────────────────────────────── */
  '--gb-modal-bg':     'rgba(16,20,27,0.72)',
  '--gb-modal-blur':   'blur(28px) saturate(160%)',
  '--gb-modal-border': '1px solid rgba(255,255,255,0.12)',
  '--gb-modal-radius': '18px',
  '--gb-modal-shadow': '0 30px 80px -22px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,255,255,0.06)',

  /* ── Softer radii + darker scrim to match the dashboard ──────── */
  '--gb-r-sm':  '8px',
  '--gb-r-md':  '12px',
  '--gb-r-lg':  '16px',
  '--gb-r-xl':  '20px',
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
