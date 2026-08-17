import { createEmptyE2eDatabase, E2E_DATABASE_URL } from './fixtures/e2e-database-url';

/**
 * Launches the built server against a freshly created E2E database.
 *
 * Playwright starts `webServer` before `globalSetup`, so creating the database
 * has to happen here. The server then applies its own migrations once it can
 * connect, exactly as it does in a deployment.
 */
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.NODE_ENV = 'production';

await createEmptyE2eDatabase();

// Resolved at runtime so TypeScript does not typecheck the build output, and so
// the bundle is loaded only after the database exists.
const serverEntry = new URL('../dist-server/main.js', import.meta.url).href;
await import(serverEntry);
