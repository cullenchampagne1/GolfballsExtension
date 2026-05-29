/**
 * build.js — compiles the two content-script entries (image-preview,
 * submit-proof) into self-contained IIFE bundles in react-dist/content/.
 * Trimmed from the parent extension's build.js: this client build has
 * only one surface, so the surfaces[] loop is collapsed.
 *
 *   npm run build     production
 *   npm run watch     rebuild on change
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const mode = isWatch ? 'development' : 'production';

const srcPath = resolve(root, 'src/content');
const outPath = resolve(root, 'react-dist/content');
if (!existsSync(srcPath)) {
  console.error('src/content does not exist; nothing to build.');
  process.exit(1);
}

const entries = readdirSync(srcPath).filter((f) => f.endsWith('.jsx'));
let total = 0;
for (const file of entries) {
  const name = file.slice(0, -4); // strip ".jsx"
  console.log(`building src/content/${name} (${mode})...`);
  await build({
    configFile: false,
    mode,
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    plugins: [react()],
    build: {
      outDir: outPath,
      emptyOutDir: false,
      minify: mode === 'production',
      watch: isWatch ? {} : null,
      lib: {
        entry: resolve(srcPath, file),
        formats: ['iife'],
        name: `__gb_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  });
  total++;
}

console.log(isWatch ? 'watching...' : `done — built ${total} bundle(s)`);
