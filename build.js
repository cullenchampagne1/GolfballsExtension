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
import { IS_ADMIN_BUILD, isAdminEntry } from './scripts/strip-admin.mjs';

const root = dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');
const mode = isWatch ? 'development' : 'production';
// GB_ADMIN=0 → the served/consumer build: __ADMIN__ is false so admin code is
// dead-code-eliminated, admin entries are skipped, and output goes to a staging
// base (so the committed full react-dist is never overwritten).
const OUT_BASE = process.env.GB_OUT_BASE || 'react-dist';

const THREE_DUPLICATE_DIAGNOSTIC =
  "warn( 'WARNING: Multiple instances of Three.js being imported.' );";

/* The extension intentionally owns the shared Three runtime. Strip only
   Three's duplicate-instance diagnostic as a final guard against a content
   script being reinjected; all other Three warnings remain untouched. */
function silenceThreeDuplicateInstanceDiagnostic() {
  return {
    name: 'golfballs-silence-three-duplicate-instance-diagnostic',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/node_modules/three/')) return null;
      if (!code.includes(THREE_DUPLICATE_DIAGNOSTIC)) return null;
      return {
        code: code.replaceAll(
          THREE_DUPLICATE_DIAGNOSTIC,
          '/* Shared runtime owns duplicate-instance handling. */',
        ),
        map: null,
      };
    },
  };
}

// Each surface = one src dir → one react-dist dir. The first three are
// React components (.jsx → IIFE); the fourth is ES-module bridge entries
// (`*.entry.js`) used to expose pure-JS engine modules to legacy vanilla
// content scripts via a `window.__gb*` global.
const surfaces = [
  { srcDir: 'src/content',       outDir: 'react-dist/content',    suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/popup',         outDir: 'react-dist/popup',      suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/guide',         outDir: 'react-dist/guide',      suffix: '.jsx',      stripSuffix: '.jsx' },
  { srcDir: 'src/vanilla-build', outDir: 'react-dist/vanilla',    suffix: '.entry.js', stripSuffix: '.entry.js' },
  { srcDir: 'src/sandbox',       outDir: 'react-dist/sandbox',    suffix: '.entry.js', stripSuffix: '.entry.js' },
];

let total = 0;
for (const { srcDir, outDir, suffix, stripSuffix } of surfaces) {
  const srcPath = resolve(root, srcDir);
  const outPath = resolve(root, outDir.replace(/^react-dist(?=\/|$)/, OUT_BASE));
  if (!existsSync(srcPath)) continue;
  const entries = readdirSync(srcPath).filter((f) => f.endsWith(suffix));
  if (entries.length === 0) continue;

  for (const file of entries) {
    const relEntry = `${srcDir}/${file}`;
    if (!IS_ADMIN_BUILD && isAdminEntry(relEntry)) {
      console.log(`skip admin-only ${relEntry} (consumer build)`);
      continue;
    }
    const name = file.slice(0, file.length - stripSuffix.length);
    console.log(`building ${srcDir}/${name} (${mode}${IS_ADMIN_BUILD ? '' : ', consumer'})...`);
    await build({
      configFile: false,
      mode,
      // React's npm build branches on process.env.NODE_ENV; it must be a literal.
      // __ADMIN__ gates admin-only inline code — a literal so esbuild DCE's the
      // `if (__ADMIN__) { … }` / `{__ADMIN__ && …}` blocks out of the consumer build.
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        __ADMIN__: JSON.stringify(IS_ADMIN_BUILD),
      },
      plugins: [silenceThreeDuplicateInstanceDiagnostic(), react()],
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
