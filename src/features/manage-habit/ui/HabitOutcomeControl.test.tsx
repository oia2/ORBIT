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
  it('records either pending outcome and supports occurrence-only deletion', async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <HabitOutcomeControl
        occurrence={pending}
        dayStatus="open"
        onRecord={onRecord}
        onCorrect={vi.fn()}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^выполнено$/i }));
    await user.click(screen.getByLabelText(/другие действия с привычкой/i));
    await user.click(screen.getByRole('button', { name: /удалить только это/i }));
    expect(onRecord).toHaveBeenCalledWith('completed');
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
        onRecord={vi.fn()}
        onCorrect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/другие действия с привычкой/i));
    expect(screen.getByRole('button', { name: /исправить.*выполнено/i })).toBeInTheDocument();
    rerender(
      <HabitOutcomeControl
        occurrence={missed}
        dayStatus="closed"
        onRecord={vi.fn()}
        onCorrect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/день закрыт/i)).toBeInTheDocument();
  });
});
