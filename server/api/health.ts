import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';

import type { PlanningDatabase } from '../db/client';

export interface HealthRouteOptions {
  readonly db: PlanningDatabase;
}

/**
 * The client's single bootstrap probe (research Decision 12). It reports the
 * database, not just the process: a server that is up but cannot reach
 * PostgreSQL must not be reported as ready, or the first real request would be
 * the thing that discovers it.
 */
export function registerHealthRoute(app: FastifyInstance, options: HealthRouteOptions): void {
  app.get('/api/health', async (_request, reply) => {
    try {
      await sql`select 1`.execute(options.db);
      return await reply.code(200).send({ status: 'ok' });
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
