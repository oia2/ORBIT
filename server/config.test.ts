import { describe, expect, it } from 'vitest';

import { readServerConfig } from './config';

const DATABASE_URL = 'postgres://orbit:orbit@localhost:5432/orbit';

describe('readServerConfig', () => {
  it('reads a complete environment', () => {
    expect(
      readServerConfig({
        env: { DATABASE_URL, PORT: '4000', NODE_ENV: 'production' },
      }),
    ).toEqual({ databaseUrl: DATABASE_URL, port: 4000, nodeEnv: 'production' });
  });

  it('defaults the port and environment', () => {
    expect(readServerConfig({ env: { DATABASE_URL } })).toEqual({
      databaseUrl: DATABASE_URL,
      port: 3000,
      nodeEnv: 'development',
    });
  });

  it('trims the connection string', () => {
    expect(readServerConfig({ env: { DATABASE_URL: `  ${DATABASE_URL}  ` } }).databaseUrl).toBe(
      DATABASE_URL,
    );
  });

  it.each([
    ['absent', {}],
    ['empty', { DATABASE_URL: '' }],
    ['blank', { DATABASE_URL: '   ' }],
  ])(
    'refuses to start when DATABASE_URL is %s, naming what is missing',
    (_label, env: Record<string, string>) => {
      // Failing here rather than at the first query is the point: a
      // misconfigured deployment must not look like a transient outage.
      expect(() => readServerConfig({ env })).toThrow(/DATABASE_URL is required/);
      expect(() => readServerConfig({ env })).toThrow(/\.env\.example/);
    },
  );

  it.each(['0', '-1', '65536', 'not-a-port', '3000.5'])('rejects the port %s', (port) => {
    expect(() => readServerConfig({ env: { DATABASE_URL, PORT: port } })).toThrow(/PORT must be/);
  });

  it('rejects an unknown NODE_ENV rather than guessing', () => {
    expect(() => readServerConfig({ env: { DATABASE_URL, NODE_ENV: 'staging' } })).toThrow(
      /NODE_ENV must be one of/,
    );
  });

  it.each(['development', 'production', 'test'])('accepts NODE_ENV %s', (nodeEnv) => {
    expect(readServerConfig({ env: { DATABASE_URL, NODE_ENV: nodeEnv } }).nodeEnv).toBe(nodeEnv);
  });
});
