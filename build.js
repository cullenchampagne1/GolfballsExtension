/**
 * build.js — compiles React components for the extension, one bundle per file.
 *
 * Each .jsx file in src/content/ becomes a self-contained IIFE in
 * react-dist/content/ with React bundled in. The output is a classic script
 * (not an ES module), so it can be dropped straight into a manifest content
 * script `js` array, exactly like the existing vanilla content/*.js files.
 *
 *   npm run build     one-off production build
 *   npm run watch     rebuild on change (development React, readable errors)
 *
 * Nothing here touches the existing vanilla code. Migration is per-component:
 * write src/content/foo.jsx, build, then point the manifest at
 * react-dist/content/foo.js instead of content/foo.js.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');
const mode = isWatch ? 'development' : 'production';

// Each surface = one src dir → one react-dist dir. The first three are
// React components (.jsx → IIFE); the fourth is ES-module bridge entries
// (`*.entry.js`) used to expose pure-JS engine modules to legacy vanilla
// content scripts via a `window.__gb*` global.
const surfaces = [
  { srcDir: 'src/content',       outDir: 'react-dist/content',    suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/popup',         outDir: 'react-dist/popup',      suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/playground',    outDir: 'react-dist/playground', suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/vanilla-build', outDir: 'react-dist/vanilla',    suffix: '.entry.js', stripSuffix: '.entry.js' },
];

let total = 0;
for (const { srcDir, outDir, suffix, stripSuffix } of surfaces) {
  const srcPath = resolve(root, srcDir);
  const outPath = resolve(root, outDir);
  if (!existsSync(srcPath)) continue;
  const entries = readdirSync(srcPath).filter((f) => f.endsWith(suffix));
  if (entries.length === 0) continue;

  for (const file of entries) {
    const name = file.slice(0, file.length - stripSuffix.length);
    console.log(`building ${srcDir}/${name} (${mode})...`);
    await build({
      configFile: false,
      mode,
      // React's npm build branches on process.env.NODE_ENV; it must be a literal.
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      plugins: [react()],
      /* Emit ASCII-only output (escape every non-ASCII char to \uXXXX).
         Chrome's content-script loader runs strict UTF-8 validation that
         rejects Unicode NONCHARACTERS (e.g. U+FFFF) and C1 controls
         (U+0080) — which ship as raw sentinel literals inside deps like
         three.js — with the misleading "isn't UTF-8 encoded" error.
         Escaping them sidesteps the whole class for every bundle. */
      esbuild: { charset: 'ascii' },
      build: {
        outDir: outPath,
        emptyOutDir: false,
        minify: mode === 'production',
        watch: isWatch ? {} : null,
        lib: {
          entry: resolve(srcPath, file),
          formats: ['iife'],
          // IIFE needs a name; the entry file has no exports, so it's unused.
          name: `__gb_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          fileName: () => `${name}.js`,
        },
      },
    });
    total++;
  }
}

if (total === 0) {
  console.log('No components found in any surface dir — nothing to build.');
  process.exit(0);
}

console.log(isWatch ? 'watching for changes...' : `done — built ${total} bundle(s)`);
