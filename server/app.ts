import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { ApplicationClock } from '@/shared/lib/local-date/clock';

import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import { registerHealthRoute } from './api/health';
import { registerPlanningRoutes } from './api/routes';
import type { PlanningDatabase } from './db/client';

export interface CreateAppOptions {
  readonly db: PlanningDatabase;
  readonly createRepository: (clock: ApplicationClock) => PlanningRepository;
  /** Serves the built client from a single origin when true (FR-016). */
  readonly serveStaticClient?: boolean;
  readonly clientRoot?: string;
  readonly logger?: boolean;
}

function defaultClientRoot(): string {
  return fileURLToPath(new URL('../dist', import.meta.url));
}

/**
 * Builds the Fastify app from its dependencies rather than reaching for module
 * state, so tests can drive the real routes through `app.inject()` without
 * listening on a port.
 */
export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((error: unknown, request, reply) => {
    request.log.error(error);
    const statusCode = (error as { readonly statusCode?: unknown }).statusCode;
    const status = typeof statusCode === 'number' && statusCode >= 400 ? statusCode : 500;
    const message = error instanceof Error ? error.message : 'Unexpected server failure';
    return reply.code(status).send({ error: message });
  });

  registerHealthRoute(app, { db: options.db });
  registerPlanningRoutes(app, { createRepository: options.createRepository });

  if (options.serveStaticClient === true) {
    const root = options.clientRoot ?? defaultClientRoot();
    await app.register(fastifyStatic, { root, wildcard: false });

    // One origin serves the interface and the API, so the client uses relative
    // `/api` paths and no CORS configuration ships (FR-016).
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.code(404).send({ error: `Unknown endpoint: ${request.url}` });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
