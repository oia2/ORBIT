import type { Kysely } from 'kysely';

/**
 * Kysely's own `Migration` interface is typed against `Kysely<any>`, and a
 * `Kysely<Database>` is not assignable to `Kysely<unknown>`. Migrations run
 * against the raw connection anyway — they build the schema the typed
 * `Database` interface describes — so the escape hatch lives here alone rather
 * than spreading through every migration module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyKysely = Kysely<any>;
