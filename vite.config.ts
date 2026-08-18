import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': sourceDirectory,
    },
  },
  server: {
    /*
     * The client always uses relative `/api` paths, so there is no API base URL
     * to configure anywhere. In production one origin serves both; in
     * development this proxy makes the same paths work against the Fastify
     * server on :3000 (FR-016).
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist'),
  },
});
