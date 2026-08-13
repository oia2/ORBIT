import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { HabitRecurrenceDialog } from './HabitRecurrenceDialog';

afterEach(cleanup);

describe('HabitRecurrenceDialog', () => {
  it('creates a definition with weekdays and an inclusive end', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <HabitRecurrenceDialog
        open
        clock={createFixedClock({
          instant: instant('2026-05-20T08:00:00.000Z'),
          currentLocalDate: localDate('2026-05-20'),
        })}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/название привычки/i), 'Прогулка');
    await user.type(screen.getByLabelText(/дата начала/i), '2026-05-20');
    await user.type(screen.getByLabelText(/дата окончания/i), '2026-05-27');
    await user.click(screen.getByLabelText(/среда/i));
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Прогулка',
      rule: { startDate: localDate('2026-05-20'), endDate: localDate('2026-05-27'), weekdays: [3] },
    });
  });

  it('offers update and stop with the final D+1 boundary', () => {
    render(
      <HabitRecurrenceDialog
        open
        mode="update"
        clock={createFixedClock({
          instant: instant('2026-05-20T08:00:00.000Z'),
          currentLocalDate: localDate('2026-05-20'),
        })}
        initialTitle="Прогулка"
        initialRule={{ startDate: localDate('2026-05-20'), weekdays: [3] }}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onStop={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByText(/21 мая 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /остановить повтор/i })).toBeInTheDocument();
  });
});
