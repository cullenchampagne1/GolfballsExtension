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
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = resolve(root, 'src/content');
const outDir = resolve(root, 'react-dist/content');

const isWatch = process.argv.includes('--watch');
const mode = isWatch ? 'development' : 'production';

const entries = readdirSync(contentDir).filter((f) => f.endsWith('.jsx'));
if (entries.length === 0) {
  console.log('No components found in src/content/ — nothing to build.');
  process.exit(0);
}

for (const file of entries) {
  const name = file.replace(/\.jsx$/, '');
  console.log(`building ${name} (${mode})...`);
  await build({
    configFile: false,
    mode,
    // React's npm build branches on process.env.NODE_ENV; it must be a literal.
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: false,
      minify: mode === 'production',
      watch: isWatch ? {} : null,
      lib: {
        entry: resolve(contentDir, file),
        formats: ['iife'],
        // IIFE needs a name; the component file has no exports, so it's unused.
        name: `__gb_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  });
}

console.log(isWatch ? 'watching for changes...' : 'done -> react-dist/content/');
