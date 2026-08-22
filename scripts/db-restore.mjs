#!/usr/bin/env node
/**
 * `npm run db:restore -- <path-to-dump>` — restores a dump taken by
 * `npm run db:backup` into the running ORBIT database.
 *
 * This is the rollback path for feature 003's snapshot migration. It is
 * destructive by design (`--clean --if-exists` drops what it replaces), so it
 * refuses to guess which file to use and refuses to run without confirmation.
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const SERVICE = 'db';
const USER = process.env.ORBIT_DB_USER ?? 'orbit';
const DATABASE = process.env.ORBIT_DB_NAME ?? 'orbit';

const [, , argument] = process.argv;
if (argument === undefined) {
  console.error('Usage: npm run db:restore -- <path-to-dump>');
  process.exit(1);
}

const source = resolve(process.cwd(), argument);
if (!existsSync(source) || statSync(source).size === 0) {
  console.error(`No usable dump at ${source}.`);
  process.exit(1);
}

if (process.env.ORBIT_RESTORE_YES !== '1') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This REPLACES the contents of database "${DATABASE}" with ${source}.\nType the database name to continue: `,
  );
  rl.close();
  if (answer.trim() !== DATABASE) {
    console.error('Aborted. Nothing was changed.');
    process.exit(1);
  }
}

const child = spawn(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    SERVICE,
    'pg_restore',
    '-U',
    USER,
    '-d',
    DATABASE,
    '--clean',
    '--if-exists',
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);

createReadStream(source).pipe(child.stdin);

child.on('error', (error) => {
  console.error(`Could not run docker compose: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_restore exited with code ${String(code)}.`);
    process.exit(code ?? 1);
  }
  console.log(`Restored ${DATABASE} from ${source}.`);
});
