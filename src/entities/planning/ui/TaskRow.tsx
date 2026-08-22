import type { ProjectedTaskMembership } from '../model/history';
import type { TaskPlanEntry } from '../model/task';
import { formatDurationMinutes } from '@/shared/lib/duration';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '@/shared/ui/dialog';
import { Icon } from '@/shared/ui/icon';

export interface TaskRowProps {
  readonly task: ProjectedTaskMembership;
  readonly actions?: ReactNode;
  /**
   * Saves the task's note. Absent means the note is read-only here — which is
   * the case wherever the period is immutable: a closed day, a completed week,
   * and History (003 FR-025).
   */
  readonly onSaveNote?: (notes: string | null) => Promise<boolean>;
}

export interface TaskNoteActionProps {
  readonly title: string;
  readonly notes?: string;
  /** Present only while the task's day is open; absent renders a read-only note. */
  readonly onSaveNote?: (notes: string | null) => Promise<boolean>;
}

/**
 * What actually happened to the task on this date. A closed day has no live
 * controls left, so the recorded disposition is the only thing that can still
 * answer "was it done?".
 */
const OUTCOME_LABELS: Record<TaskPlanEntry['outcome'], string> = {
  planned: 'Запланирована',
  completed: 'Выполнена',
  'kept-unfinished': 'Осталась незавершённой',
  moved: 'Перенесена на другую дату',
  backlogged: 'Перенесена в бэклог',
  canceled: 'Отменена при закрытии',
  deleted: 'Удалена',
};

function timeRangeLabel(startTime?: string, endTime?: string): string | undefined {
  if (startTime === undefined && endTime === undefined) return undefined;
  if (startTime !== undefined && endTime !== undefined) return `${startTime}–${endTime}`;
  return startTime ?? endTime;
}

/**
 * The reference gives time a fixed leading column so titles stay aligned whether
 * or not a task carries one; an untimed task shows a neutral placeholder.
 */
function TaskTime({ range }: { readonly range?: string }) {
  if (range === undefined) {
    return (
      <time className="orbit-task-row__time" data-empty="true" aria-hidden="true">
        —
      </time>
    );
  }
  const [start, end] = range.split('–');
  return (
    <time className="orbit-task-row__time">
      <span className="orbit-task-row__time-start">{start}</span>
      {end === undefined ? null : <span className="orbit-task-row__time-end">{end}</span>}
    </time>
  );
}

/**
 * Compact task-note action shared by every task-list surface.
 *
 * The modal keeps long text out of the row layout. Backlog and History pass no
 * save callback, so they expose the same occurrence note without silently
 * widening the open-day editing rule (003 FR-025, FR-028).
 */
export function TaskNoteAction({ title, notes, onSaveNote }: TaskNoteActionProps) {
  const noteId = useId();
  const noteTriggerRef = useRef<HTMLButtonElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const storedNote = notes ?? '';
  const [noteEditor, setNoteEditor] = useState(() => ({
    source: storedNote,
    draft: storedNote,
  }));

  // A reload, a move, or an edit elsewhere replaces the stored note. Derive
  // the visible editor from that new source immediately; the next user action
  // commits it into state without an effect-driven render cascade.
  const editorIsCurrent = noteEditor.source === storedNote;
  const draft = editorIsCurrent ? noteEditor.draft : storedNote;

  const closeNote = () => {
    setNoteEditor({ source: storedNote, draft: storedNote });
    setNoteOpen(false);
  };

  const hasNote = storedNote.trim().length > 0;
  const dirty = draft.trim() !== storedNote.trim();

  if (!hasNote && onSaveNote === undefined) return null;

  return (
    <>
      <button
        ref={noteTriggerRef}
        type="button"
        className="orbit-task-row__note-trigger"
        data-has-note={hasNote ? 'true' : 'false'}
        aria-label={`Заметка к задаче «${title}»`}
        title="Заметка"
        onClick={() => {
          setNoteOpen(true);
        }}
      >
        <Icon name="note" aria-hidden="true" />
        {hasNote ? <span className="orbit-task-row__note-mark" aria-label="есть заметка" /> : null}
      </button>
      <Dialog
        open={noteOpen}
        title="Заметка"
        description={`К задаче «${title}»`}
        onClose={closeNote}
        returnFocusRef={noteTriggerRef}
      >
        {onSaveNote === undefined ? (
          <p className="orbit-task-note-dialog__text">{storedNote}</p>
        ) : (
          <>
            <label className="visually-hidden" htmlFor={noteId}>
              Заметка к задаче «{title}»
            </label>
            <textarea
              id={noteId}
              className="orbit-task-note-dialog__textarea"
              value={draft}
              rows={6}
              onChange={(event) => {
                setNoteEditor({ source: storedNote, draft: event.target.value });
              }}
            />
            <footer className="orbit-dialog__actions">
              <button
                type="button"
                className="orbit-button"
                data-variant="quiet"
                onClick={closeNote}
              >
                Отмена
              </button>
              <button
                type="button"
                className="orbit-button"
                disabled={!dirty}
                onClick={() => {
                  void (async () => {
                    const next = draft.trim().length === 0 ? null : draft.trim();
                    if (await onSaveNote(next)) closeNote();
                  })();
                }}
              >
                Сохранить заметку
              </button>
            </footer>
          </>
        )}
      </Dialog>
    </>
  );
}

export function TaskRow({ task, actions, onSaveNote }: TaskRowProps) {
  const { occurrence, membership } = task;
  const duration =
    'plannedDurationMinutes' in occurrence ? occurrence.plannedDurationMinutes : undefined;
  const planned = membership.plannedSnapshot;
  const changedSincePlanning =
    occurrence.title !== planned.title || duration !== planned.plannedDurationMinutes;
  const timeRange = timeRangeLabel(occurrence.startTime, occurrence.endTime);
  // Only a finalized membership needs this: while the day is open the checkbox
  // already answers "was it done?", so repeating it there is noise.
  const settledOutcome = membership.finalizedAt === undefined ? undefined : membership.outcome;
  return (
    <li
      className="orbit-task-row"
      data-task-state={occurrence.state}
      {...(settledOutcome === undefined ? {} : { 'data-outcome': settledOutcome })}
      data-od-id="task-row"
    >
      <TaskTime {...(timeRange === undefined ? {} : { range: timeRange })} />
      <div className="orbit-task-row__copy">
        <strong className="orbit-task-row__title">{occurrence.title}</strong>
        {duration === undefined ? null : (
          <span className="orbit-task-row__meta">
            <span>{formatDurationMinutes(duration)}</span>
            {occurrence.isException ? <span>Изменено для этого дня</span> : null}
          </span>
        )}
        {settledOutcome === undefined ? null : (
          <span className="orbit-task-row__outcome" data-outcome={settledOutcome}>
            {OUTCOME_LABELS[settledOutcome]}
          </span>
        )}
        {changedSincePlanning ? (
          <span className="orbit-task-row__changed">
            Изначально: {planned.title}, {formatDurationMinutes(planned.plannedDurationMinutes)}
          </span>
        ) : null}
      </div>
      <div className="orbit-task-row__actions">
        <TaskNoteAction
          title={occurrence.title}
          {...(occurrence.notes === undefined ? {} : { notes: occurrence.notes })}
          {...(onSaveNote === undefined ? {} : { onSaveNote })}
        />
        {actions}
      </div>
    </li>
  );
}
