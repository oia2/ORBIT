import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { TaskRecurrenceDialog } from './TaskRecurrenceDialog';

afterEach(cleanup);

describe('TaskRecurrenceDialog', () => {
  it('validates positive duration and explains an inclusive end date', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <TaskRecurrenceDialog
        open
        clock={{
          now: () => instant('2026-05-20T08:00:00.000Z'),
          currentLocalDate: () => localDate('2026-05-20'),
        }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/название задачи/i), 'Планирование');
    await user.type(screen.getByLabelText(/длительность/i), '0');
    await user.click(screen.getByLabelText(/среда/i));
    await user.type(screen.getByLabelText(/дата начала/i), '2026-05-20');
    await user.type(screen.getByLabelText(/дата окончания/i), '2026-05-27');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/больше нуля/i);
    expect(screen.getByText(/дата окончания включительно/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refreshes the D+1 boundary after midnight and requires confirmation again', async () => {
    const user = userEvent.setup();
    let today = localDate('2026-05-20');
    const clock: ApplicationClock = {
      now: () => instant('2026-05-20T20:59:59.000Z'),
      currentLocalDate: () => today,
    };
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <TaskRecurrenceDialog
        open
        mode="update"
        clock={clock}
        initialTitle="Планирование"
        initialDuration={30}
        initialRule={{ startDate: localDate('2026-05-20'), weekdays: [3] }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onStop={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByText(/21 мая 2026/i)).toBeInTheDocument();
    today = localDate('2026-05-21');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/дата изменилась/i);
    expect(screen.getByText(/22 мая 2026/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
