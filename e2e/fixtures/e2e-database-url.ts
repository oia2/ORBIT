import pg from 'pg';

/**
 * The dedicated E2E database, kept free of any `@/` alias import.
 *
 * The Playwright `webServer` launcher runs this through `tsx`, which resolves
 * plain relative and package specifiers only — so the two things the launcher
 * needs (the connection string and an empty database) live here rather than in
 * the fixture module that reuses the server's schema and mappers.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://orbit:orbit@localhost:5432/orbit_e2e';

function maintenanceUrl(): string {
  const url = new URL(E2E_DATABASE_URL);
  url.pathname = '/postgres';
  return url.toString();
}

export function e2eDatabaseName(): string {
  return new URL(E2E_DATABASE_URL).pathname.replace(/^\//, '');
}

/**
 * Drops and recreates the E2E database, leaving it empty. The server applies
 * its own migrations at startup, exactly as it does in a deployment — which is
 * also what proves a first run against an empty volume works (FR-004).
 */
export async function createEmptyE2eDatabase(): Promise<void> {
  const name = e2eDatabaseName();
  const client = new pg.Client({ connectionString: maintenanceUrl() });
  await client.connect();

  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
