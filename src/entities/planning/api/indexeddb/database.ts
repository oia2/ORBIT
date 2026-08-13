import { openDB, type IDBPDatabase } from 'idb';

import { upgradeOrbitPlanningDatabase } from './migrations';
import { ORBIT_DATABASE_NAME, ORBIT_DATABASE_VERSION, type OrbitPlanningDB } from './schema';

export interface DatabaseVersionChange {
  readonly currentVersion: number;
  readonly requestedVersion: number | null;
}

export interface OrbitDatabaseLifecycleCallbacks {
  readonly onBlocked?: (change: DatabaseVersionChange) => void;
  readonly onVersionChange?: (change: DatabaseVersionChange) => void;
  readonly onTerminated?: () => void;
}

export interface OrbitDatabaseLifecycleHandlerOptions extends OrbitDatabaseLifecycleCallbacks {
  readonly closeConnection: () => void;
}

export interface OrbitDatabaseLifecycleHandlers {
  readonly blocked: (currentVersion: number, requestedVersion: number | null) => void;
  readonly blocking: (currentVersion: number, requestedVersion: number | null) => void;
  readonly terminated: () => void;
}

/**
 * Kept independently testable because browser termination is not portable to
 * synthesize. Version changes always close this connection before notification.
 */
export function createOrbitDatabaseLifecycleHandlers(
  options: OrbitDatabaseLifecycleHandlerOptions,
): OrbitDatabaseLifecycleHandlers {
  return {
    blocked(currentVersion, requestedVersion) {
      options.onBlocked?.({ currentVersion, requestedVersion });
    },
    blocking(currentVersion, requestedVersion) {
      options.closeConnection();
      options.onVersionChange?.({ currentVersion, requestedVersion });
    },
    terminated() {
      options.onTerminated?.();
    },
  };
}

export interface OpenOrbitPlanningDatabaseOptions extends OrbitDatabaseLifecycleCallbacks {
  readonly databaseName?: string;
  /** Test/migration harness override; production callers use version 1. */
  readonly databaseVersion?: number;
}

export async function openOrbitPlanningDatabase(
  options: OpenOrbitPlanningDatabaseOptions = {},
): Promise<IDBPDatabase<OrbitPlanningDB>> {
  const connection: { current?: IDBPDatabase<OrbitPlanningDB> } = {};
  const lifecycle = createOrbitDatabaseLifecycleHandlers({
    closeConnection: () => connection.current?.close(),
    ...(options.onBlocked === undefined ? {} : { onBlocked: options.onBlocked }),
    ...(options.onVersionChange === undefined ? {} : { onVersionChange: options.onVersionChange }),
    ...(options.onTerminated === undefined ? {} : { onTerminated: options.onTerminated }),
  });

  const database = await openDB<OrbitPlanningDB>(
    options.databaseName ?? ORBIT_DATABASE_NAME,
    options.databaseVersion ?? ORBIT_DATABASE_VERSION,
    {
      upgrade(databaseToUpgrade, oldVersion) {
        upgradeOrbitPlanningDatabase(databaseToUpgrade, oldVersion);
      },
      blocked: lifecycle.blocked,
      blocking: lifecycle.blocking,
      terminated: lifecycle.terminated,
    },
  );
  connection.current = database;

  return database;
}

export function closeOrbitPlanningDatabase(database: IDBPDatabase<OrbitPlanningDB>): void {
  database.close();
}
