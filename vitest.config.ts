import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = fileURLToPath(new URL('./src', import.meta.url));
const setupFile = fileURLToPath(new URL('./tests/setup/vitest.setup.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': alias } },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'dist-server/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: [setupFile],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: [setupFile],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/**/index.ts',
        'server/**/*.test.ts',
        // Entry points and test scaffolding: exercised by the E2E run and by
        // the server suites themselves, not by unit coverage.
        'server/main.ts',
        'server/db/migrate.ts',
        'server/test-support/**',
        'server/planning/test-support/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        functions: 80,
        branches: 80,
        lines: 85,
        statements: 85,
        'src/entities/planning/model/{scoring,task-lifecycle,recurrence,day-closure,history}.ts': {
          functions: 100,
          branches: 95,
          lines: 95,
          statements: 95,
        },
      },
    },
  },
});
