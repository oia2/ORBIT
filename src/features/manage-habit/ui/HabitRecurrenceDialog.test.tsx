import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { HabitRecurrenceDialog } from './HabitRecurrenceDialog';

afterEach(cleanup);

describe('HabitRecurrenceDialog', () => {
  it('creates a definition with weekdays, defaulting the start date without asking the user', async () => {
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
    expect(screen.queryByLabelText(/дата начала/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/дата окончания/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/название привычки/i), 'Прогулка');
    await user.click(screen.getByLabelText(/среда/i));
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Прогулка',
      // 003 FR-029: the duration is optional, and an empty field means none.
      durationMinutes: null,
      rule: { startDate: localDate('2026-05-20'), weekdays: [3] },
    });
  });

  it('selects and deselects all weekdays at once', async () => {
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
    const selectAll = screen.getByLabelText(/выбрать все дни/i);
    await user.click(selectAll);
    expect(screen.getByLabelText(/среда/i)).toBeChecked();
    expect(screen.getByLabelText(/воскресенье/i)).toBeChecked();
    await user.click(screen.getByLabelText(/среда/i));
    expect(selectAll).not.toBeChecked();
    expect(screen.getByLabelText(/воскресенье/i)).toBeChecked();
    expect(screen.getByLabelText(/среда/i)).not.toBeChecked();
  });

  it('announces that the change takes effect on the current date', () => {
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
      />,
    );
    // A habit's rule change reaches today, so a weekday added here shows up at
    // once rather than a day later.
    expect(screen.getByText(/20 мая 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/21 мая 2026/i)).not.toBeInTheDocument();
    // Stopping a recurrence now lives in the habit row's menu, not this dialog.
    expect(screen.queryByRole('button', { name: /остановить повтор/i })).not.toBeInTheDocument();
  });
});

/*
 * 003 US6 (FR-029). The duration is optional and lives beside the recurrence,
 * because that is where the owner already goes to describe the habit.
 */
describe('003 US6: optional habit duration', () => {
  const clock = createFixedClock({
    instant: instant('2026-05-20T08:00:00.000Z'),
    currentLocalDate: localDate('2026-05-20'),
  });

  it('submits a duration when one is entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<HabitRecurrenceDialog open clock={clock} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/название привычки/i), 'Тренировка');
    await user.type(screen.getByLabelText(/длительность/i), '45');
    await user.click(screen.getByLabelText('Среда'));
    await user.click(screen.getByRole('button', { name: /сохранить/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Тренировка', durationMinutes: 45 }),
    );
  });

  it('pre-fills an existing duration', () => {
    render(
      <HabitRecurrenceDialog
        open
        mode="update"
        clock={clock}
        initialTitle="Тренировка"
        initialDurationMinutes={30}
        initialRule={{ startDate: localDate('2026-05-20'), weekdays: [3] }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/длительность/i)).toHaveValue(30);
  });

  it('clears the duration when the field is emptied', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <HabitRecurrenceDialog
        open
        mode="update"
        clock={clock}
        initialTitle="Тренировка"
        initialDurationMinutes={30}
        initialRule={{ startDate: localDate('2026-05-20'), weekdays: [3] }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByLabelText(/длительность/i));
    await user.click(screen.getByRole('button', { name: /сохранить/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: null }));
  });

  it('rejects a non-positive duration without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HabitRecurrenceDialog open clock={clock} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/название привычки/i), 'Тренировка');
    await user.type(screen.getByLabelText(/длительность/i), '0');
    await user.click(screen.getByLabelText('Среда'));
    await user.click(screen.getByRole('button', { name: /сохранить/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/больше нуля/i)).toBeVisible();
  });

  it('says the duration affects load and not the result', () => {
    render(<HabitRecurrenceDialog open clock={clock} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByText(/плановую нагрузку/i)).toBeVisible();
    expect(screen.getByText(/на результат не влияет/i)).toBeVisible();
  });
});
