import type { PlanningRepository } from '@/entities/planning';

export interface InitializingAppRuntimeSnapshot {
  readonly status: 'initializing';
  readonly attempt: number;
}

export interface FailedAppRuntimeSnapshot {
  readonly status: 'failure';
  readonly attempt: number;
  readonly message: string;
}

export interface ReadyAppRuntimeSnapshot {
  readonly status: 'ready';
  readonly attempt: number;
  readonly repository: PlanningRepository;
}

export type AppRuntimeSnapshot =
  InitializingAppRuntimeSnapshot | FailedAppRuntimeSnapshot | ReadyAppRuntimeSnapshot;

export type AppRuntimeListener = () => void;

export interface AppRuntime {
  getSnapshot(): AppRuntimeSnapshot;
  subscribe(listener: AppRuntimeListener): () => void;
  retry(): void;
  dispose(): void;
}

export interface AppRuntimeDependencies {
  /** Resolves true when the server and its database are both reachable. */
  readonly probeHealth: () => Promise<boolean>;
  readonly createRepository: () => PlanningRepository;
}

interface AttemptControl {
  readonly generation: number;
}

const UNREACHABLE_MESSAGE = 'The ORBIT server is unavailable';

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return UNREACHABLE_MESSAGE;
}

/**
 * Creates the application bootstrap resource synchronously and starts one
 * controlled health probe.
 *
 * Under feature 001 this owned an IndexedDB connection and every lifecycle
 * hazard that came with it — blocked version upgrades, `versionchange`, forced
 * termination, a persistent-storage grant. None of those exist once storage
 * lives on the server, so bootstrap is now a single question: can the server
 * and its database be reached? The answer is `ready` or `failure`, and `retry`
 * asks again. It deliberately has no React dependency.
 */
export function createAppRuntime(dependencies: AppRuntimeDependencies): AppRuntime {
  const listeners = new Set<AppRuntimeListener>();

  let disposed = false;
  let generation = 0;
  let attempt = 0;
  let snapshot: AppRuntimeSnapshot = Object.freeze({
    status: 'initializing',
    attempt: 1,
  });

  const publish = (nextSnapshot: AppRuntimeSnapshot): void => {
    if (disposed) {
      return;
    }

    snapshot = Object.freeze(nextSnapshot);
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const isCurrent = (control: AttemptControl): boolean =>
    !disposed && control.generation === generation;

  const beginAttempt = (): void => {
    generation += 1;
    attempt += 1;
    const currentAttempt = attempt;
    const control: AttemptControl = { generation };

    publish({ status: 'initializing', attempt: currentAttempt });

    void (async () => {
      try {
        const healthy = await dependencies.probeHealth();
        if (!isCurrent(control)) {
          return;
        }

        if (!healthy) {
          publish({
            status: 'failure',
            attempt: currentAttempt,
            message: UNREACHABLE_MESSAGE,
          });
          return;
        }

        publish({
          status: 'ready',
          attempt: currentAttempt,
          repository: dependencies.createRepository(),
        });
      } catch (error) {
        if (!isCurrent(control)) {
          return;
        }

        publish({
          status: 'failure',
          attempt: currentAttempt,
          message: failureMessage(error),
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
      listeners.clear();
    },
  });
}

export interface CreateHealthProbeOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

/** The single `GET /api/health` probe the client makes at bootstrap. */
export function createHealthProbe(options: CreateHealthProbeOptions = {}): () => Promise<boolean> {
  const baseUrl = options.baseUrl ?? '/api';
  const performFetch = options.fetch ?? ((input: string) => globalThis.fetch(input));

  return async (): Promise<boolean> => {
    const response = await performFetch(`${baseUrl}/health`);
    return response.ok;
  };
}
