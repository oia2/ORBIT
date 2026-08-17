import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { creationSequence, durationMinutes, entityId } from '@/shared/lib/ids';

import { createOneOffTask } from '../model/task';
import { PeriodStatus } from './PeriodStatus';
import { TaskRow } from './TaskRow';

afterEach(cleanup);

function projection(changed = false) {
  const created = createOneOffTask({
    id: entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174001'),
    planEntryId: entityId<'task-plan-entry'>('123e4567-e89b-42d3-a456-426614175001'),
    title: 'План',
    placement: { kind: 'day', date: localDate('2026-05-20') },
    plannedDurationMinutes: 30,
    dayPosition: 0,
    createdSequence: creationSequence(1),
    createdAt: instant('2026-05-20T08:00:00.000Z'),
  });
  if (!created.ok || created.value.planEntries[0] === undefined) throw new Error('fixture');
  return {
    occurrence: changed
      ? { ...created.value.occurrence, title: 'Факт', plannedDurationMinutes: durationMinutes(45) }
      : created.value.occurrence,
    membership: created.value.planEntries[0],
    events: [],
  };
}

describe('planning entity presentation', () => {
  it('shows current and changed planned facts alongside supplied controls', () => {
    render(<TaskRow task={projection(true)} actions={<span>Действия</span>} />);
    expect(screen.getByRole('listitem')).toHaveTextContent(/Факт.*45 мин/i);
    expect(screen.getByText(/Изначально: План, 30 мин/i)).toBeVisible();
    expect(screen.getByText('Действия')).toBeVisible();
  });

  it('omits change and reorder copy when neither applies', () => {
    render(<TaskRow task={projection()} />);
    expect(screen.queryByText(/Изначально/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Действия')).not.toBeInTheDocument();
  });

  it('renders a finalized historical occurrence without a current duration', () => {
    const task = projection();
    render(
      <TaskRow
        task={{
          ...task,
          occurrence: {
            id: task.occurrence.id,
            title: task.occurrence.title,
            state: 'finalized',
            placement: { kind: 'none' },
            isException: task.occurrence.isException,
            createdSequence: task.occurrence.createdSequence,
            revision: task.occurrence.revision,
          },
        }}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent(/Изначально: План, 30 мин/i);
  });

  it.each([
    [{ startTime: '09:00', endTime: '10:15' }, ['09:00', '10:15']],
    [{ startTime: '09:00' }, ['09:00']],
    [{ endTime: '10:15' }, ['10:15']],
  ])('renders the optional time range %#', (times, expected) => {
    const task = projection();
    render(<TaskRow task={{ ...task, occurrence: { ...task.occurrence, ...times } }} />);
    for (const label of expected) expect(screen.getByText(label)).toBeVisible();
  });

  it('hides the disposition while the day is still open', () => {
    render(<TaskRow task={projection()} />);
    expect(
      screen.queryByText(/выполнена|осталась незавершённой|отменена/i),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['completed', 'Выполнена'],
    ['kept-unfinished', 'Осталась незавершённой'],
    ['canceled', 'Отменена при закрытии'],
  ] as const)('states the frozen %s disposition once the day is closed', (outcome, label) => {
    const task = projection();
    render(
      <TaskRow
        task={{
          ...task,
          membership: {
            ...task.membership,
            outcome,
            finalizedAt: instant('2026-05-21T00:00:00.000Z'),
          },
        }}
      />,
    );
    expect(screen.getByText(label)).toBeVisible();
  });

  it.each([
    ['open', 'Открыт'],
    ['closed', 'Закрыт'],
    ['completed', 'Завершён'],
  ] as const)('renders %s lifecycle state in text', (status, label) => {
    render(<PeriodStatus status={status} />);
    expect(screen.getByText(label)).toBeVisible();
  });
});
