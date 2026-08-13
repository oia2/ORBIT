import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { HistoryPage } from './HistoryPage';

afterEach(cleanup);
describe('HistoryPage', () => {
  it('offers exact read-only scales without filters, edits, workouts, or extra analytics', () => {
    const repository = {
      prepareOpenPeriod: () => new Promise(() => undefined),
    } as unknown as PlanningRepository;
    render(
      <PlanningRepositoryProvider repository={repository}>
        <HistoryPage
          clock={createFixedClock({
            instant: instant('2026-05-20T08:00:00.000Z'),
            currentLocalDate: localDate('2026-05-20'),
          })}
        />
      </PlanningRepositoryProvider>,
    );
    expect(screen.getByText(/история и динамика/i)).toBeVisible();
    expect(screen.getByRole('heading', { name: /май 2026/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'День' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Неделя' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Месяц' })).toBeVisible();
    expect(screen.queryByText(/фильтр|поиск|трениров|workout|корреляц|инсайт/i)).toBeNull();
  });
});
