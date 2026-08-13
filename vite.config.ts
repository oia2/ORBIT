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
  build: {
    outDir: path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist'),
  },
});
