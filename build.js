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

// Each surface = one src dir → one react-dist dir. Both follow the same
// "one IIFE bundle per .jsx file" convention so the output can be dropped
// straight into a content-script `js` array or referenced from an HTML host.
const surfaces = [
  { srcDir: 'src/content', outDir: 'react-dist/content' },
  { srcDir: 'src/popup',   outDir: 'react-dist/popup'   },
];

let total = 0;
for (const { srcDir, outDir } of surfaces) {
  const srcPath = resolve(root, srcDir);
  const outPath = resolve(root, outDir);
  if (!existsSync(srcPath)) continue;
  const entries = readdirSync(srcPath).filter((f) => f.endsWith('.jsx'));
  if (entries.length === 0) continue;

  for (const file of entries) {
    const name = file.replace(/\.jsx$/, '');
    console.log(`building ${srcDir}/${name} (${mode})...`);
    await build({
      configFile: false,
      mode,
      // React's npm build branches on process.env.NODE_ENV; it must be a literal.
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
  console.log('No components found in src/content/ or src/popup/ — nothing to build.');
  process.exit(0);
}

console.log(isWatch ? 'watching for changes...' : `done — built ${total} bundle(s)`);
