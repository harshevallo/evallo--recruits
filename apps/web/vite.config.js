import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Aliases mirror jsconfig.json — keep the two in sync. Vite resolves them at build time;
 * jsconfig.json is what makes the editor understand them.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },

  server: {
    port: 3001,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
