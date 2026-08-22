#!/usr/bin/env node
/**
 * `npm run db:backup` — dumps the running ORBIT database to `backups/`.
 *
 * Feature 003 rewrites stored closure snapshots in place (003 FR-021), so a
 * restorable dump has to exist before the server applies its migrations at
 * startup. The upgrade procedure in README.md requires this script; it is not
 * a convenience.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICE = 'db';
const USER = process.env.ORBIT_DB_USER ?? 'orbit';
const DATABASE = process.env.ORBIT_DB_NAME ?? 'orbit';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
}

const directory = resolve(process.cwd(), 'backups');
mkdirSync(directory, { recursive: true });
const target = resolve(directory, `orbit-${timestamp()}.dump`);

const child = spawn(
  'docker',
  ['compose', 'exec', '-T', SERVICE, 'pg_dump', '-U', USER, '-d', DATABASE, '--format=custom'],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);

child.stdout.pipe(createWriteStream(target));

child.on('error', (error) => {
  console.error(`Could not run docker compose: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump exited with code ${String(code)}. No usable backup was written.`);
    process.exit(code ?? 1);
  }

  const { size } = statSync(target);
  if (size === 0) {
    console.error(`Backup at ${target} is empty. Refusing to report success.`);
    process.exit(1);
  }

  console.log(`Backup written: ${target} (${String(size)} bytes)`);
  console.log('Restore with: npm run db:restore -- <path-to-dump>');
});
