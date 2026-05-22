import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server for the component playground (`npm run dev`).
 *
 * The content-script bundles are built separately by build.js, which
 * runs Vite with `configFile: false` — so this config never touches
 * them. It exists purely to serve playground/.
 */
export default defineConfig({
  root: 'playground',
  plugins: [react()],
  server: { open: true },
});
