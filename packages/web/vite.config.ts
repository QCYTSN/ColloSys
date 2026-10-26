import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  build: { outDir: '../../dist/web', emptyOutDir: true },
  css: { postcss: path.join(import.meta.dirname, 'postcss.config.cjs') },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
      '/connector/alice': {
        target: 'http://127.0.0.1:8791',
        rewrite: (p) => p.replace('/connector/alice', ''),
      },
      '/connector/bob': {
        target: 'http://127.0.0.1:8792',
        rewrite: (p) => p.replace('/connector/bob', ''),
      },
    },
  },
});
