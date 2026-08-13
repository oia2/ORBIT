import {
  openOrbitPlanningDatabase,
  type DatabaseVersionChange,
  type PlanningRepository,
} from '@/entities/planning';

export interface AppRuntimeDatabaseLifecycleCallbacks {
  readonly onBlocked?: (change: DatabaseVersionChange) => void;
  readonly onVersionChange?: (change: DatabaseVersionChange) => void;
  readonly onTerminated?: () => void;
}

export interface ClosableRuntimeDatabase {
  close(): void;
}

export interface DisposablePlanningRepository extends PlanningRepository {
  dispose(): void;
}

type RuntimeRepository = PlanningRepository & {
  readonly dispose?: () => void;
};

export type PersistentStorageState = 'granted' | 'denied' | 'unsupported';

export interface InitializingAppRuntimeSnapshot {
  readonly status: 'initializing';
  readonly attempt: number;
}

export interface BlockedAppRuntimeSnapshot {
  readonly status: 'blocked';
  readonly attempt: number;
  readonly currentVersion: number;
  readonly requestedVersion: number | null;
  /** Version changes close this connection and require a reload before retry. */
  readonly requiresReload: boolean;
}

export interface FailedAppRuntimeSnapshot {
  readonly status: 'failure';
  readonly attempt: number;
  readonly reason: 'storage-unavailable' | 'terminated';
  readonly message: string;
}

export interface ReadyAppRuntimeSnapshot {
  readonly status: 'ready';
  readonly attempt: number;
  readonly repository: PlanningRepository;
  readonly persistentStorage: PersistentStorageState;
}

export type AppRuntimeSnapshot =
  | InitializingAppRuntimeSnapshot
  | BlockedAppRuntimeSnapshot
  | FailedAppRuntimeSnapshot
  | ReadyAppRuntimeSnapshot;

export type AppRuntimeListener = () => void;

export interface AppRuntime {
  getSnapshot(): AppRuntimeSnapshot;
  subscribe(listener: AppRuntimeListener): () => void;
  retry(): void;
  dispose(): void;
}

export interface AppRuntimeDependencies<
  TDatabase extends ClosableRuntimeDatabase = ClosableRuntimeDatabase,
> {
  readonly openDatabase?: (callbacks: AppRuntimeDatabaseLifecycleCallbacks) => Promise<TDatabase>;
  readonly createRepository: (database: TDatabase) => RuntimeRepository;
  /** `undefined` means that the Storage API is unsupported. */
  readonly requestPersistentStorage?: () => boolean | undefined | Promise<boolean | undefined>;
}

interface ActiveRuntimeResources<TDatabase extends ClosableRuntimeDatabase> {
  readonly database: TDatabase;
  readonly repository: RuntimeRepository;
}

interface AttemptControl {
  readonly generation: number;
  stopped: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'IndexedDB is unavailable';
}

async function requestBrowserPersistentStorage(): Promise<boolean | undefined> {
  const browserNavigator =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as { readonly storage?: { readonly persist?: () => Promise<boolean> } });
  const storage = browserNavigator?.storage;
  if (storage?.persist === undefined) {
    return undefined;
  }

  return storage.persist();
}

function persistentStorageState(value: boolean | undefined): PersistentStorageState {
  if (value === undefined) {
    return 'unsupported';
  }

  return value ? 'granted' : 'denied';
}

function disposeResources<TDatabase extends ClosableRuntimeDatabase>(
  resources: ActiveRuntimeResources<TDatabase>,
): void {
  const disposeRepository = resources.repository.dispose;
  if (typeof disposeRepository === 'function') {
    try {
      disposeRepository.call(resources.repository);
      return;
    } catch {
      // A failing adapter disposer must not leave the connection open.
    }
  }

  try {
    resources.database.close();
  } catch {
    // Disposal is best effort and must not mask the lifecycle state.
  }
}

/**
 * Creates the application bootstrap resource synchronously and starts one
 * controlled database-open attempt. It deliberately has no React dependency.
 */
