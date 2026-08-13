import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { AppRouter } from './AppRouter';

const clock = createFixedClock({
  instant: instant('2026-05-20T08:00:00.000Z'),
  currentLocalDate: localDate('2026-05-20'),
});

function renderAt(path: string) {
  const repository = {
    ensureCalendarWeek: () => new Promise(() => undefined),
    prepareOpenPeriod: () => new Promise(() => undefined),
    getBacklogView: () => new Promise(() => undefined),
  } as unknown as PlanningRepository;
  window.history.replaceState(null, '', path);
  return render(
    <PlanningRepositoryProvider repository={repository}>
      <AppRouter clock={clock} />
    </PlanningRepositoryProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('AppRouter', () => {
  it('redirects root to the canonical Monday week', async () => {
    renderAt('/');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/week/2026-05-18');
    });
    expect(screen.getByRole('heading', { name: /неделя/i })).toBeInTheDocument();
  });

  it('canonicalizes a valid non-Monday week route', async () => {
    renderAt('/week/2026-05-20');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/week/2026-05-18');
    });
  });

  it.each([['/week/2026-02-30'], ['/week/not-a-date'], ['/day/2026-13-01'], ['/unknown']])(
    'renders a neutral not-found state for %s',
    (path) => {
      renderAt(path);

      expect(screen.getByRole('heading', { name: /страница не найдена/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /вернуться к текущей неделе/i })).toHaveAttribute(
        'href',
        '/week/2026-05-18',
      );
    },
  );

  it('navigates the four canonical areas with Russian labels and no workout surface', async () => {
    const user = userEvent.setup();
    renderAt('/day/2026-05-20');

    expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /^бэклог$/i }));
    expect(window.location.pathname).toBe('/backlog');
    expect(screen.getByRole('heading', { name: /бэклог/i })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /^история$/i }));
    expect(window.location.pathname).toBe('/history');
    expect(screen.getByText(/^история и динамика$/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /май 2026/i })).toBeInTheDocument();
    expect(screen.queryByText(/трениров/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/workout/i)).not.toBeInTheDocument();
  });
});
