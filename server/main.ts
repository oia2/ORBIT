import { createApp } from './app';
import { readServerConfig } from './config';
import { createPlanningDatabase } from './db/client';
import { runMigrations } from './db/migrations/index';
import { createPostgresPlanningRepository } from './planning/postgres-planning-repository';

/**
 * Startup order is load-bearing: migrations complete before the server accepts
 * a single request, so a first run against an empty volume yields a working,
 * empty ORBIT rather than an error (FR-004, FR-019).
 */
async function main(): Promise<void> {
  const config = readServerConfig();
  const handle = createPlanningDatabase({ connectionString: config.databaseUrl });

  await runMigrations(handle.db);

  const app = await createApp({
    db: handle.db,
    createRepository: (clock) => createPostgresPlanningRepository(handle.db, { clock }),
    serveStaticClient: config.nodeEnv === 'production',
    logger: true,
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await handle.destroy();
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown().finally(() => {
        process.exit(0);
      });
    });
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
