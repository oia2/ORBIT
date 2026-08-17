import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const alias = fileURLToPath(new URL('./src', import.meta.url));

/**
 * SC-007: the server suites, run under a non-UTC timezone.
 *
 * The server must have no clock of its own — every timestamp it records and
 * every time-dependent decision it makes comes from the caller's supplied
 * reading (FR-009). If server time leaked into any code path, this run would
 * disagree with `npm run test:server`, and `Pacific/Auckland` is far enough
 * from UTC (+12/+13, and on the other side of the date line) that a leak would
 * change a recorded date, not just an hour.
 *
 * The timezone is set through Vitest's `test.env` rather than a `TZ=… command`
 * shell prefix: that syntax is POSIX-only and does not work in PowerShell,
 * which is where this project is developed.
 */
export default defineConfig({
  resolve: { alias: { '@': alias } },
  test: {
    name: 'server-tz',
    environment: 'node',
    include: ['server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'dist-server/**'],
    env: {
      TZ: 'Pacific/Auckland',
    },
  },
});
