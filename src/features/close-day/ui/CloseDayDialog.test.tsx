import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { localDate } from '@/shared/lib/local-date/local-date';
import {
  buildHabitOccurrence,
  buildIncompleteTaskOccurrence,
  buildOpenDay,
  buildPlannedTaskEntry,
  buildScoreBreakdown,
} from '../../../../tests/fixtures/planning';
import { nonNegativeDurationMinutes } from '@/shared/lib/ids';

import { CloseDayDialog } from './CloseDayDialog';

afterEach(cleanup);

const occurrence = buildIncompleteTaskOccurrence();
const view = {
  day: buildOpenDay(),
  tasks: [{ occurrence, membership: buildPlannedTaskEntry(), events: [] }],
  habits: [],
  score: buildScoreBreakdown(),
  plannedLoadMinutes: nonNegativeDurationMinutes(45),
  unfinishedTaskIds: [occurrence.id],
};

describe('CloseDayDialog', () => {
  it('has no default disposition and requires exact coverage', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <CloseDayDialog
        open
        view={view}
        availableMoveDates={[localDate('2026-05-21')]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const choice = screen.getByLabelText(new RegExp(occurrence.title, 'i'));
    expect(choice).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /закрыть день/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/выберите действие/i);
    expect(onSubmit).not.toHaveBeenCalled();
    await user.selectOptions(choice, 'cancel');
    await user.click(screen.getByRole('button', { name: /закрыть день/i }));
    expect(onSubmit).toHaveBeenCalledWith({ [occurrence.id]: { kind: 'cancel' } });
  });

  it('preserves invalid move drafts and validates target and positive duration', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(
      <CloseDayDialog
        open
        view={view}
        availableMoveDates={[localDate('2026-05-21')]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(new RegExp(occurrence.title, 'i')),
      'move-to-date',
    );
    await user.selectOptions(screen.getByLabelText(/дата переноса/i), '2026-05-21');
    await user.type(screen.getByLabelText(/длительность/i), '0');
    await user.click(screen.getByRole('button', { name: /закрыть день/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/больше нуля/i);
    expect(screen.getByLabelText(/дата переноса/i)).toHaveValue('2026-05-21');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks pending habits and exposes all four closure-only choices', () => {
    render(
      <CloseDayDialog
        open
        view={{ ...view, habits: [buildHabitOccurrence()] }}
        availableMoveDates={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/отметьте.*привычки/i);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options.join(' ')).toMatch(
      /оставить незавершённой.*перенести на дату.*в бэклог.*отменить/i,
    );
    expect(screen.getByRole('button', { name: /закрыть день/i })).toBeDisabled();
  });
});
