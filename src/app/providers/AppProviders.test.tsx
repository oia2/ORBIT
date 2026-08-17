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

    expect(screen.getByRole('status')).toHaveTextContent(/загружаем данные/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Репозиторий готов')).not.toBeInTheDocument();
  });

  it('provides the ready repository without any device-local storage claim', () => {
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
      harness.publish({ status: 'ready', attempt: 1, repository });
    });

    expect(screen.getByText('Репозиторий готов')).toBeInTheDocument();
    // 002 FR-015: the disclosure that plans lived only in this browser profile
    // is gone, because it no longer describes anything true.
    expect(document.querySelector('[data-od-id="persistence-status"]')).toBeNull();
    expect(screen.queryByText(/только на этом устройстве/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/хранилище сайта/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports an unreachable server as an alert, then retries to ready', () => {
    const repository = fakeRepository();
    const harness = runtimeHarness({
      status: 'failure',
      attempt: 1,
      message: 'Failed to fetch',
    });
    render(
      <AppProviders runtime={harness.runtime}>
        <RepositoryProbe expected={repository} />
      </AppProviders>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/не удалось связаться с сервером/i);
    // The raw transport message stays out of the interface; the alert says what
    // happened and offers the one action that can help.
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Репозиторий готов')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /повторить/i }));
    expect(harness.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/загружаем данные/i);

    act(() => {
      harness.publish({ status: 'ready', attempt: 2, repository });
    });

    expect(screen.getByText('Репозиторий готов')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no reload-required state, which no longer exists without IndexedDB', () => {
    const harness = runtimeHarness({ status: 'failure', attempt: 1, message: 'offline' });
    render(<AppProviders runtime={harness.runtime} />);

    expect(
      screen.queryByRole('button', { name: /перезагрузить страницу/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/другую вкладку/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /повторить/i })).toBeInTheDocument();
  });
});
