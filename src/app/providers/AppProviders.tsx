import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { PlanningRepositoryProvider } from '@/entities/planning';
import type { PlanningRepository } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';

import { createHabitBoundaryCoordinator } from '../runtime/habit-boundary';
import type {
  AppRuntime,
  BlockedAppRuntimeSnapshot,
  FailedAppRuntimeSnapshot,
} from '../runtime/create-app-runtime';
import { PersistenceStatusContext } from './PersistenceStatusContext';

export interface AppProvidersProps {
  readonly runtime: AppRuntime;
  /** Production supplies the same injected clock used by the repository. */
  readonly clock?: ApplicationClock;
  /** T027 supplies AppRouter here; bootstrap remains independently testable. */
  readonly children?: ReactNode;
  /** Injectable so reload-required behavior is deterministic in component tests. */
  readonly reloadPage?: () => void;
}

function reloadCurrentPage(): void {
  globalThis.location.reload();
}

function InitializingState() {
  return (
    <section className="orbit-runtime-state" aria-labelledby="orbit-startup-title">
      <span className="orbit-brand-mark" aria-hidden="true" />
      <h1 id="orbit-startup-title">ORBIT</h1>
      <p role="status">Подготавливаем локальные данные…</p>
    </section>
  );
}

function BlockedState({
  snapshot,
  retry,
  reloadPage,
}: {
  readonly snapshot: BlockedAppRuntimeSnapshot;
  readonly retry: () => void;
  readonly reloadPage: () => void;
}) {
  if (snapshot.requiresReload) {
    return (
      <section className="orbit-runtime-state" role="alert" aria-labelledby="orbit-blocked-title">
        <h1 id="orbit-blocked-title">Нужно перезагрузить ORBIT</h1>
        <p>Версия локального хранилища изменилась. Перезагрузите эту страницу, чтобы продолжить.</p>
        <button type="button" onClick={reloadPage}>
          Перезагрузить страницу
        </button>
      </section>
    );
  }

  return (
    <section className="orbit-runtime-state" role="alert" aria-labelledby="orbit-blocked-title">
      <h1 id="orbit-blocked-title">Обновление ожидает другую вкладку</h1>
      <p>
        Закройте или перезагрузите другую вкладку ORBIT, затем повторите попытку на этой странице.
      </p>
      <button type="button" onClick={retry}>
        Повторить
      </button>
    </section>
  );
}

function FailureState({
  snapshot,
  retry,
}: {
  readonly snapshot: FailedAppRuntimeSnapshot;
  readonly retry: () => void;
}) {
  const message =
    snapshot.reason === 'terminated'
      ? 'Соединение с локальным хранилищем прервано. Повторите попытку.'
      : 'Не удалось открыть локальное хранилище планов. Проверьте доступ к данным сайта в браузере и повторите попытку.';

  return (
    <section
      className="orbit-runtime-state"
      role="alert"
      aria-labelledby="orbit-storage-error-title"
    >
      <h1 id="orbit-storage-error-title">Локальные данные недоступны</h1>
      <p>{message}</p>
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

export function AppProviders({
  runtime,
  clock,
  children,
  reloadPage = reloadCurrentPage,
}: AppProvidersProps) {
  const snapshot = useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.getSnapshot(),
    () => runtime.getSnapshot(),
  );

  if (snapshot.status === 'initializing') {
    return <InitializingState />;
  }
  if (snapshot.status === 'blocked') {
    return (
      <BlockedState
        snapshot={snapshot}
        retry={() => {
          runtime.retry();
        }}
        reloadPage={reloadPage}
      />
    );
  }
  if (snapshot.status === 'failure') {
    return (
      <FailureState
        snapshot={snapshot}
        retry={() => {
          runtime.retry();
        }}
      />
    );
  }

  return (
    <PersistenceStatusContext.Provider value={snapshot.persistentStorage}>
      <ReadyRepositoryProviders repository={snapshot.repository} clock={clock}>
        {children}
      </ReadyRepositoryProviders>
    </PersistenceStatusContext.Provider>
  );
}