export function createAppRuntime<TDatabase extends ClosableRuntimeDatabase>(
  dependencies: AppRuntimeDependencies<TDatabase>,
): AppRuntime {
  const listeners = new Set<AppRuntimeListener>();
  const openDatabase =
    dependencies.openDatabase ??
    (openOrbitPlanningDatabase as unknown as (
      callbacks: AppRuntimeDatabaseLifecycleCallbacks,
    ) => Promise<TDatabase>);
  const requestPersistentStorage =
    dependencies.requestPersistentStorage ?? requestBrowserPersistentStorage;

  let disposed = false;
  let generation = 0;
  let attempt = 0;
  let snapshot: AppRuntimeSnapshot = Object.freeze({
    status: 'initializing',
    attempt: 1,
  });
  let activeResources: ActiveRuntimeResources<TDatabase> | undefined;

  const publish = (nextSnapshot: AppRuntimeSnapshot): void => {
    if (disposed) {
      return;
    }

    snapshot = Object.freeze(nextSnapshot);
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const disposeActiveResources = (): void => {
    if (activeResources === undefined) {
      return;
    }

    const resources = activeResources;
    activeResources = undefined;
    disposeResources(resources);
  };

  const isCurrent = (control: AttemptControl): boolean =>
    !disposed && !control.stopped && control.generation === generation;

  const beginAttempt = (): void => {
    disposeActiveResources();
    generation += 1;
    attempt += 1;
    const currentAttempt = attempt;
    const control: AttemptControl = { generation, stopped: false };

    publish({ status: 'initializing', attempt: currentAttempt });

    const persistencePromise = Promise.resolve()
      .then(() => requestPersistentStorage())
      .then(persistentStorageState)
      .catch((): PersistentStorageState => 'denied');

    const lifecycle: AppRuntimeDatabaseLifecycleCallbacks = {
      onBlocked(change) {
        if (!isCurrent(control)) {
          return;
        }

        publish({
          status: 'blocked',
          attempt: currentAttempt,
          currentVersion: change.currentVersion,
          requestedVersion: change.requestedVersion,
          requiresReload: false,
        });
      },
      onVersionChange(change) {
        if (!isCurrent(control)) {
          return;
        }

        control.stopped = true;
        disposeActiveResources();
        publish({
          status: 'blocked',
          attempt: currentAttempt,
          currentVersion: change.currentVersion,
          requestedVersion: change.requestedVersion,
          requiresReload: true,
        });
      },
      onTerminated() {
        if (!isCurrent(control)) {
          return;
        }

        control.stopped = true;
        disposeActiveResources();
        publish({
          status: 'failure',
          attempt: currentAttempt,
          reason: 'terminated',
          message: 'The IndexedDB connection was terminated; retry to reopen it.',
        });
      },
    };

    void (async () => {
      let database: TDatabase | undefined;
      try {
        database = await openDatabase(lifecycle);
        if (!isCurrent(control)) {
          database.close();
          return;
        }

        const repository = dependencies.createRepository(database);
        const resources = { database, repository };
        if (!isCurrent(control)) {
          disposeResources(resources);
          return;
        }

        activeResources = resources;
        const persistentStorage = await persistencePromise;
        if (!isCurrent(control)) {
          return;
        }

        publish({
          status: 'ready',
          attempt: currentAttempt,
          repository,
          persistentStorage,
        });
      } catch (error) {
        if (database !== undefined && activeResources?.database !== database) {
          try {
            database.close();
          } catch {
            // The open failure remains the actionable bootstrap failure.
          }
        }

        if (!isCurrent(control)) {
          return;
        }

        publish({
          status: 'failure',
          attempt: currentAttempt,
          reason: 'storage-unavailable',
          message: errorMessage(error),
        });
      }
    })();
  };

  // `beginAttempt` publishes the same initial value, but starts all asynchronous
  // work only after every closure used by the resource has been initialized.
  beginAttempt();

  return Object.freeze({
    getSnapshot: (): AppRuntimeSnapshot => snapshot,
    subscribe(listener: AppRuntimeListener): () => void {
      if (disposed) {
        return () => undefined;
      }

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry(): void {
      if (!disposed) {
        beginAttempt();
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      generation += 1;
      disposeActiveResources();
      listeners.clear();
    },
  });
}
