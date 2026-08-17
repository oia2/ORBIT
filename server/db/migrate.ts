import { readServerConfig } from '../config';
import { createPlanningDatabase } from './client';
import { runMigrations } from './migrations/index';

/** `npm run db:migrate` — applies pending migrations and exits. */
async function main(): Promise<void> {
  const config = readServerConfig();
  const handle = createPlanningDatabase({ connectionString: config.databaseUrl });

  try {
    const results = await runMigrations(handle.db);
    for (const result of results.results ?? []) {
      console.log(`${result.status}: ${result.migrationName}`);
    }
    console.log('Migrations up to date.');
  } finally {
    await handle.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
