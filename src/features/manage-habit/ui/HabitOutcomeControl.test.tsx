import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HabitOccurrence } from '@/entities/planning';
import { entityId, revision } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { HabitOutcomeControl } from './HabitOutcomeControl';

afterEach(cleanup);

const pending: HabitOccurrence = {
  id: entityId<'habit-occurrence'>('00000000-0000-4000-8000-000000000001'),
  definitionId: entityId<'habit-definition'>('00000000-0000-4000-8000-000000000002'),
  date: localDate('2026-05-20'),
  weekStart: localDate('2026-05-18'),
  definitionSnapshot: { title: 'Прогулка' },
  ruleRevision: revision(1),
  isException: false,
  outcome: 'pending',
  outcomeEvents: [],
  updatedAt: instant('2026-05-20T08:00:00.000Z'),
};

describe('HabitOutcomeControl', () => {
  it('leaves marking to the row and keeps only the overflow menu', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <HabitOutcomeControl
        occurrence={pending}
        dayStatus="open"
        onCorrect={vi.fn()}
        onDelete={onDelete}
      />,
    );
    // Marking is the row toggle; "not completed" lives in the Close Day dialog.
    expect(screen.queryByRole('button', { name: /^не выполнено$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^выполнено$/i })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/действия с привычкой/i));
    await user.click(screen.getByRole('button', { name: /^удалить$/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('offers correction only for an automatic open-day miss and disables closed facts', async () => {
    const user = userEvent.setup();
    const missed: HabitOccurrence = {
      ...pending,
      outcome: 'not-completed',
      outcomeEvents: [
        {
          ordinal: 1,
          occurredAt: instant('2026-05-21T00:00:00.000Z'),
          source: 'date-boundary',
          outcome: 'not-completed',
        },
      ],
    };
    const { rerender } = render(
      <HabitOutcomeControl
        occurrence={missed}
        dayStatus="open"
        onCorrect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/действия с привычкой/i));
    expect(screen.getByRole('button', { name: /отметить выполненной/i })).toBeInTheDocument();
    rerender(
      <HabitOutcomeControl
        occurrence={missed}
        dayStatus="closed"
        onCorrect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/день закрыт/i)).toBeInTheDocument();
  });

  it('separates stopping the recurrence from deleting a single occurrence', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(true);
    const onStopSeries = vi.fn().mockResolvedValue(true);
    render(
      <HabitOutcomeControl
        occurrence={pending}
        dayStatus="open"
        onCorrect={vi.fn()}
        onDelete={onDelete}
        onStopSeries={onStopSeries}
      />,
    );

    await user.click(screen.getByLabelText(/действия с привычкой/i));
    await user.click(screen.getByRole('button', { name: /остановить повтор/i }));
    expect(onStopSeries).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('omits the stop action when the caller supplies no series handler', async () => {
    const user = userEvent.setup();
    render(
      <HabitOutcomeControl
        occurrence={pending}
        dayStatus="open"
        onCorrect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/действия с привычкой/i));
    expect(screen.queryByRole('button', { name: /остановить повтор/i })).not.toBeInTheDocument();
  });
});
