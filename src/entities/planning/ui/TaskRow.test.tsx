import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/* 003 US5 (FR-023 to FR-026): a row action opens the note in a modal. */
describe('003 US5: task notes', () => {
  function withNote(notes?: string) {
    const base = projection();
    return {
      ...base,
      occurrence: notes === undefined ? base.occurrence : { ...base.occurrence, notes },
    };
  }

  async function openNote() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /заметка к задаче/i }));
    return user;
  }

  it('opens an empty editable note from the row action (FR-023)', async () => {
    render(
      <ul>
        <TaskRow task={withNote()} onSaveNote={vi.fn()} />
      </ul>,
    );

    await openNote();
    expect(screen.getByRole('dialog', { name: 'Заметка' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /заметка к задаче/i })).toHaveValue('');
  });

  it('shows an existing note in the modal editor', async () => {
    render(
      <ul>
        <TaskRow task={withNote('Спросить про счёт')} onSaveNote={vi.fn()} />
      </ul>,
    );

    await openNote();
    expect(screen.getByRole('textbox', { name: /заметка к задаче/i })).toHaveValue(
      'Спросить про счёт',
    );
  });

  it('marks a task that carries a note (FR-026)', () => {
    render(
      <ul>
        <TaskRow task={withNote('Есть текст')} onSaveNote={vi.fn()} />
      </ul>,
    );

    expect(screen.getByLabelText('есть заметка')).toBeVisible();
  });

  it('does not mark a task without a note', () => {
    render(
      <ul>
        <TaskRow task={withNote()} onSaveNote={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByLabelText('есть заметка')).toBeNull();
  });

  it('saves an edited note, trimmed', async () => {
    const onSaveNote = vi.fn().mockResolvedValue(true);
    render(
      <ul>
        <TaskRow task={withNote()} onSaveNote={onSaveNote} />
      </ul>,
    );

    const user = await openNote();
    await user.type(screen.getByRole('textbox', { name: /заметка к задаче/i }), '  Новая  ');
    await user.click(screen.getByRole('button', { name: 'Сохранить заметку' }));

    expect(onSaveNote).toHaveBeenCalledWith('Новая');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clears a note by emptying it, sending null rather than an empty string', async () => {
    const onSaveNote = vi.fn().mockResolvedValue(true);
    render(
      <ul>
        <TaskRow task={withNote('Старое')} onSaveNote={onSaveNote} />
      </ul>,
    );

    const user = await openNote();
    await user.clear(screen.getByRole('textbox', { name: /заметка к задаче/i }));
    await user.click(screen.getByRole('button', { name: 'Сохранить заметку' }));

    expect(onSaveNote).toHaveBeenCalledWith(null);
  });

  it('keeps the save control inert until the note actually changes', async () => {
    render(
      <ul>
        <TaskRow task={withNote('Без изменений')} onSaveNote={vi.fn()} />
      </ul>,
    );

    await openNote();
    expect(screen.getByRole('button', { name: 'Сохранить заметку' })).toBeDisabled();
  });

  it('renders the note read-only where the period is immutable (FR-025)', async () => {
    render(
      <ul>
        <TaskRow task={withNote('Из закрытого дня')} />
      </ul>,
    );

    await openNote();

    expect(screen.getByText('Из закрытого дня')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Сохранить заметку' })).toBeNull();
  });

  it('hides the note action entirely on an immutable task that has no note', () => {
    render(
      <ul>
        <TaskRow task={withNote()} />
      </ul>,
    );

    expect(screen.queryByRole('button', { name: /заметка к задаче/i })).toBeNull();
  });
});
