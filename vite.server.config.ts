import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));

/**
 * SSR build for the Fastify server. Reusing Vite rather than `tsc` keeps the
 * `@` alias definition in one place, which is the only reason the domain layer
 * under `src/` can be shared with the server without rewriting import paths.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': sourceDirectory,
    },
  },
  ssr: {
    target: 'node',
    // Bundling the shared domain keeps `dist-server/` self-contained; runtime
    // dependencies stay external so they resolve from node_modules.
    noExternal: true,
    external: ['fastify', '@fastify/static', 'kysely', 'pg'],
  },
  build: {
    ssr: fileURLToPath(new URL('./server/main.ts', import.meta.url)),
    outDir: path.resolve(projectRoot, 'dist-server'),
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        format: 'esm',
      },
    },
  },
});
