import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { PlanningRepositoryProvider } from '@/entities/planning';
import type { PlanningRepository } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';

import { createHabitBoundaryCoordinator } from '../runtime/habit-boundary';
import type { AppRuntime } from '../runtime/create-app-runtime';

export interface AppProvidersProps {
  readonly runtime: AppRuntime;
  /** Production supplies the same injected clock used by the repository. */
  readonly clock?: ApplicationClock;
  /** T027 supplies AppRouter here; bootstrap remains independently testable. */
  readonly children?: ReactNode;
}

function InitializingState() {
  return (
    <section className="orbit-runtime-state" aria-labelledby="orbit-startup-title">
      <span className="orbit-brand-mark" aria-hidden="true" />
      <h1 id="orbit-startup-title">ORBIT</h1>
      <p role="status">Загружаем данные…</p>
    </section>
  );
}

/*
 * The blocked state is gone with IndexedDB: there is no version upgrade for
 * another tab to hold open, and no connection for the browser to terminate.
 * What remains is the one honest question — the server could not be reached —
 * and the retry that asks again (002 FR-011, FR-015).
 */
function FailureState({ retry }: { readonly retry: () => void }) {
  return (
    <section
      className="orbit-runtime-state"
      role="alert"
      aria-labelledby="orbit-storage-error-title"
    >
      <h1 id="orbit-storage-error-title">Данные недоступны</h1>
      <p>Не удалось связаться с сервером ORBIT. Проверьте соединение и повторите попытку.</p>
      <button type="button" onClick={retry}>
        Повторить
      </button>
    </section>
  );
}

function ReadyRepositoryProviders({
  repository,
  clock,
  children,
}: {
  readonly repository: PlanningRepository;
  readonly clock: ApplicationClock | undefined;
  readonly children?: ReactNode;
}) {
  useEffect(() => {
    if (clock === undefined) return undefined;

    const coordinator = createHabitBoundaryCoordinator({ clock, repository });
    return () => {
      coordinator.dispose();
    };
  }, [clock, repository]);

  return (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
}

export function AppProviders({ runtime, clock, children }: AppProvidersProps) {
  const snapshot = useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.getSnapshot(),
    () => runtime.getSnapshot(),
  );

  if (snapshot.status === 'initializing') {
    return <InitializingState />;
  }
  if (snapshot.status === 'failure') {
    return (
      <FailureState
        retry={() => {
          runtime.retry();
        }}
      />
    );
  }

  return (
    <ReadyRepositoryProviders repository={snapshot.repository} clock={clock}>
      {children}
    </ReadyRepositoryProviders>
  );
}
