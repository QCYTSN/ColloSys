import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const reference = createRequire(
  path.join(root, 'third_party/codecast/upstream/packages/web/package.json'),
);
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: Object.fromEntries(
      ['dialog', 'dropdown-menu', 'tooltip', 'tabs'].map((name) => [
        `@radix-ui/react-${name}`,
        reference.resolve(`@radix-ui/react-${name}`),
      ]),
    ),
  },
  server: { host: '127.0.0.1', port: 3417, strictPort: true, fs: { allow: [root] } },
  preview: { host: '127.0.0.1', port: 3417, strictPort: true },
  build: { outDir: path.join(root, '.local/design-exploration-build'), emptyOutDir: true },
});
