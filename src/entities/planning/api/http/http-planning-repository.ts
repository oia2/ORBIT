import type { TaskOccurrenceId } from '@/shared/lib/ids';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type {
  CommandResult,
  DomainOrStorageError,
  PlanningRepository,
  QueryResult,
} from '../../model/planning-repository';

export const LOCAL_DATE_HEADER = 'X-Orbit-Local-Date';
export const INSTANT_HEADER = 'X-Orbit-Instant';

export const DEFAULT_API_BASE_URL = '/api';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpPlanningRepositoryDependencies {
  /** Relative by default, so one origin serves the app and the API (FR-016). */
  readonly baseUrl?: string;
  readonly clock: ApplicationClock;
  readonly fetch?: FetchLike;
}

function serverUnavailable(message: string): DomainOrStorageError {
  return { code: 'ServerUnavailable', message };
}

function unexpectedFailure(message: string): DomainOrStorageError {
  return { code: 'UnexpectedServerFailure', message };
}

function transportMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'The ORBIT server could not be reached';
}

/**
 * Maps a transport-level outcome to an error value.
 *
 * A `503` means the server is up but its database is not, which is the same
 * thing to the caller as an unreachable server. Everything else in this branch
 * is a fault the caller cannot act on, so it is reported as unexpected rather
 * than dressed up as a domain outcome — a failure is never presented as saved
 * work (002 FR-011).
 */
function errorForStatus(status: number, statusText: string): DomainOrStorageError {
  const detail = `${String(status)}${statusText.length > 0 ? ` ${statusText}` : ''}`;
  return status === 503
    ? serverUnavailable(`The ORBIT server is unavailable (${detail})`)
    : unexpectedFailure(`The ORBIT server returned ${detail}`);
}

interface Envelope {
  readonly ok: boolean;
}

/**
 * The browser's `PlanningRepository`: a thin forwarder and nothing more.
 *
 * It holds no cache, no queue, no local store, and no retry logic — 002 FR-002
 * and FR-023 forbid all of them. A failed call fails, visibly. Both halves of
 * the clock are read at call time and sent with every request, so the server
 * can rebuild feature 001's clock without having one of its own (FR-009).
 */
export function createHttpPlanningRepository(
  dependencies: HttpPlanningRepositoryDependencies,
): PlanningRepository {
  const baseUrl = dependencies.baseUrl ?? DEFAULT_API_BASE_URL;
  const performFetch: FetchLike =
    dependencies.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function call<TResult extends Envelope>(
    method: string,
    input: unknown,
  ): Promise<TResult | { readonly ok: false; readonly error: DomainOrStorageError }> {
    let response: Response;
    try {
      response = await performFetch(`${baseUrl}/planning/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [LOCAL_DATE_HEADER]: dependencies.clock.currentLocalDate(),
          [INSTANT_HEADER]: dependencies.clock.now(),
        },
        body: JSON.stringify(input),
      });
    } catch (error) {
      return { ok: false, error: serverUnavailable(transportMessage(error)) };
    }

    if (!response.ok) {
      return { ok: false, error: errorForStatus(response.status, response.statusText) };
    }

    try {
      // A 200 body is the repository's own envelope. It is returned unchanged:
      // re-interpreting it here would put domain meaning in two places.
      return (await response.json()) as TResult;
    } catch (error) {
      return { ok: false, error: unexpectedFailure(transportMessage(error)) };
    }
  }

  const query = <TValue>(method: string, input: unknown): Promise<QueryResult<TValue>> =>
    call<QueryResult<TValue> & Envelope>(method, input);

  const command = <TValue>(method: string, input: unknown): Promise<CommandResult<TValue>> =>
    call<CommandResult<TValue> & Envelope>(method, input);

  return {
    getWeekView: (dateOrWeekStart) => query('getWeekView', { dateOrWeekStart }),
    getDayView: (date) => query('getDayView', { date }),
    getBacklogView: () => query('getBacklogView', {}),
    getHistoryView: (historyQuery) => query('getHistoryView', historyQuery),
    getTaskHistory: (occurrenceId: TaskOccurrenceId) => query('getTaskHistory', { occurrenceId }),

    prepareOpenPeriod: (range) => command('prepareOpenPeriod', range),
    ensureCalendarWeek: (input) => command<LocalDate>('ensureCalendarWeek', input),

    addWeeklyGoal: (input) => command('addWeeklyGoal', input),
    editWeeklyGoal: (input) => command('editWeeklyGoal', input),
    reorderWeeklyGoals: (input) => command('reorderWeeklyGoals', input),
    deleteWeeklyGoal: (input) => command('deleteWeeklyGoal', input),

    createTask: (input) => command('createTask', input),
    editTaskOccurrence: (input) => command('editTaskOccurrence', input),
    setTaskCompletion: (input) => command('setTaskCompletion', input),
    moveTaskToDate: (input) => command('moveTaskToDate', input),
    moveTaskToBacklog: (input) => command('moveTaskToBacklog', input),
    deleteTaskOccurrence: (input) => command('deleteTaskOccurrence', input),
    reorderDatedTasks: (input) => command('reorderDatedTasks', input),

    createTaskSeries: (input) => command('createTaskSeries', input),
    updateTaskSeriesRule: (input) => command('updateTaskSeriesRule', input),
    stopTaskSeries: (input) => command('stopTaskSeries', input),

    createHabitDefinition: (input) => command('createHabitDefinition', input),
    updateHabitRule: (input) => command('updateHabitRule', input),
    updateHabitDuration: (input) => command('updateHabitDuration', input),
    stopHabitDefinition: (input) => command('stopHabitDefinition', input),
    editHabitOccurrence: (input) => command('editHabitOccurrence', input),
    recordHabitOutcome: (input) => command('recordHabitOutcome', input),
    correctBoundaryMissToCompleted: (input) => command('correctBoundaryMissToCompleted', input),
    clearHabitOutcome: (input) => command('clearHabitOutcome', input),
    deleteHabitOccurrence: (input) => command('deleteHabitOccurrence', input),

    saveDailyState: (input) => command('saveDailyState', input),
    closeDay: (input) => command('closeDay', input),
    reopenDay: (input) => command('reopenDay', input),
    completeWeek: (input) => command('completeWeek', input),
  };
}
