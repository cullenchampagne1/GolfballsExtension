/**
 * generate-themes.mjs — build one static Chrome Theme per extension variant.
 *
 * Chrome's own UI (frame, tabs, toolbar, omnibox, bookmarks bar, NTP) can only
 * be recolored by a *theme* extension, and themes are STATIC — there's no API
 * to change one at runtime. So we generate a separate theme folder per variant;
 * the user load-unpacks / enables the one matching their current in-app theme.
 *
 * Colors are read straight from src/ui/theme.css so the browser chrome matches
 * the extension's tokens exactly. Re-run after changing theme.css:
 *   node themes/generate-themes.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'src/ui/theme.css'), 'utf8');

// id → display name (mirrors THEME_VARIANTS in src/lib/theme.js)
const VARIANTS = [
  { id: 'dark', name: 'Dark' },
  { id: 'midnight', name: 'Slate' },
  { id: 'light', name: 'Light' },
  { id: 'cream', name: 'Cream' },
  { id: 'nord', name: 'Nord' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'rose', name: 'Rose' },
  { id: 'tokyo', name: 'Tokyo Night' },
];

const TOKENS = [
  'surface-deep', 'surface-canvas', 'surface-1', 'surface-2',
  'text-primary', 'text-secondary', 'text-tertiary',
  'border-default', 'brand-label', 'text-on-brand',
];

/** Extract the CSS block for a variant ([data-theme="x"], or :root for dark). */
function blockFor(id) {
  const sel = id === 'dark' ? '\\[data-theme="dark"\\]' : `\\[data-theme="${id}"\\]`;
  const re = new RegExp(sel + '\\s*\\{([\\s\\S]*?)\\}');
  const m = css.match(re);
  return m ? m[1] : '';
}

function tokens(id) {
  const block = blockFor(id);
  const out = {};
  for (const t of TOKENS) {
    const m = block.match(new RegExp('--gb-' + t + ':\\s*(#[0-9a-fA-F]{3,8})'));
    if (m) out[t] = m[1];
  }
  return out;
}

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance([r, g, b]) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

let count = 0;
for (const v of VARIANTS) {
  const t = tokens(v.id);
  const deep = rgb(t['surface-deep'] || '#0a0b0c');
  const toolbar = rgb(t['surface-1'] || '#16181a');
  const omnibox = rgb(t['surface-2'] || '#1c1f22');
  const textPrimary = rgb(t['text-primary'] || '#f5f6f7');
  const textSecondary = rgb(t['text-secondary'] || '#d4d6d9');
  const textTertiary = rgb(t['text-tertiary'] || '#9ca0a6');
  const brand = rgb(t['brand-label'] || '#8fce2e');
  const isDark = luminance(deep) < 0.5;

  const manifest = {
    manifest_version: 3,
    version: '1.0.0',
    name: `Golfballs Admin — ${v.name}`,
    description: `Browser chrome matched to the ${v.name} extension theme.`,
    theme: {
      colors: {
        frame: deep,
        frame_inactive: deep,
        toolbar,
        tab_text: textPrimary,
        tab_background_text: textTertiary,
        bookmark_text: textSecondary,
        button_background: toolbar,
        omnibox_background: omnibox,
        omnibox_text: textPrimary,
        ntp_background: deep,
        ntp_text: textPrimary,
        ntp_link: brand,
      },
      properties: {
        // 1 = use the light NTP logo (for dark backgrounds)
        ntp_logo_alternate: isDark ? 1 : 0,
      },
    },
  };

  const dir = resolve(root, 'themes', v.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  count++;
  console.log(`themes/${v.id}/manifest.json  (${v.name}${isDark ? ', dark' : ', light'})`);
}
console.log(`\ndone — ${count} themes generated`);
