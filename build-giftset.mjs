/* One-off targeted build for the gift-set work — builds only the bundles that
   the giftset feature touches, so a failing unrelated bundle (campaign-manager)
   can't block them. Mirrors build.js's vite config exactly. Temporary helper. */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const mode = 'production';

const targets = [
  { srcDir: 'src/content', outDir: 'react-dist/content', file: 'gift-catalog.jsx',    name: 'gift-catalog' },
  { srcDir: 'src/content', outDir: 'react-dist/content', file: 'image-preview.jsx',    name: 'image-preview' },
  { srcDir: 'src/content', outDir: 'react-dist/content', file: 'editor-settings.jsx',  name: 'editor-settings' },
];

for (const { srcDir, outDir, file, name } of targets) {
  console.log(`building ${srcDir}/${name} (${mode})...`);
  await build({
    configFile: false,
    mode,
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    plugins: [react()],
    esbuild: { charset: 'ascii' },
    build: {
      outDir: resolve(root, outDir),
      emptyOutDir: false,
      minify: true,
      watch: null,
      lib: {
        entry: resolve(root, srcDir, file),
        formats: ['iife'],
        name: `__gb_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  });
}
console.log('done');
