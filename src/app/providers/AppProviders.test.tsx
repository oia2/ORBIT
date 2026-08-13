import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePlanningRepository } from '@/entities/planning';
import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import type { AppRuntime, AppRuntimeSnapshot } from '../runtime/create-app-runtime';
import { localDate } from '@/shared/lib/local-date/local-date';
import { AppShell } from '../layout/AppShell';
import { AppProviders } from './AppProviders';

afterEach(cleanup);

interface RuntimeHarness {
  readonly runtime: AppRuntime;
  readonly retry: ReturnType<typeof vi.fn<() => void>>;
  readonly publish: (snapshot: AppRuntimeSnapshot) => void;
}

function runtimeHarness(initialSnapshot: AppRuntimeSnapshot): RuntimeHarness {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const publish = (nextSnapshot: AppRuntimeSnapshot): void => {
    snapshot = nextSnapshot;
    for (const listener of listeners) {
      listener();
    }
  };
  const retry = vi.fn(() => {
    publish({ status: 'initializing', attempt: snapshot.attempt + 1 });
  });

  return {
    publish,
    retry,
    runtime: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      retry,
      dispose: vi.fn(),
    },
  };
}

function fakeRepository(): PlanningRepository {
  return {} as PlanningRepository;
}

function RepositoryProbe({ expected }: { readonly expected: PlanningRepository }) {
  const repository = usePlanningRepository();
  return <span>{repository === expected ? 'Репозиторий готов' : 'Другой репозиторий'}</span>;
}

describe('AppProviders startup states', () => {
  it('announces initialization as polite status and withholds repository children', () => {
    const repository = fakeRepository();
    const harness = runtimeHarness({ status: 'initializing', attempt: 1 });

    render(
      <AppProviders runtime={harness.runtime}>
        <MemoryRouter>
          <AppShell currentDate={localDate('2026-05-20')}>
            <RepositoryProbe expected={repository} />
          </AppShell>
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/подготавливаем локальные данные/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Репозиторий готов')).not.toBeInTheDocument();
  });

  it('provides the ready repository and explains the exact device/profile boundary', () => {
    const repository = fakeRepository();
    const harness = runtimeHarness({ status: 'initializing', attempt: 1 });
    render(
      <AppProviders runtime={harness.runtime}>
        <MemoryRouter>
          <AppShell currentDate={localDate('2026-05-20')}>
            <RepositoryProbe expected={repository} />
          </AppShell>
        </MemoryRouter>
      </AppProviders>,
    );

    act(() => {
      harness.publish({
        status: 'ready',
        attempt: 1,
        repository,
        persistentStorage: 'granted',
      });
    });

    expect(screen.getByText('Репозиторий готов')).toBeInTheDocument();
    const locality = document.querySelector('[data-od-id="persistence-status"]');
    expect(locality).not.toBeNull();
    expect(locality?.closest('[data-od-id="app-rail"]')).not.toBeNull();
    expect(locality).toHaveTextContent(/только на этом устройстве/i);
    expect(locality).toHaveTextContent(/текущем профиле браузера/i);
    expect(locality).toHaveTextContent(/не синхронизируются/i);
    expect(locality).toHaveTextContent(/между обычными сеансами/i);
    expect(locality).toHaveTextContent(/пока доступно хранилище сайта/i);
    expect(locality).toHaveTextContent(/явного удаления данных сайта/i);
    expect(locality).toHaveTextContent(/приватном режиме/i);
    expect(locality).toHaveTextContent(/удаления или сброса профиля/i);
    expect(locality).toHaveTextContent(/браузер или операционная система очистят хранилище/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['denied', /браузер не предоставил постоянное хранилище/i],
    ['unsupported', /браузер не поддерживает запрос постоянного хранилища/i],
  ] as const)('keeps %s persistence state nonfatal and announces a status', (state, message) => {
    const repository = fakeRepository();
    const harness = runtimeHarness({
      status: 'ready',
      attempt: 1,
      repository,
      persistentStorage: state,
    });

    render(
      <AppProviders runtime={harness.runtime}>
        <MemoryRouter>
          <AppShell currentDate={localDate('2026-05-20')}>
            <RepositoryProbe expected={repository} />
          </AppShell>
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByText('Репозиторий готов')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('Сохранено на устройстве');
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(message)).toHaveTextContent(/только на этом устройстве/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces a blocked upgrade as an alert and retries after the other tab closes', () => {
    const harness = runtimeHarness({
      status: 'blocked',
      attempt: 1,
      currentVersion: 1,
      requestedVersion: 2,
      requiresReload: false,
    });
    render(<AppProviders runtime={harness.runtime} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /закройте или перезагрузите другую вкладку/i,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /повторить/i }));

    expect(harness.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/подготавливаем локальные данные/i);
  });

  it('requires a page reload after version change instead of retrying the stale runtime', () => {
    const reloadPage = vi.fn<() => void>();
    const harness = runtimeHarness({
      status: 'blocked',
      attempt: 2,
      currentVersion: 1,
      requestedVersion: 2,
      requiresReload: true,
    });
    render(<AppProviders runtime={harness.runtime} reloadPage={reloadPage} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/перезагрузите эту страницу/i);
    expect(screen.queryByRole('button', { name: /повторить/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /перезагрузить страницу/i }));

    expect(reloadPage).toHaveBeenCalledOnce();
    expect(harness.retry).not.toHaveBeenCalled();
  });

  it('reports storage failure as an alert without exposing IndexedDB, then retries to ready', () => {
    const repository = fakeRepository();
    const harness = runtimeHarness({
      status: 'failure',
      attempt: 1,
      reason: 'storage-unavailable',
      message: 'IndexedDB is disabled',
    });
    render(
      <AppProviders runtime={harness.runtime}>
        <RepositoryProbe expected={repository} />
      </AppProviders>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/не удалось открыть локальное хранилище/i);
    expect(screen.queryByText(/IndexedDB/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Репозиторий готов')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /повторить/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/подготавливаем локальные данные/i);
    act(() => {
      harness.publish({
        status: 'ready',
        attempt: 2,
        repository,
        persistentStorage: 'denied',
      });
    });

    expect(screen.getByText('Репозиторий готов')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('maps a terminated connection to a factual retryable alert', () => {
    const harness = runtimeHarness({
      status: 'failure',
      attempt: 1,
      reason: 'terminated',
      message: 'The IndexedDB connection was terminated',
    });
    render(<AppProviders runtime={harness.runtime} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /соединение с локальным хранилищем прервано/i,
    );
    expect(screen.queryByText(/IndexedDB/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /повторить/i }));
    expect(harness.retry).toHaveBeenCalledOnce();
  });
});
