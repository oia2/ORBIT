export type ServerEnvironment = 'development' | 'production' | 'test';

export interface ServerConfig {
  readonly databaseUrl: string;
  readonly port: number;
  readonly nodeEnv: ServerEnvironment;
}

export interface ReadServerConfigOptions {
  readonly env?: Record<string, string | undefined>;
}

const DEFAULT_PORT = 3000;

function parseEnvironment(value: string | undefined): ServerEnvironment {
  if (value === 'production' || value === 'test' || value === 'development') {
    return value;
  }

  if (value === undefined || value.length === 0) {
    return 'development';
  }

  throw new Error(`NODE_ENV must be one of development, production, or test; received "${value}".`);
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received "${value}".`);
  }

  return port;
}

/**
 * Fails fast at startup rather than at the first query, so a misconfigured
 * deployment never reaches the point of reporting a database problem as a
 * transient server failure.
 */
export function readServerConfig(options: ReadServerConfigOptions = {}): ServerConfig {
  const env = options.env ?? process.env;
  const databaseUrl = env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error(
      'DATABASE_URL is required. Set it to a PostgreSQL connection string, for example ' +
        'postgres://orbit:orbit@localhost:5432/orbit (see .env.example).',
    );
  }

  return {
    databaseUrl: databaseUrl.trim(),
    port: parsePort(env.PORT),
    nodeEnv: parseEnvironment(env.NODE_ENV),
  };
}
