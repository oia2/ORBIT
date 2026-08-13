import type { IDBPDatabase, IDBPTransaction } from 'idb';

import {
  creationSequence,
  eventSequence,
  generateEntityId,
  nextCreationSequence,
  nextEventSequence,
  nextRevision,
  revision,
  type DayPosition,
  type DurationMinutes,
  type EntityId,
  type CreationSequence,
  type EventSequence,
} from '@/shared/lib/ids';
import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import {
  getLocalDateParts,
  localDateFromParts,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import type { Revision } from '@/shared/lib/ids';

import { prepareDailyStateUpdate, type Day, type ScoreBreakdown } from '../../model/day';
import { prepareDayClosure, type DayClosureError } from '../../model/day-closure';
import {
  catchUpHabitDateBoundary,
  correctBoundaryMissToCompleted as prepareBoundaryMissCorrection,
  deleteHabitOccurrence as prepareHabitOccurrenceDeletion,
  recordHabitOutcome as prepareHabitOutcome,
  type HabitDefinition,
  type HabitOccurrence,
  type HabitTransitionError,
} from '../../model/habit';
import type {
  BacklogView,
  DayPlanningFacts,
  DayView,
  HistoryDateRange,
  TaskHistoryView,
  WeekView,
} from '../../model/history';
import { deriveHistoryDateRange } from '../../model/history';
import type {
  CommandResult,
  DomainOrStorageError,
  OpenPeriodRange,
  PlanningRepository,
  QueryResult,
} from '../../model/planning-repository';
import { planOccurrenceMaterialization } from '../../model/occurrence-materialization';
import { selectDaySignals, selectHistoryView } from '../../model/selectors';
import { prepareWeekCompletion, type WeekCompletionError } from '../../model/week-completion';
import {
  applyRecurrenceRuleChange,
  createInitialRecurrenceVersion,
  stopRecurrence,
  validateRecurrenceRule,
  validateRecurringTaskTemplate,
  type RecurrenceValidationError,
} from '../../model/recurrence';
import type {
  BacklogTaskOccurrence,
  DeletedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
  TaskValueSnapshot,
} from '../../model/task';
import type { Week, WeeklyGoal } from '../../model/week';
import {
  fromStoredTaskEvent,
  fromStoredTaskOccurrence,
  fromStoredTaskPlanEntry,
  fromStoredTaskSeries,
  toStoredHabitDefinition,
  toStoredHabitOccurrence,
  toStoredTaskEvent,
  toStoredTaskOccurrence,
  toStoredTaskPlanEntry,
  toStoredTaskSeries,
  toStoredWeek,
} from './mappers';
import type { OrbitPlanningDB, OrbitStoreName } from './schema';

export interface IndexedDbPlanningRepositoryDependencies {
  readonly clock: ApplicationClock;
  readonly generateUuid?: () => string;
}

export interface RepositoryAuditContext {
  readonly id: string;
  readonly occurredAt: Instant;
}

export type DisposablePlanningRepository = PlanningRepository & {
  readonly auditContext: () => RepositoryAuditContext;
  readonly dispose: () => void;
};

type OrbitWriteTransaction = IDBPTransaction<OrbitPlanningDB, OrbitStoreName[], 'readwrite'>;

async function runAtomic<T>(
  database: IDBPDatabase<OrbitPlanningDB>,
  stores: readonly OrbitStoreName[],
  work: (transaction: OrbitWriteTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction([...stores], 'readwrite');

  try {
    const value = await work(transaction);
    await transaction.done;
    return value;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have aborted because an IDB request failed.
    }

    try {
      await transaction.done;
    } catch {
      // Preserve the domain/storage error that caused the abort.
    }

    throw error;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

function normalizeStorageError(error: unknown): DomainOrStorageError {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return { code: 'QuotaExceeded', message: errorMessage(error) };
    }

    if (error.name === 'InvalidStateError' || error.name === 'SecurityError') {
      return { code: 'StorageUnavailable', message: errorMessage(error) };
    }
  }

  return { code: 'UnexpectedStorageFailure', message: errorMessage(error) };
}

function revisionGuard(
  actualRevision: Revision,
  expectedRevision: Revision,
): DomainOrStorageError | undefined {
  return actualRevision === expectedRevision
    ? undefined
    : {
        code: 'RevisionConflict',
        expectedRevision,
        actualRevision,
      };
}

function mutableDayGuard(
  status: 'open' | 'closed',
  date: LocalDate,
): DomainOrStorageError | undefined {
  return status === 'open' ? undefined : { code: 'PeriodImmutable', date };
}

async function allocateNextCreationSequence(
  transaction: OrbitWriteTransaction,
): Promise<CreationSequence> {
  const cursor = await transaction
    .objectStore('taskOccurrences')
    .index('by-created-sequence')
    .openCursor(null, 'prev');

  return cursor === null ? creationSequence(1) : nextCreationSequence(cursor.value.createdSequence);
}

async function allocateNextEventSequence(
  transaction: OrbitWriteTransaction,
): Promise<EventSequence> {
  const cursor = await transaction.objectStore('taskEvents').openKeyCursor(null, 'prev');
  return cursor === null ? eventSequence(1) : nextEventSequence(eventSequence(cursor.primaryKey));
}

interface AtomicCommandValue<T> {
  readonly value: T;
  readonly affectedDates: readonly LocalDate[];
  readonly affectedWeeks: readonly LocalDate[];
}

class DomainFailure extends Error {
  constructor(readonly error: DomainOrStorageError) {
    super(error.code);
  }
}

function unavailableScore(): ScoreBreakdown {
  return {
    task: { completed: 0, applicable: 0, rate: 'unavailable' },
    habit: { completed: 0, applicable: 0, rate: 'unavailable' },
    value: 'unavailable',
    weightsApplied: { task: 0, habit: 0 },
  };
}

function canonicalRequiredText(value: string, field: string): string {
  const canonical = value.trim();
  if (canonical.length === 0) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field, message: `${field} must not be blank` }],
    });
  }
  return canonical;
}

function isPositiveDuration(value: unknown): value is DurationMinutes {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isDayPositionValue(value: unknown): value is DayPosition {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function plannedEntry(entry: TaskPlanEntry): TaskPlanEntry {
  return {
    id: entry.id,
    occurrenceId: entry.occurrenceId,
    date: entry.date,
    weekStart: entry.weekStart,
    plannedSnapshot: entry.plannedSnapshot,
    enteredAt: entry.enteredAt,
    outcome: 'planned',
  };
}

function datesForOpenPeriod(range: OpenPeriodRange): readonly LocalDate[] {
  switch (range.kind) {
    case 'day':
      return [range.date];
    case 'week':
      return weekDates(startOfWeek(range.weekStart));
    case 'month': {
      const { year, month } = getLocalDateParts(range.anchorDate);
      const dates: LocalDate[] = [];
      for (let day = 1; day <= 31; day += 1) {
        try {
          dates.push(localDateFromParts(year, month, day));
        } catch {
          break;
        }
      }
      return dates;
    }
  }
}

function recurrenceValidationFailure(errors: readonly RecurrenceValidationError[]): DomainFailure {
  return new DomainFailure({
    code: 'ValidationFailure',
    issues: errors.map((error) => ({ field: error.field, message: error.code })),
  });
}

function habitTransitionFailure(error: HabitTransitionError): DomainFailure {
  if (error.code === 'PeriodImmutable') {
    return new DomainFailure(error);
  }
  return new DomainFailure({
    code: 'InvalidTransition',
    entity: 'HabitOccurrence',
    currentState: error.currentOutcome,
    attemptedTransition: error.attemptedTransition,
  });
}

function dayClosureFailure(error: DayClosureError): DomainFailure {
  switch (error.code) {
    case 'PeriodImmutable':
    case 'FutureDayClosure':
    case 'PendingHabitOutcomes':
    case 'ClosureDispositionMismatch':
    case 'MoveTargetClosed':
      return new DomainFailure(error);
    case 'InvalidClosureDestination':
      if (error.reason === 'non-positive-duration' || error.reason === 'invalid-day-position') {
        return new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            {
              field: error.reason === 'non-positive-duration' ? 'durationMinutes' : 'dayPosition',
              message:
                error.reason === 'non-positive-duration'
                  ? 'Dated tasks require a positive duration'
                  : 'Dated tasks require a position',
            },
          ],
        });
      }
      return new DomainFailure({
        code: 'InvalidTransition',
        entity: 'TaskOccurrence',
        currentState: `day:${error.destinationDate}`,
        attemptedTransition: 'closure-move-to-same-date',
      });
    case 'InvalidClosureDisposition':
      return new DomainFailure({
        code: 'InvalidTransition',
        entity: 'TaskOccurrence',
        currentState: 'incomplete',
        attemptedTransition: 'close-day',
      });
    case 'DestinationPlanEntryIdRequired':
    case 'ClosureDataInvariant':
      return new DomainFailure({
        code: 'UnexpectedStorageFailure',
        message:
          error.code === 'ClosureDataInvariant'
            ? error.message
            : `Destination membership ID missing for ${error.occurrenceId}`,
      });
  }
}

function weekCompletionFailure(error: WeekCompletionError): DomainFailure {
  switch (error.code) {
    case 'PeriodImmutable':
    case 'WeekNotClosable':
      return new DomainFailure(error);
    case 'WeekDaysMismatch':
      return new DomainFailure({
        code: 'UnexpectedStorageFailure',
        message: `Week ${error.weekStart} does not own exactly its seven calendar days`,
      });
  }
}

class IndexedDbPlanningRepository implements DisposablePlanningRepository {
  readonly getWeekView: PlanningRepository['getWeekView'] = async (dateOrWeekStart) =>
    this.executeQuery(async () => {
      const weekStart = startOfWeek(dateOrWeekStart);
      const week = await this.database.get('weeks', weekStart);
      if (week === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: weekStart });
      }

      const days = await this.database.getAllFromIndex('days', 'by-weekStart', weekStart);
      const summaries = await Promise.all(
        days
          .slice()
          .sort((left, right) => left.date.localeCompare(right.date))
          .map(async (day) => {
            const facts = await this.readDayFacts(day);
            return {
              date: day.date,
              status: day.status,
              score: facts.score,
              plannedLoadMinutes: facts.plannedLoadMinutes,
            };
          }),
      );

      const view: WeekView = {
        week,
        days: summaries,
        progress:
          week.status === 'completed' ? week.completionSnapshot.progress : unavailableScore(),
      };
      return view;
    });

  readonly getDayView: PlanningRepository['getDayView'] = async (date) =>
    this.executeQuery(async () => {
      const day = await this.database.get('days', date);
      if (day === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: date });
      }
      const facts = await this.readDayFacts(day);
      const view: DayView = {
        ...facts,
        unfinishedTaskIds: facts.tasks
          .filter(({ occurrence }) =>
            occurrence.state === 'active' &&
            occurrence.placement.kind === 'day' &&
            'completion' in occurrence
              ? occurrence.completion === 'incomplete'
              : false,
          )
          .map(({ occurrence }) => occurrence.id),
      };
      return view;
    });

  readonly getBacklogView: PlanningRepository['getBacklogView'] = async () =>
    this.executeQuery(async () => {
      const range = IDBKeyRange.bound(['backlog', 0], ['backlog', Number.MAX_SAFE_INTEGER]);
      const stored = await this.database.getAllFromIndex(
        'taskOccurrences',
        'by-placement-created',
        range,
      );
      const view: BacklogView = {
        tasks: stored
          .map(fromStoredTaskOccurrence)
          .filter((task) => task.state === 'active' && task.placement.kind === 'backlog'),
      };
      return view;
    });

  readonly getHistoryView: PlanningRepository['getHistoryView'] = async (query) => {
    let range: HistoryDateRange;
    try {
      range = deriveHistoryDateRange(query);
    } catch (error) {
      if (error instanceof RangeError && query.mode === 'month') {
        return {
          ok: false,
          error: {
            code: 'ValidationFailure',
            issues: [
              {
                field: 'selectedDate',
                message: 'Selected date must belong to the anchor month',
              },
            ],
          },
        };
      }
      return { ok: false, error: normalizeStorageError(error) };
    }

    return this.executeQuery(async () => {
      const transaction = this.database.transaction(
        ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents', 'habitOccurrences'],
        'readonly',
      );
      const dateRange = IDBKeyRange.bound(range.startDate, range.endDate);
      const weekStarts = [...new Set(range.dates.map((date) => startOfWeek(date)))];

      const [days, storedPlanEntries, habitOccurrences, optionalWeeks] = await Promise.all([
        transaction.objectStore('days').getAll(dateRange),
        transaction.objectStore('taskPlanEntries').index('by-date').getAll(dateRange),
        transaction.objectStore('habitOccurrences').index('by-date').getAll(dateRange),
        Promise.all(weekStarts.map((weekStart) => transaction.objectStore('weeks').get(weekStart))),
      ]);
      const taskPlanEntries = storedPlanEntries.map(fromStoredTaskPlanEntry);
      const occurrenceIds = [
        ...new Set(taskPlanEntries.map((membership) => membership.occurrenceId)),
      ];
      const [optionalStoredOccurrences, storedEventGroups] = await Promise.all([
        Promise.all(
          occurrenceIds.map((occurrenceId) =>
            transaction.objectStore('taskOccurrences').get(occurrenceId),
          ),
        ),
        Promise.all(
          occurrenceIds.map((occurrenceId) =>
            transaction
              .objectStore('taskEvents')
              .index('by-occurrence-sequence')
              .getAll(
                IDBKeyRange.bound([occurrenceId, 0], [occurrenceId, Number.MAX_SAFE_INTEGER]),
              ),
          ),
        ),
      ]);
      await transaction.done;

      return selectHistoryView({
        query,
        weeks: optionalWeeks.filter((week) => week !== undefined),
        days,
        taskOccurrences: optionalStoredOccurrences
          .filter((occurrence) => occurrence !== undefined)
          .map(fromStoredTaskOccurrence),
        taskPlanEntries,
        taskEvents: storedEventGroups.flat().map(fromStoredTaskEvent),
        habitOccurrences,
      });
    });
  };

  readonly getTaskHistory: PlanningRepository['getTaskHistory'] = async (occurrenceId) =>
    this.executeQuery(async () => {
      const storedOccurrence = await this.database.get('taskOccurrences', occurrenceId);
      if (storedOccurrence === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'TaskOccurrence',
          id: occurrenceId,
        });
      }
      const memberships = (
        await this.database.getAllFromIndex(
          'taskPlanEntries',
          'by-occurrence-date',
          IDBKeyRange.bound([occurrenceId, ''], [occurrenceId, '\uffff']),
        )
      ).map(fromStoredTaskPlanEntry);
      const events = (
        await this.database.getAllFromIndex(
          'taskEvents',
          'by-occurrence-sequence',
          IDBKeyRange.bound([occurrenceId, 0], [occurrenceId, Number.MAX_SAFE_INTEGER]),
        )
      ).map(fromStoredTaskEvent);
      const view: TaskHistoryView = {
        occurrence: fromStoredTaskOccurrence(storedOccurrence),
        memberships,
        events,
      };
      return view;
    });

  readonly prepareOpenPeriod: PlanningRepository['prepareOpenPeriod'] = async (range) => {
    const requestedDates = datesForOpenPeriod(range);
    return this.executeCommand(
      [
        'weeks',
        'days',
        'taskSeries',
        'taskOccurrences',
        'taskPlanEntries',
        'taskEvents',
        'habitDefinitions',
        'habitOccurrences',
      ],
      async (transaction) => {
        const dayStore = transaction.objectStore('days');
        const weekStore = transaction.objectStore('weeks');
        const taskSeriesStore = transaction.objectStore('taskSeries');
        const taskOccurrenceStore = transaction.objectStore('taskOccurrences');
        const taskPlanEntryStore = transaction.objectStore('taskPlanEntries');
        const taskEventStore = transaction.objectStore('taskEvents');
        const habitDefinitionStore = transaction.objectStore('habitDefinitions');
        const habitOccurrenceStore = transaction.objectStore('habitOccurrences');

        const openDays = new Map<LocalDate, Extract<Day, { readonly status: 'open' }>>();
        for (const date of requestedDates) {
          const day = await dayStore.get(date);
          if (day?.status !== 'open') continue;
          const week = await weekStore.get(day.weekStart);
          if (week?.status !== 'open') continue;
          openDays.set(date, day);
        }
        const openDates = [...openDays.keys()];
        if (openDates.length === 0) {
          return { value: undefined, affectedDates: [], affectedWeeks: [] };
        }

        const taskSeries = (await taskSeriesStore.getAll()).map(fromStoredTaskSeries);
        const habitDefinitions = await habitDefinitionStore.getAll();
        const taskOccurrences = new Map<string, TaskOccurrence>();
        const taskPlanEntries = new Map<string, TaskPlanEntry>();
        const habitOccurrences = new Map<string, HabitOccurrence>();

        for (const date of openDates) {
          for (const entry of await taskPlanEntryStore.index('by-date').getAll(date)) {
            taskPlanEntries.set(entry.id, entry);
          }
          for (const occurrence of await habitOccurrenceStore.index('by-date').getAll(date)) {
            habitOccurrences.set(occurrence.id, occurrence);
          }
          const placedRange = IDBKeyRange.bound(
            [`day:${date}`, 0],
            [`day:${date}`, Number.MAX_SAFE_INTEGER],
          );
          for (const stored of await taskOccurrenceStore
            .index('by-placement-created')
            .getAll(placedRange)) {
            const occurrence = fromStoredTaskOccurrence(stored);
            taskOccurrences.set(occurrence.id, occurrence);
          }
          for (const series of taskSeries) {
            const stored = await taskOccurrenceStore.index('by-series-date').get([series.id, date]);
            if (stored !== undefined) {
              const occurrence = fromStoredTaskOccurrence(stored);
              taskOccurrences.set(occurrence.id, occurrence);
            }
          }
        }

        const taskEvents = new Map<string, TaskEvent>();
        for (const occurrence of taskOccurrences.values()) {
          const events = await taskEventStore
            .index('by-occurrence-sequence')
            .getAll(
              IDBKeyRange.bound([occurrence.id, 0], [occurrence.id, Number.MAX_SAFE_INTEGER]),
            );
          for (const event of events) taskEvents.set(event.id, event);
        }

        const effects = planOccurrenceMaterialization({
          openDates,
          currentLocalDate: this.dependencies.clock.currentLocalDate(),
          taskSeries,
          habitDefinitions,
          taskOccurrences: [...taskOccurrences.values()],
          taskPlanEntries: [...taskPlanEntries.values()],
          taskEvents: [...taskEvents.values()],
          habitOccurrences: [...habitOccurrences.values()],
        });
        const changedDates = new Set<LocalDate>();
        const now = this.dependencies.clock.now();

        for (const effect of effects.removeTaskBundles) {
          const occurrence = taskOccurrences.get(effect.occurrenceId);
          if (occurrence?.nominalDate !== undefined) changedDates.add(occurrence.nominalDate);
          await taskPlanEntryStore.delete(effect.planEntryId);
          await taskOccurrenceStore.delete(effect.occurrenceId);
          taskOccurrences.delete(effect.occurrenceId);
        }
        for (const effect of effects.removeHabitOccurrences) {
          const occurrence = habitOccurrences.get(effect.occurrenceId);
          if (occurrence !== undefined) changedDates.add(occurrence.date);
          await habitOccurrenceStore.delete(effect.occurrenceId);
          habitOccurrences.delete(effect.occurrenceId);
        }

        let nextCreatedSequence =
          effects.createTaskBundles.length === 0
            ? undefined
            : await allocateNextCreationSequence(transaction);
        for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
          if (nextCreatedSequence === undefined) {
            throw new Error('Creation sequence was not allocated');
          }
          const occurrenceId = this.nextId<'task-occurrence'>();
          const entryId = this.nextId<'task-plan-entry'>();
          const occurrence: IncompleteDatedTaskOccurrence = {
            id: occurrenceId,
            seriesId: effect.seriesId,
            nominalDate: effect.nominalDate,
            ruleRevision: effect.ruleRevision,
            title: effect.title,
            ...(effect.notes === undefined ? {} : { notes: effect.notes }),
            plannedDurationMinutes: effect.plannedDurationMinutes,
            isException: false,
            createdSequence: nextCreatedSequence,
            revision: revision(0),
            state: 'active',
            placement: effect.placement,
            dayPosition: effect.dayPosition,
            completion: 'incomplete',
          };
          const entry: TaskPlanEntry = {
            id: entryId,
            occurrenceId,
            date: effect.membership.date,
            weekStart: effect.membership.weekStart,
            plannedSnapshot: effect.membership.plannedSnapshot,
            enteredAt: now,
            outcome: 'planned',
          };
          await taskOccurrenceStore.add(toStoredTaskOccurrence(occurrence));
          await taskPlanEntryStore.add(toStoredTaskPlanEntry(entry));
          taskOccurrences.set(occurrence.id, occurrence);
          taskPlanEntries.set(entry.id, entry);
          changedDates.add(effect.nominalDate);
          if (effectIndex < effects.createTaskBundles.length - 1) {
            nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
          }
        }

        for (const effect of effects.createHabitOccurrences) {
          const occurrence: HabitOccurrence = {
            id: this.nextId<'habit-occurrence'>(),
            definitionId: effect.definitionId,
            date: effect.date,
            weekStart: effect.weekStart,
            definitionSnapshot: effect.definitionSnapshot,
            ruleRevision: effect.ruleRevision,
            isException: false,
            outcome: 'pending',
            outcomeEvents: [],
            updatedAt: now,
          };
          await habitOccurrenceStore.add(toStoredHabitOccurrence(occurrence));
          habitOccurrences.set(occurrence.id, occurrence);
          changedDates.add(effect.date);
        }

        for (const occurrence of habitOccurrences.values()) {
          const day = openDays.get(occurrence.date);
          if (day === undefined) continue;
          const transition = catchUpHabitDateBoundary({
            occurrence,
            dayStatus: day.status,
            clock: this.dependencies.clock,
          });
          if (!transition.ok) throw habitTransitionFailure(transition.error);
          if (transition.value.changed) {
            await habitOccurrenceStore.put(toStoredHabitOccurrence(transition.value.occurrence));
            changedDates.add(occurrence.date);
          }
        }

        const affectedWeeks = new Map<LocalDate, Extract<Week, { readonly status: 'open' }>>();
        for (const date of changedDates) {
          const day = openDays.get(date);
          if (day === undefined) continue;
          await dayStore.put({ ...day, revision: nextRevision(day.revision) });
          const week = await weekStore.get(day.weekStart);
          if (week?.status === 'open') affectedWeeks.set(week.startDate, week);
        }
        for (const week of affectedWeeks.values()) {
          await weekStore.put({ ...week, revision: nextRevision(week.revision) });
        }

        return {
          value: undefined,
          affectedDates: [...changedDates].sort(),
          affectedWeeks: [...affectedWeeks.keys()].sort(),
        };
      },
    );
  };

  readonly ensureCalendarWeek: PlanningRepository['ensureCalendarWeek'] = async ({ date }) => {
    const weekStart = startOfWeek(date);
    return this.executeCommand(['weeks', 'days'], async (transaction) => {
      const weeksStore = transaction.objectStore('weeks');
      const daysStore = transaction.objectStore('days');
      const existingWeek = await weeksStore.get(weekStart);
      const createdDates: LocalDate[] = [];

      if (existingWeek === undefined) {
        const week: Week = {
          startDate: weekStart,
          status: 'open',
          goals: [],
          revision: revision(0),
        };
        await weeksStore.add(week);
      }

      for (const ownedDate of weekDates(weekStart)) {
        if ((await daysStore.get(ownedDate)) === undefined) {
          const day: Day = {
            date: ownedDate,
            weekStart,
            status: 'open',
            revision: revision(0),
          };
          await daysStore.add(day);
          createdDates.push(ownedDate);
        }
      }

      return {
        value: weekStart,
        affectedDates: createdDates,
        affectedWeeks: existingWeek === undefined ? [weekStart] : [],
      };
    });
  };

  readonly addWeeklyGoal: PlanningRepository['addWeeklyGoal'] = async (input) => {
    let statement: string;
    try {
      statement = canonicalRequiredText(input.statement, 'statement');
    } catch (error) {
      return this.commandError(error);
    }
    return this.executeCommand(['weeks'], async (transaction) => {
      const store = transaction.objectStore('weeks');
      const week = await store.get(input.weekStart);
      this.requireOpenWeek(week, input.weekStart, input.expectedRevision);
      const context = this.auditContext();
      const goalId = this.nextId<'weekly-goal'>();
      const goal: WeeklyGoal = {
        id: goalId,
        statement,
        createdAt: context.occurredAt,
        updatedAt: context.occurredAt,
      };
      await store.put({
        ...week,
        goals: [...week.goals, goal],
        revision: nextRevision(week.revision),
      });
      return { value: goalId, affectedDates: [], affectedWeeks: [input.weekStart] };
    });
  };

  readonly editWeeklyGoal: PlanningRepository['editWeeklyGoal'] = async (input) => {
    let statement: string;
    try {
      statement = canonicalRequiredText(input.statement, 'statement');
    } catch (error) {
      return this.commandError(error);
    }
    return this.executeCommand(['weeks'], async (transaction) => {
      const store = transaction.objectStore('weeks');
      const week = await store.get(input.weekStart);
      this.requireOpenWeek(week, input.weekStart, input.expectedRevision);
      const index = week.goals.findIndex((goal) => goal.id === input.goalId);
      if (index < 0) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'WeeklyGoal',
          id: input.goalId,
        });
      }
      const goals = week.goals.slice();
      const current = goals[index];
      if (current === undefined) throw new Error('Goal index disappeared');
      goals[index] = { ...current, statement, updatedAt: this.dependencies.clock.now() };
      await store.put({ ...week, goals, revision: nextRevision(week.revision) });
      return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
    });
  };

  readonly reorderWeeklyGoals: PlanningRepository['reorderWeeklyGoals'] = async (input) =>
    this.executeCommand(['weeks'], async (transaction) => {
      const store = transaction.objectStore('weeks');
      const week = await store.get(input.weekStart);
      this.requireOpenWeek(week, input.weekStart, input.expectedRevision);
      const goalsById = new Map(week.goals.map((goal) => [goal.id, goal]));
      if (
        input.orderedGoalIds.length !== week.goals.length ||
        new Set(input.orderedGoalIds).size !== input.orderedGoalIds.length ||
        input.orderedGoalIds.some((id) => !goalsById.has(id))
      ) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [{ field: 'orderedGoalIds', message: 'Goal order must contain every goal once' }],
        });
      }
      const goals = input.orderedGoalIds.map((id) => {
        const goal = goalsById.get(id);
        if (goal === undefined) throw new Error('Validated goal is missing');
        return goal;
      });
      await store.put({ ...week, goals, revision: nextRevision(week.revision) });
      return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
    });

  readonly deleteWeeklyGoal: PlanningRepository['deleteWeeklyGoal'] = async (input) =>
    this.executeCommand(['weeks'], async (transaction) => {
      const store = transaction.objectStore('weeks');
      const week = await store.get(input.weekStart);
      this.requireOpenWeek(week, input.weekStart, input.expectedRevision);
      if (!week.goals.some((goal) => goal.id === input.goalId)) {
        throw new DomainFailure({ code: 'NotFound', entity: 'WeeklyGoal', id: input.goalId });
      }
      await store.put({
        ...week,
        goals: week.goals.filter((goal) => goal.id !== input.goalId),
        revision: nextRevision(week.revision),
      });
      return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
    });

  readonly createTask: PlanningRepository['createTask'] = async (input) => {
    let title: string;
    try {
      title = canonicalRequiredText(input.title, 'title');
      if (input.placement.kind === 'day' && !isPositiveDuration(input.durationMinutes)) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            { field: 'durationMinutes', message: 'Dated tasks require a positive duration' },
          ],
        });
      }
      if (input.placement.kind === 'day' && !isDayPositionValue(input.dayPosition)) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [{ field: 'dayPosition', message: 'Dated tasks require a position' }],
        });
      }
      if (input.durationMinutes !== undefined && !isPositiveDuration(input.durationMinutes)) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
        });
      }
    } catch (error) {
      return this.commandError(error);
    }

    return this.executeCommand(
      ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents'],
      async (transaction) => {
        const occurrenceId = this.nextId<'task-occurrence'>();
        const createdSequenceValue = await allocateNextCreationSequence(transaction);
        const occurredAt = this.dependencies.clock.now();
        const affectedDates: LocalDate[] = [];
        const affectedWeeks: LocalDate[] = [];

        let occurrence: TaskOccurrence;
        let planEntry: TaskPlanEntry | undefined;
        if (input.placement.kind === 'day') {
          const day = await transaction.objectStore('days').get(input.placement.date);
          if (day === undefined) {
            throw new DomainFailure({
              code: 'NotFound',
              entity: 'Day',
              id: input.placement.date,
            });
          }
          const week = await transaction.objectStore('weeks').get(day.weekStart);
          this.requireOpenDay(day);
          this.requireOpenWeek(week, day.weekStart);
          const duration = input.durationMinutes;
          const position = input.dayPosition;
          if (!isPositiveDuration(duration) || !isDayPositionValue(position)) {
            throw new Error('Validated dated task values disappeared');
          }
          occurrence = {
            id: occurrenceId,
            title,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            isException: false,
            createdSequence: createdSequenceValue,
            revision: revision(0),
            state: 'active',
            placement: input.placement,
            plannedDurationMinutes: duration,
            dayPosition: position,
            completion: 'incomplete',
          };
          planEntry = {
            id: this.nextId<'task-plan-entry'>(),
            occurrenceId,
            date: input.placement.date,
            weekStart: day.weekStart,
            plannedSnapshot: {
              title,
              ...(input.notes === undefined ? {} : { notes: input.notes }),
              plannedDurationMinutes: duration,
            },
            enteredAt: occurredAt,
            outcome: 'planned',
          };
          await transaction.objectStore('days').put({
            ...day,
            revision: nextRevision(day.revision),
          });
          await transaction.objectStore('weeks').put({
            ...week,
            revision: nextRevision(week.revision),
          });
          affectedDates.push(day.date);
          affectedWeeks.push(day.weekStart);
        } else {
          occurrence = {
            id: occurrenceId,
            title,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            isException: false,
            createdSequence: createdSequenceValue,
            revision: revision(0),
            state: 'active',
            placement: { kind: 'backlog' },
            ...(input.durationMinutes === undefined
              ? {}
              : { plannedDurationMinutes: input.durationMinutes }),
          };
        }

        await transaction.objectStore('taskOccurrences').add(toStoredTaskOccurrence(occurrence));
        if (planEntry !== undefined) {
          await transaction.objectStore('taskPlanEntries').add(toStoredTaskPlanEntry(planEntry));
        }
        const sequence = await allocateNextEventSequence(transaction);
        const event: TaskEvent = {
          id: this.nextId<'task-event'>(),
          sequence,
          occurrenceId,
          ...(planEntry === undefined ? {} : { planEntryId: planEntry.id }),
          effectiveDate:
            input.placement.kind === 'day'
              ? input.placement.date
              : this.dependencies.clock.currentLocalDate(),
          occurredAt,
          type: 'create',
          payload: {
            created: this.taskValueSnapshot(occurrence),
            placement: occurrence.placement,
          },
        };
        await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));

        return { value: occurrenceId, affectedDates, affectedWeeks };
      },
    );
  };

  readonly editTaskOccurrence: PlanningRepository['editTaskOccurrence'] = async (input) =>
    this.executeCommand(['weeks', 'days', 'taskOccurrences', 'taskEvents'], async (transaction) => {
      const store = transaction.objectStore('taskOccurrences');
      const stored = await store.get(input.occurrenceId);
      if (stored === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'TaskOccurrence',
          id: input.occurrenceId,
        });
      }
      const occurrence = fromStoredTaskOccurrence(stored);
      const guard = revisionGuard(occurrence.revision, input.expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
      if (occurrence.state === 'deleted' || occurrence.state === 'finalized') {
        throw new DomainFailure({
          code: 'InvalidTransition',
          entity: 'TaskOccurrence',
          currentState: occurrence.state,
          attemptedTransition: 'edit',
        });
      }

      let title = occurrence.title;
      if (input.title !== undefined) {
        title = canonicalRequiredText(input.title, 'title');
      }
      const duration = input.durationMinutes ?? occurrence.plannedDurationMinutes;
      if (occurrence.placement.kind === 'day' && !isPositiveDuration(duration)) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            { field: 'durationMinutes', message: 'Dated tasks require a positive duration' },
          ],
        });
      }
      if (duration !== undefined && !isPositiveDuration(duration)) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
        });
      }

      const updated = {
        ...occurrence,
        title,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(duration === undefined ? {} : { plannedDurationMinutes: duration }),
        isException: occurrence.seriesId === undefined ? occurrence.isException : true,
        revision: nextRevision(occurrence.revision),
      } as TaskOccurrence;
      const affectedDates: LocalDate[] = [];
      const affectedWeeks: LocalDate[] = [];
      if (occurrence.placement.kind === 'day') {
        const day = await transaction.objectStore('days').get(occurrence.placement.date);
        if (day === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'Day',
            id: occurrence.placement.date,
          });
        }
        this.requireOpenDay(day);
        const week = await transaction.objectStore('weeks').get(day.weekStart);
        this.requireOpenWeek(week, day.weekStart);
        await transaction.objectStore('days').put({
          ...day,
          revision: nextRevision(day.revision),
        });
        await transaction.objectStore('weeks').put({
          ...week,
          revision: nextRevision(week.revision),
        });
        affectedDates.push(day.date);
        affectedWeeks.push(day.weekStart);
      }

      await store.put(toStoredTaskOccurrence(updated));
      const sequence = await allocateNextEventSequence(transaction);
      const eventBase = {
        id: this.nextId<'task-event'>(),
        sequence,
        occurrenceId: occurrence.id,
        ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
        effectiveDate:
          occurrence.placement.kind === 'day'
            ? occurrence.placement.date
            : this.dependencies.clock.currentLocalDate(),
        occurredAt: this.dependencies.clock.now(),
      };
      const event: TaskEvent =
        occurrence.seriesId === undefined
          ? {
              ...eventBase,
              type: 'edit',
              payload: {
                before: this.taskValueSnapshot(occurrence),
                after: this.taskValueSnapshot(updated),
              },
            }
          : {
              ...eventBase,
              seriesId: occurrence.seriesId,
              type: 'occurrence-exception',
              payload: {
                before: this.taskValueSnapshot(occurrence),
                after: this.taskValueSnapshot(updated),
              },
            };
      await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));
      return { value: undefined, affectedDates, affectedWeeks };
    });

  readonly setTaskCompletion: PlanningRepository['setTaskCompletion'] = async (input) =>
    this.executeCommand(
      ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents'],
      async (transaction) => {
        const occurrenceStore = transaction.objectStore('taskOccurrences');
        const stored = await occurrenceStore.get(input.occurrenceId);
        if (stored === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskOccurrence',
            id: input.occurrenceId,
          });
        }
        const occurrence = fromStoredTaskOccurrence(stored);
        const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
        if (revisionError !== undefined) throw new DomainFailure(revisionError);
        if (
          occurrence.state !== 'active' ||
          occurrence.placement.kind !== 'day' ||
          !('completion' in occurrence) ||
          occurrence.placement.date !== input.date
        ) {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: `${occurrence.state}/${occurrence.placement.kind}`,
            attemptedTransition: input.completed ? 'completion-checked' : 'completion-unchecked',
          });
        }
        if (
          (input.completed && occurrence.completion === 'completed') ||
          (!input.completed && occurrence.completion === 'incomplete')
        ) {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: occurrence.completion,
            attemptedTransition: input.completed ? 'completion-checked' : 'completion-unchecked',
          });
        }
        const day = await transaction.objectStore('days').get(input.date);
        if (day === undefined) {
          throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
        }
        this.requireOpenDay(day);
        const week = await transaction.objectStore('weeks').get(day.weekStart);
        this.requireOpenWeek(week, day.weekStart);
        const entryStore = transaction.objectStore('taskPlanEntries');
        const entry = await entryStore.index('by-occurrence-date').get([occurrence.id, input.date]);
        if (entry === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskPlanEntry',
            id: `${occurrence.id}/${input.date}`,
          });
        }
        const occurredAt = this.dependencies.clock.now();
        let updated: TaskOccurrence;
        if (input.completed) {
          updated = {
            ...occurrence,
            completion: 'completed',
            actualCompletedAt: occurredAt,
            revision: nextRevision(occurrence.revision),
          };
        } else {
          if (occurrence.completion !== 'completed') {
            throw new Error('Validated completed occurrence disappeared');
          }
          const { actualCompletedAt: _actualCompletedAt, ...withoutActual } = occurrence;
          void _actualCompletedAt;
          updated = {
            ...withoutActual,
            completion: 'incomplete',
            revision: nextRevision(occurrence.revision),
          };
        }
        await occurrenceStore.put(toStoredTaskOccurrence(updated));
        await entryStore.put(
          toStoredTaskPlanEntry(
            input.completed
              ? { ...plannedEntry(entry), outcome: 'completed' }
              : plannedEntry(entry),
          ),
        );
        await transaction.objectStore('days').put({
          ...day,
          revision: nextRevision(day.revision),
        });
        await transaction.objectStore('weeks').put({
          ...week,
          revision: nextRevision(week.revision),
        });
        const sequence = await allocateNextEventSequence(transaction);
        const event: TaskEvent = input.completed
          ? {
              id: this.nextId<'task-event'>(),
              sequence,
              occurrenceId: occurrence.id,
              planEntryId: entry.id,
              effectiveDate: input.date,
              occurredAt,
              type: 'completion-checked',
              payload: { date: input.date },
            }
          : {
              id: this.nextId<'task-event'>(),
              sequence,
              occurrenceId: occurrence.id,
              planEntryId: entry.id,
              effectiveDate: input.date,
              occurredAt,
              type: 'completion-unchecked',
              payload: { date: input.date },
            };
        await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));
        return {
          value: undefined,
          affectedDates: [day.date],
          affectedWeeks: [day.weekStart],
        };
      },
    );

  readonly moveTaskToDate: PlanningRepository['moveTaskToDate'] = async (input) => {
    if (!isPositiveDuration(input.durationMinutes)) {
      return this.commandError(
        new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            { field: 'durationMinutes', message: 'Dated tasks require a positive duration' },
          ],
        }),
      );
    }
    if (!isDayPositionValue(input.dayPosition)) {
      return this.commandError(
        new DomainFailure({
          code: 'ValidationFailure',
          issues: [{ field: 'dayPosition', message: 'Dated tasks require a position' }],
        }),
      );
    }

    return this.executeCommand(
      ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents'],
      async (transaction) => {
        const occurrenceStore = transaction.objectStore('taskOccurrences');
        const stored = await occurrenceStore.get(input.occurrenceId);
        if (stored === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskOccurrence',
            id: input.occurrenceId,
          });
        }
        const occurrence = fromStoredTaskOccurrence(stored);
        const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
        if (revisionError !== undefined) throw new DomainFailure(revisionError);
        if (occurrence.state !== 'active') {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: occurrence.state,
            attemptedTransition: 'move-to-date',
          });
        }
        if (
          occurrence.placement.kind === 'day' &&
          (!('completion' in occurrence) || occurrence.completion !== 'incomplete')
        ) {
          throw new DomainFailure({
            code: 'TaskMustBeIncompleteToMove',
            occurrenceId: occurrence.id,
          });
        }
        if (
          occurrence.placement.kind === 'day' &&
          occurrence.placement.date === input.destinationDate
        ) {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: `day:${occurrence.placement.date}`,
            attemptedTransition: `move-to-same-date:${input.destinationDate}`,
          });
        }

        const destinationDay = await transaction.objectStore('days').get(input.destinationDate);
        if (destinationDay === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'Day',
            id: input.destinationDate,
          });
        }
        if (destinationDay.status !== 'open') {
          throw new DomainFailure({
            code: 'MoveTargetClosed',
            destinationDate: input.destinationDate,
          });
        }
        const destinationWeek = await transaction
          .objectStore('weeks')
          .get(destinationDay.weekStart);
        if (destinationWeek?.status !== 'open') {
          throw new DomainFailure({
            code: 'MoveTargetClosed',
            destinationDate: input.destinationDate,
          });
        }

        const entryStore = transaction.objectStore('taskPlanEntries');
        let sourceDay: Extract<Day, { readonly status: 'open' }> | undefined;
        let sourceWeek: Extract<Week, { readonly status: 'open' }> | undefined;
        let sourceEntry: TaskPlanEntry | undefined;
        if (occurrence.placement.kind === 'day') {
          const source = await transaction.objectStore('days').get(occurrence.placement.date);
          if (source === undefined) {
            throw new DomainFailure({
              code: 'NotFound',
              entity: 'Day',
              id: occurrence.placement.date,
            });
          }
          this.requireOpenDay(source);
          sourceDay = source;
          const owningWeek = await transaction.objectStore('weeks').get(source.weekStart);
          this.requireOpenWeek(owningWeek, source.weekStart);
          sourceWeek = owningWeek;
          sourceEntry = await entryStore
            .index('by-occurrence-date')
            .get([occurrence.id, source.date]);
          if (sourceEntry === undefined) {
            throw new DomainFailure({
              code: 'NotFound',
              entity: 'TaskPlanEntry',
              id: `${occurrence.id}/${source.date}`,
            });
          }
        }

        const existingDestination = await entryStore
          .index('by-occurrence-date')
          .get([occurrence.id, input.destinationDate]);
        const occurredAt = this.dependencies.clock.now();
        const destinationEntry: TaskPlanEntry =
          existingDestination === undefined
            ? {
                id: this.nextId<'task-plan-entry'>(),
                occurrenceId: occurrence.id,
                date: input.destinationDate,
                weekStart: destinationDay.weekStart,
                plannedSnapshot: {
                  title: occurrence.title,
                  ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
                  plannedDurationMinutes: input.durationMinutes,
                },
                enteredAt: occurredAt,
                outcome: 'planned',
              }
            : plannedEntry(existingDestination);

        if (sourceEntry !== undefined) {
          await entryStore.put(
            toStoredTaskPlanEntry({
              ...sourceEntry,
              outcome: 'moved',
              destination: { kind: 'day', date: input.destinationDate },
            }),
          );
        }
        await entryStore.put(toStoredTaskPlanEntry(destinationEntry));
        const updated: IncompleteDatedTaskOccurrence = {
          ...occurrence,
          state: 'active',
          placement: { kind: 'day', date: input.destinationDate },
          plannedDurationMinutes: input.durationMinutes,
          dayPosition: input.dayPosition,
          completion: 'incomplete',
          revision: nextRevision(occurrence.revision),
        };
        await occurrenceStore.put(toStoredTaskOccurrence(updated));

        const affectedDays = new Map<LocalDate, Extract<Day, { readonly status: 'open' }>>();
        if (sourceDay !== undefined) affectedDays.set(sourceDay.date, sourceDay);
        affectedDays.set(destinationDay.date, destinationDay);
        for (const day of affectedDays.values()) {
          await transaction.objectStore('days').put({
            ...day,
            revision: nextRevision(day.revision),
          });
        }
        const affectedWeekRecords = new Map<
          LocalDate,
          Extract<Week, { readonly status: 'open' }>
        >();
        if (sourceWeek !== undefined) affectedWeekRecords.set(sourceWeek.startDate, sourceWeek);
        affectedWeekRecords.set(destinationWeek.startDate, destinationWeek);
        for (const week of affectedWeekRecords.values()) {
          await transaction.objectStore('weeks').put({
            ...week,
            revision: nextRevision(week.revision),
          });
        }

        const sequence = await allocateNextEventSequence(transaction);
        const event: TaskEvent =
          occurrence.placement.kind === 'backlog'
            ? {
                id: this.nextId<'task-event'>(),
                sequence,
                occurrenceId: occurrence.id,
                planEntryId: destinationEntry.id,
                effectiveDate: input.destinationDate,
                occurredAt,
                type: 'schedule-from-backlog',
                payload: {
                  from: { kind: 'backlog' },
                  destination: { kind: 'day', date: input.destinationDate },
                },
              }
            : {
                id: this.nextId<'task-event'>(),
                sequence,
                occurrenceId: occurrence.id,
                planEntryId: destinationEntry.id,
                effectiveDate: input.destinationDate,
                occurredAt,
                type: 'move-to-date',
                payload: {
                  from: occurrence.placement,
                  destination: { kind: 'day', date: input.destinationDate },
                },
              };
        await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));
        return {
          value: undefined,
          affectedDates: [...affectedDays.keys()],
          affectedWeeks: [...affectedWeekRecords.keys()],
        };
      },
    );
  };

  readonly moveTaskToBacklog: PlanningRepository['moveTaskToBacklog'] = async (input) =>
    this.executeCommand(
      ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents'],
      async (transaction) => {
        const occurrenceStore = transaction.objectStore('taskOccurrences');
        const stored = await occurrenceStore.get(input.occurrenceId);
        if (stored === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskOccurrence',
            id: input.occurrenceId,
          });
        }
        const occurrence = fromStoredTaskOccurrence(stored);
        const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
        if (revisionError !== undefined) throw new DomainFailure(revisionError);
        if (
          occurrence.state !== 'active' ||
          occurrence.placement.kind !== 'day' ||
          !('completion' in occurrence)
        ) {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: `${occurrence.state}/${occurrence.placement.kind}`,
            attemptedTransition: 'move-to-backlog',
          });
        }
        if (occurrence.completion !== 'incomplete') {
          throw new DomainFailure({
            code: 'TaskMustBeIncompleteToMove',
            occurrenceId: occurrence.id,
          });
        }
        const day = await transaction.objectStore('days').get(occurrence.placement.date);
        if (day === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'Day',
            id: occurrence.placement.date,
          });
        }
        this.requireOpenDay(day);
        const week = await transaction.objectStore('weeks').get(day.weekStart);
        this.requireOpenWeek(week, day.weekStart);
        const entryStore = transaction.objectStore('taskPlanEntries');
        const entry = await entryStore.index('by-occurrence-date').get([occurrence.id, day.date]);
        if (entry === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskPlanEntry',
            id: `${occurrence.id}/${day.date}`,
          });
        }
        const updated: BacklogTaskOccurrence = {
          ...occurrence,
          state: 'active',
          placement: { kind: 'backlog' },
          revision: nextRevision(occurrence.revision),
        };
        await occurrenceStore.put(toStoredTaskOccurrence(updated));
        await entryStore.put(
          toStoredTaskPlanEntry({
            ...entry,
            outcome: 'backlogged',
            destination: { kind: 'backlog' },
          }),
        );
        await transaction.objectStore('days').put({
          ...day,
          revision: nextRevision(day.revision),
        });
        await transaction.objectStore('weeks').put({
          ...week,
          revision: nextRevision(week.revision),
        });
        const sequence = await allocateNextEventSequence(transaction);
        const event: TaskEvent = {
          id: this.nextId<'task-event'>(),
          sequence,
          occurrenceId: occurrence.id,
          planEntryId: entry.id,
          effectiveDate: day.date,
          occurredAt: this.dependencies.clock.now(),
          type: 'move-to-backlog',
          payload: {
            from: { kind: 'day', date: day.date },
            destination: { kind: 'backlog' },
          },
        };
        await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));
        return {
          value: undefined,
          affectedDates: [day.date],
          affectedWeeks: [day.weekStart],
        };
      },
    );

  readonly deleteTaskOccurrence: PlanningRepository['deleteTaskOccurrence'] = async (input) =>
    this.executeCommand(
      ['weeks', 'days', 'taskOccurrences', 'taskPlanEntries', 'taskEvents'],
      async (transaction) => {
        const occurrenceStore = transaction.objectStore('taskOccurrences');
        const stored = await occurrenceStore.get(input.occurrenceId);
        if (stored === undefined) {
          throw new DomainFailure({
            code: 'NotFound',
            entity: 'TaskOccurrence',
            id: input.occurrenceId,
          });
        }
        const occurrence = fromStoredTaskOccurrence(stored);
        const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
        if (revisionError !== undefined) throw new DomainFailure(revisionError);
        if (occurrence.state === 'deleted' || occurrence.state === 'finalized') {
          throw new DomainFailure({
            code: 'InvalidTransition',
            entity: 'TaskOccurrence',
            currentState: occurrence.state,
            attemptedTransition: 'delete',
          });
        }

        const entryStore = transaction.objectStore('taskPlanEntries');
        const entries = await entryStore
          .index('by-occurrence-date')
          .getAll(IDBKeyRange.bound([occurrence.id, ''], [occurrence.id, '\uffff']));
        const affectedDays = new Map<LocalDate, Extract<Day, { readonly status: 'open' }>>();
        const affectedWeeks = new Map<LocalDate, Extract<Week, { readonly status: 'open' }>>();
        for (const entry of entries) {
          const day = await transaction.objectStore('days').get(entry.date);
          if (day === undefined || day.status === 'closed') continue;
          affectedDays.set(day.date, day);
          const week = await transaction.objectStore('weeks').get(day.weekStart);
          if (week?.status === 'open') {
            affectedWeeks.set(week.startDate, week);
          }
          await entryStore.put(
            toStoredTaskPlanEntry({
              id: entry.id,
              occurrenceId: entry.occurrenceId,
              date: entry.date,
              weekStart: entry.weekStart,
              plannedSnapshot: entry.plannedSnapshot,
              enteredAt: entry.enteredAt,
              outcome: 'deleted',
            }),
          );
        }
        for (const day of affectedDays.values()) {
          await transaction.objectStore('days').put({
            ...day,
            revision: nextRevision(day.revision),
          });
        }
        for (const week of affectedWeeks.values()) {
          await transaction.objectStore('weeks').put({
            ...week,
            revision: nextRevision(week.revision),
          });
        }

        const deleted: DeletedTaskOccurrence = {
          id: occurrence.id,
          ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
          ...(occurrence.nominalDate === undefined ? {} : { nominalDate: occurrence.nominalDate }),
          ...(occurrence.ruleRevision === undefined
            ? {}
            : { ruleRevision: occurrence.ruleRevision }),
          title: occurrence.title,
          ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
          isException: occurrence.isException,
          createdSequence: occurrence.createdSequence,
          revision: nextRevision(occurrence.revision),
          state: 'deleted',
          placement: { kind: 'none' },
          ...(occurrence.plannedDurationMinutes === undefined
            ? {}
            : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
        };
        await occurrenceStore.put(toStoredTaskOccurrence(deleted));
        const sequence = await allocateNextEventSequence(transaction);
        const event: TaskEvent = {
          id: this.nextId<'task-event'>(),
          sequence,
          occurrenceId: occurrence.id,
          effectiveDate: this.dependencies.clock.currentLocalDate(),
          occurredAt: this.dependencies.clock.now(),
          type: 'delete',
          payload: { previousPlacement: occurrence.placement },
        };
        await transaction.objectStore('taskEvents').add(toStoredTaskEvent(event));
        return {
          value: undefined,
          affectedDates: [...affectedDays.keys()],
          affectedWeeks: [...affectedWeeks.keys()],
        };
      },
    );

  readonly reorderDatedTasks: PlanningRepository['reorderDatedTasks'] = async (input) =>
    this.executeCommand(['weeks', 'days', 'taskOccurrences'], async (transaction) => {
      const day = await transaction.objectStore('days').get(input.date);
      if (day === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
      }
      this.requireOpenDay(day, input.expectedDayRevision);
      const week = await transaction.objectStore('weeks').get(day.weekStart);
      this.requireOpenWeek(week, day.weekStart);
      const range = IDBKeyRange.bound(
        [`day:${input.date}`, 0],
        [`day:${input.date}`, Number.MAX_SAFE_INTEGER],
      );
      const stored = await transaction
        .objectStore('taskOccurrences')
        .index('by-placement-created')
        .getAll(range);
      const current = stored
        .map(fromStoredTaskOccurrence)
        .filter(
          (occurrence) =>
            occurrence.state === 'active' &&
            occurrence.placement.kind === 'day' &&
            occurrence.placement.date === input.date,
        );
      const byId = new Map(current.map((occurrence) => [occurrence.id, occurrence]));
      if (
        input.orderedOccurrenceIds.length !== current.length ||
        new Set(input.orderedOccurrenceIds).size !== input.orderedOccurrenceIds.length ||
        input.orderedOccurrenceIds.some((id) => !byId.has(id))
      ) {
        throw new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            {
              field: 'orderedOccurrenceIds',
              message: 'Dated order must contain every current task once',
            },
          ],
        });
      }
      for (const [position, occurrenceId] of input.orderedOccurrenceIds.entries()) {
        const occurrence = byId.get(occurrenceId);
        if (occurrence?.state !== 'active' || occurrence.placement.kind !== 'day') {
          throw new Error('Validated dated occurrence is missing');
        }
        await transaction.objectStore('taskOccurrences').put(
          toStoredTaskOccurrence({
            ...occurrence,
            dayPosition: position as DayPosition,
            revision: nextRevision(occurrence.revision),
          }),
        );
      }
      await transaction.objectStore('days').put({
        ...day,
        revision: nextRevision(day.revision),
      });
      await transaction.objectStore('weeks').put({
        ...week,
        revision: nextRevision(week.revision),
      });
      return {
        value: undefined,
        affectedDates: [input.date],
        affectedWeeks: [day.weekStart],
      };
    });

  readonly createTaskSeries: PlanningRepository['createTaskSeries'] = async (input) => {
    let title: string;
    try {
      title = canonicalRequiredText(input.template.title, 'title');
      const templateValidation = validateRecurringTaskTemplate(input.template);
      if (!templateValidation.ok) throw recurrenceValidationFailure(templateValidation.error);
      const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
      if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);
    } catch (error) {
      return this.commandError(error);
    }

    return this.executeCommand(['taskSeries'], async (transaction) => {
      const initialRevision = revision(0);
      const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
      if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);
      const series: TaskSeries = {
        id: this.nextId<'task-series'>(),
        template: {
          title,
          ...(input.template.notes === undefined ? {} : { notes: input.template.notes }),
          plannedDurationMinutes: input.template.plannedDurationMinutes,
        },
        ruleVersions: [initialVersion.value],
        revision: initialRevision,
      };
      await transaction.objectStore('taskSeries').add(toStoredTaskSeries(series));
      return { value: series.id, affectedDates: [], affectedWeeks: [] };
    });
  };

  readonly updateTaskSeriesRule: PlanningRepository['updateTaskSeriesRule'] = async (input) => {
    const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
    if (!ruleValidation.ok)
      return this.commandError(recurrenceValidationFailure(ruleValidation.error));
    return this.executeCommand(['taskSeries'], async (transaction) => {
      const store = transaction.objectStore('taskSeries');
      const stored = await store.get(input.seriesId);
      if (stored === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'TaskSeries', id: input.seriesId });
      }
      const series = fromStoredTaskSeries(stored);
      const guard = revisionGuard(series.revision, input.expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
      const updatedRevision = nextRevision(series.revision);
      const versions = applyRecurrenceRuleChange({
        ruleVersions: series.ruleVersions,
        currentLocalDate: this.dependencies.clock.currentLocalDate(),
        revision: updatedRevision,
        nextRule: ruleValidation.value,
      });
      if (!versions.ok) throw recurrenceValidationFailure(versions.error);
      await store.put(
        toStoredTaskSeries({
          ...series,
          ruleVersions: versions.value,
          revision: updatedRevision,
        }),
      );
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });
  };

  readonly stopTaskSeries: PlanningRepository['stopTaskSeries'] = async (input) =>
    this.executeCommand(['taskSeries'], async (transaction) => {
      const store = transaction.objectStore('taskSeries');
      const stored = await store.get(input.seriesId);
      if (stored === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'TaskSeries', id: input.seriesId });
      }
      const series = fromStoredTaskSeries(stored);
      const guard = revisionGuard(series.revision, input.expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
      const updatedRevision = nextRevision(series.revision);
      await store.put(
        toStoredTaskSeries({
          ...series,
          ruleVersions: stopRecurrence({
            ruleVersions: series.ruleVersions,
            currentLocalDate: this.dependencies.clock.currentLocalDate(),
            revision: updatedRevision,
          }),
          revision: updatedRevision,
        }),
      );
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

  readonly createHabitDefinition: PlanningRepository['createHabitDefinition'] = async (input) => {
    let title: string;
    try {
      title = canonicalRequiredText(input.title, 'title');
      const validation = validateRecurrenceRule(input.recurrenceRule);
      if (!validation.ok) throw recurrenceValidationFailure(validation.error);
    } catch (error) {
      return this.commandError(error);
    }
    return this.executeCommand(['habitDefinitions'], async (transaction) => {
      const initialRevision = revision(0);
      const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
      if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);
      const definition: HabitDefinition = {
        id: this.nextId<'habit-definition'>(),
        title,
        ruleVersions: [initialVersion.value],
        revision: initialRevision,
      };
      await transaction.objectStore('habitDefinitions').add(toStoredHabitDefinition(definition));
      return { value: definition.id, affectedDates: [], affectedWeeks: [] };
    });
  };

  readonly updateHabitRule: PlanningRepository['updateHabitRule'] = async (input) => {
    const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
    if (!ruleValidation.ok)
      return this.commandError(recurrenceValidationFailure(ruleValidation.error));
    return this.executeCommand(['habitDefinitions'], async (transaction) => {
      const store = transaction.objectStore('habitDefinitions');
      const definition = await store.get(input.definitionId);
      if (definition === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'HabitDefinition',
          id: input.definitionId,
        });
      }
      const guard = revisionGuard(definition.revision, input.expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
      const updatedRevision = nextRevision(definition.revision);
      const versions = applyRecurrenceRuleChange({
        ruleVersions: definition.ruleVersions,
        currentLocalDate: this.dependencies.clock.currentLocalDate(),
        revision: updatedRevision,
        nextRule: ruleValidation.value,
      });
      if (!versions.ok) throw recurrenceValidationFailure(versions.error);
      await store.put(
        toStoredHabitDefinition({
          ...definition,
          ruleVersions: versions.value,
          revision: updatedRevision,
        }),
      );
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });
  };

  readonly stopHabitDefinition: PlanningRepository['stopHabitDefinition'] = async (input) =>
    this.executeCommand(['habitDefinitions'], async (transaction) => {
      const store = transaction.objectStore('habitDefinitions');
      const definition = await store.get(input.definitionId);
      if (definition === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'HabitDefinition',
          id: input.definitionId,
        });
      }
      const guard = revisionGuard(definition.revision, input.expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
      const updatedRevision = nextRevision(definition.revision);
      await store.put(
        toStoredHabitDefinition({
          ...definition,
          ruleVersions: stopRecurrence({
            ruleVersions: definition.ruleVersions,
            currentLocalDate: this.dependencies.clock.currentLocalDate(),
            revision: updatedRevision,
          }),
          revision: updatedRevision,
        }),
      );
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

  readonly editHabitOccurrence: PlanningRepository['editHabitOccurrence'] = async (input) => {
    let title: string;
    try {
      title = canonicalRequiredText(input.title, 'title');
    } catch (error) {
      return this.commandError(error);
    }
    return this.executeCommand(['weeks', 'days', 'habitOccurrences'], async (transaction) => {
      const store = transaction.objectStore('habitOccurrences');
      const occurrence = await store.get(input.occurrenceId);
      if (occurrence === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'HabitOccurrence',
          id: input.occurrenceId,
        });
      }
      const { day, week } = await this.requireMutableHabitDay(
        transaction,
        occurrence,
        input.expectedRevision,
      );
      if (occurrence.outcome === 'deleted') {
        throw new DomainFailure({
          code: 'InvalidTransition',
          entity: 'HabitOccurrence',
          currentState: occurrence.outcome,
          attemptedTransition: 'edit',
        });
      }
      await store.put(
        toStoredHabitOccurrence({
          ...occurrence,
          definitionSnapshot: { title },
          isException: true,
          updatedAt: this.dependencies.clock.now(),
        }),
      );
      await this.bumpHabitAggregates(transaction, day, week);
      return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
    });
  };

  readonly recordHabitOutcome: PlanningRepository['recordHabitOutcome'] = async (input) =>
    this.executeHabitTransition(input.occurrenceId, input.expectedRevision, (occurrence, status) =>
      prepareHabitOutcome({
        occurrence,
        dayStatus: status,
        clock: this.dependencies.clock,
        outcome: input.outcome,
      }),
    );

  readonly correctBoundaryMissToCompleted: PlanningRepository['correctBoundaryMissToCompleted'] =
    async (input) =>
      this.executeHabitTransition(
        input.occurrenceId,
        input.expectedRevision,
        (occurrence, status) =>
          prepareBoundaryMissCorrection({
            occurrence,
            dayStatus: status,
            clock: this.dependencies.clock,
          }),
      );

  readonly deleteHabitOccurrence: PlanningRepository['deleteHabitOccurrence'] = async (input) =>
    this.executeHabitTransition(input.occurrenceId, input.expectedRevision, (occurrence, status) =>
      prepareHabitOccurrenceDeletion({
        occurrence,
        dayStatus: status,
        clock: this.dependencies.clock,
      }),
    );

  readonly saveDailyState: PlanningRepository['saveDailyState'] = async (input) => {
    return this.executeCommand(['weeks', 'days'], async (transaction) => {
      const dayStore = transaction.objectStore('days');
      const weekStore = transaction.objectStore('weeks');
      const day = await dayStore.get(input.date);
      if (day === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
      }
      this.requireOpenDay(day, input.expectedDayRevision);
      const week = await weekStore.get(day.weekStart);
      this.requireOpenWeek(week, day.weekStart);
      const prepared = prepareDailyStateUpdate({
        day,
        weekStatus: week.status,
        ...(input.energy === undefined ? {} : { energy: input.energy }),
        ...(input.mood === undefined ? {} : { mood: input.mood }),
        ...(input.sleepDurationMinutes === undefined
          ? {}
          : { sleepDurationMinutes: input.sleepDurationMinutes }),
        updatedAt: this.dependencies.clock.now(),
      });
      if (!prepared.ok) throw new DomainFailure(prepared.error);
      await dayStore.put(prepared.value);
      await weekStore.put({ ...week, revision: nextRevision(week.revision) });
      return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
    });
  };

  readonly closeDay: PlanningRepository['closeDay'] = async (input) =>
    this.executeCommand(
      [
        'weeks',
        'days',
        'taskSeries',
        'taskOccurrences',
        'taskPlanEntries',
        'taskEvents',
        'habitDefinitions',
        'habitOccurrences',
      ],
      async (transaction) => {
        const dayStore = transaction.objectStore('days');
        const weekStore = transaction.objectStore('weeks');
        const occurrenceStore = transaction.objectStore('taskOccurrences');
        const entryStore = transaction.objectStore('taskPlanEntries');
        const eventStore = transaction.objectStore('taskEvents');
        const habitStore = transaction.objectStore('habitOccurrences');

        const sourceDay = await dayStore.get(input.date);
        if (sourceDay === undefined) {
          throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
        }
        this.requireOpenDay(sourceDay, input.expectedDayRevision);
        const sourceWeek = await weekStore.get(sourceDay.weekStart);
        this.requireOpenWeek(sourceWeek, sourceDay.weekStart);

        await this.prepareClosureDate(transaction, input.date);

        const sourceEntries = await entryStore.index('by-date').getAll(input.date);
        const occurrenceIds = new Set(sourceEntries.map((entry) => entry.occurrenceId));
        const placedRows = await occurrenceStore
          .index('by-placement-created')
          .getAll(
            IDBKeyRange.bound(
              [`day:${input.date}`, 0],
              [`day:${input.date}`, Number.MAX_SAFE_INTEGER],
            ),
          );
        for (const row of placedRows) occurrenceIds.add(row.id);

        const taskOccurrences: TaskOccurrence[] = [];
        for (const occurrenceId of occurrenceIds) {
          const stored = await occurrenceStore.get(occurrenceId);
          if (stored !== undefined) taskOccurrences.push(fromStoredTaskOccurrence(stored));
        }

        const taskPlanEntries = new Map(sourceEntries.map((entry) => [entry.id, entry]));
        const destinationPeriods = [];
        const destinationPlanEntryIds: Record<string, TaskPlanEntry['id']> = {};
        const destinationDates = new Set<LocalDate>();
        for (const [occurrenceId, disposition] of Object.entries(input.dispositions)) {
          if (disposition.kind !== 'move-to-date') continue;
          destinationDates.add(disposition.destinationDate);
          const existing = await entryStore
            .index('by-occurrence-date')
            .get([occurrenceId, disposition.destinationDate]);
          if (existing !== undefined) {
            taskPlanEntries.set(existing.id, existing);
          } else {
            destinationPlanEntryIds[occurrenceId] = this.nextId<'task-plan-entry'>();
          }
        }
        for (const destinationDate of destinationDates) {
          const destinationDay = await dayStore.get(destinationDate);
          if (destinationDay === undefined) continue;
          const destinationWeek = await weekStore.get(destinationDay.weekStart);
          if (destinationWeek === undefined) continue;
          destinationPeriods.push({ day: destinationDay, week: destinationWeek });
        }

        const habitOccurrences = await habitStore.index('by-date').getAll(input.date);
        const prepared = prepareDayClosure({
          sourcePeriod: { day: sourceDay, week: sourceWeek },
          clock: this.dependencies.clock,
          dispositions: input.dispositions,
          taskOccurrences,
          taskPlanEntries: [...taskPlanEntries.values()],
          habitOccurrences,
          destinationPeriods,
          destinationPlanEntryIds,
        });
        if (!prepared.ok) throw dayClosureFailure(prepared.error);

        await dayStore.put(prepared.value.effects.day);
        for (const occurrence of prepared.value.effects.taskOccurrences) {
          await occurrenceStore.put(toStoredTaskOccurrence(occurrence));
        }
        for (const entry of prepared.value.effects.taskPlanEntries) {
          await entryStore.put(toStoredTaskPlanEntry(entry));
        }
        for (const effect of prepared.value.effects.taskEvents) {
          const sequence = await allocateNextEventSequence(transaction);
          const event: TaskEvent = {
            ...effect,
            id: this.nextId<'task-event'>(),
            sequence,
          };
          await eventStore.add(toStoredTaskEvent(event));
        }

        for (const destinationDate of destinationDates) {
          const destinationDay = await dayStore.get(destinationDate);
          if (destinationDay?.status !== 'open') continue;
          await dayStore.put({
            ...destinationDay,
            revision: nextRevision(destinationDay.revision),
          });
        }
        const affectedWeeks = new Map<LocalDate, Extract<Week, { readonly status: 'open' }>>();
        for (const weekStart of prepared.value.affectedWeeks) {
          const week = await weekStore.get(weekStart);
          if (week?.status === 'open') affectedWeeks.set(week.startDate, week);
        }
        for (const week of affectedWeeks.values()) {
          await weekStore.put({ ...week, revision: nextRevision(week.revision) });
        }

        return {
          value: prepared.value.effects.day.closureSnapshot,
          affectedDates: prepared.value.affectedDates,
          affectedWeeks: [...affectedWeeks.keys()],
        };
      },
    );

  readonly completeWeek: PlanningRepository['completeWeek'] = async (input) =>
    this.executeCommand(['weeks', 'days'], async (transaction) => {
      const weekStore = transaction.objectStore('weeks');
      const week = await weekStore.get(input.weekStart);
      if (week === undefined) {
        throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: input.weekStart });
      }
      this.requireOpenWeek(week, input.weekStart, input.expectedWeekRevision);
      const days = await transaction
        .objectStore('days')
        .index('by-weekStart')
        .getAll(input.weekStart);
      const prepared = prepareWeekCompletion({
        week,
        days,
        ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
        clock: this.dependencies.clock,
      });
      if (!prepared.ok) throw weekCompletionFailure(prepared.error);
      await weekStore.put(toStoredWeek(prepared.value.week));
      return {
        value: prepared.value.week.completionSnapshot,
        affectedDates: [],
        affectedWeeks: [prepared.value.week.startDate],
      };
    });

  constructor(
    private readonly database: IDBPDatabase<OrbitPlanningDB>,
    private readonly dependencies: IndexedDbPlanningRepositoryDependencies,
  ) {}

  private async prepareClosureDate(
    transaction: OrbitWriteTransaction,
    date: LocalDate,
  ): Promise<void> {
    const day = await transaction.objectStore('days').get(date);
    if (day?.status !== 'open') return;
    const week = await transaction.objectStore('weeks').get(day.weekStart);
    if (week?.status !== 'open') return;

    const taskSeries = (await transaction.objectStore('taskSeries').getAll()).map(
      fromStoredTaskSeries,
    );
    const habitDefinitions = await transaction.objectStore('habitDefinitions').getAll();
    const taskOccurrenceStore = transaction.objectStore('taskOccurrences');
    const taskPlanEntryStore = transaction.objectStore('taskPlanEntries');
    const taskEventStore = transaction.objectStore('taskEvents');
    const habitOccurrenceStore = transaction.objectStore('habitOccurrences');
    const taskOccurrencesById = new Map<string, TaskOccurrence>();
    const placedRange = IDBKeyRange.bound(
      [`day:${date}`, 0],
      [`day:${date}`, Number.MAX_SAFE_INTEGER],
    );
    for (const stored of await taskOccurrenceStore
      .index('by-placement-created')
      .getAll(placedRange)) {
      const occurrence = fromStoredTaskOccurrence(stored);
      taskOccurrencesById.set(occurrence.id, occurrence);
    }
    for (const series of taskSeries) {
      const stored = await taskOccurrenceStore.index('by-series-date').get([series.id, date]);
      if (stored !== undefined) {
        const occurrence = fromStoredTaskOccurrence(stored);
        taskOccurrencesById.set(occurrence.id, occurrence);
      }
    }
    const taskOccurrences = [...taskOccurrencesById.values()];
    const taskPlanEntries = await taskPlanEntryStore.index('by-date').getAll(date);
    const habitOccurrences = await habitOccurrenceStore.index('by-date').getAll(date);
    const taskEvents: TaskEvent[] = [];
    for (const occurrence of taskOccurrences) {
      taskEvents.push(
        ...(await taskEventStore
          .index('by-occurrence-sequence')
          .getAll(IDBKeyRange.bound([occurrence.id, 0], [occurrence.id, Number.MAX_SAFE_INTEGER]))),
      );
    }

    const effects = planOccurrenceMaterialization({
      openDates: [date],
      currentLocalDate: this.dependencies.clock.currentLocalDate(),
      taskSeries,
      habitDefinitions,
      taskOccurrences,
      taskPlanEntries,
      taskEvents,
      habitOccurrences,
    });
    for (const effect of effects.removeTaskBundles) {
      await taskPlanEntryStore.delete(effect.planEntryId);
      await taskOccurrenceStore.delete(effect.occurrenceId);
    }
    for (const effect of effects.removeHabitOccurrences) {
      await habitOccurrenceStore.delete(effect.occurrenceId);
    }

    const now = this.dependencies.clock.now();
    let nextCreatedSequence =
      effects.createTaskBundles.length === 0
        ? undefined
        : await allocateNextCreationSequence(transaction);
    for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
      if (nextCreatedSequence === undefined) throw new Error('Creation sequence was not allocated');
      const occurrenceId = this.nextId<'task-occurrence'>();
      const occurrence: IncompleteDatedTaskOccurrence = {
        id: occurrenceId,
        seriesId: effect.seriesId,
        nominalDate: effect.nominalDate,
        ruleRevision: effect.ruleRevision,
        title: effect.title,
        ...(effect.notes === undefined ? {} : { notes: effect.notes }),
        plannedDurationMinutes: effect.plannedDurationMinutes,
        isException: false,
        createdSequence: nextCreatedSequence,
        revision: revision(0),
        state: 'active',
        placement: effect.placement,
        dayPosition: effect.dayPosition,
        completion: 'incomplete',
      };
      const entry: TaskPlanEntry = {
        id: this.nextId<'task-plan-entry'>(),
        occurrenceId,
        date: effect.membership.date,
        weekStart: effect.membership.weekStart,
        plannedSnapshot: effect.membership.plannedSnapshot,
        enteredAt: now,
        outcome: 'planned',
      };
      await taskOccurrenceStore.add(toStoredTaskOccurrence(occurrence));
      await taskPlanEntryStore.add(toStoredTaskPlanEntry(entry));
      if (effectIndex < effects.createTaskBundles.length - 1) {
        nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
      }
    }
    const preparedHabits = new Map(
      habitOccurrences.map((occurrence) => [occurrence.id, occurrence]),
    );
    for (const effect of effects.createHabitOccurrences) {
      const occurrence: HabitOccurrence = {
        id: this.nextId<'habit-occurrence'>(),
        definitionId: effect.definitionId,
        date: effect.date,
        weekStart: effect.weekStart,
        definitionSnapshot: effect.definitionSnapshot,
        ruleRevision: effect.ruleRevision,
        isException: false,
        outcome: 'pending',
        outcomeEvents: [],
        updatedAt: now,
      };
      await habitOccurrenceStore.add(toStoredHabitOccurrence(occurrence));
      preparedHabits.set(occurrence.id, occurrence);
    }
    for (const removed of effects.removeHabitOccurrences) {
      preparedHabits.delete(removed.occurrenceId);
    }
    for (const occurrence of preparedHabits.values()) {
      const transition = catchUpHabitDateBoundary({
        occurrence,
        dayStatus: day.status,
        clock: this.dependencies.clock,
      });
      if (!transition.ok) throw habitTransitionFailure(transition.error);
      if (transition.value.changed) {
        await habitOccurrenceStore.put(toStoredHabitOccurrence(transition.value.occurrence));
      }
    }
  }

  private executeHabitTransition(
    occurrenceId: HabitOccurrence['id'],
    expectedRevision: Revision,
    prepare: (
      occurrence: HabitOccurrence,
      dayStatus: Day['status'],
    ) => ReturnType<typeof prepareHabitOutcome>,
  ): Promise<CommandResult> {
    return this.executeCommand(['weeks', 'days', 'habitOccurrences'], async (transaction) => {
      const store = transaction.objectStore('habitOccurrences');
      const occurrence = await store.get(occurrenceId);
      if (occurrence === undefined) {
        throw new DomainFailure({
          code: 'NotFound',
          entity: 'HabitOccurrence',
          id: occurrenceId,
        });
      }
      const { day, week } = await this.requireMutableHabitDay(
        transaction,
        occurrence,
        expectedRevision,
      );
      const transition = prepare(occurrence, day.status);
      if (!transition.ok) throw habitTransitionFailure(transition.error);
      if (!transition.value.changed) {
        return { value: undefined, affectedDates: [], affectedWeeks: [] };
      }
      await store.put(toStoredHabitOccurrence(transition.value.occurrence));
      await this.bumpHabitAggregates(transaction, day, week);
      return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
    });
  }

  private async requireMutableHabitDay(
    transaction: OrbitWriteTransaction,
    occurrence: HabitOccurrence,
    expectedRevision: Revision,
  ): Promise<{
    readonly day: Extract<Day, { readonly status: 'open' }>;
    readonly week: Extract<Week, { readonly status: 'open' }>;
  }> {
    const day = await transaction.objectStore('days').get(occurrence.date);
    if (day === undefined) {
      throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: occurrence.date });
    }
    this.requireOpenDay(day, expectedRevision);
    const week = await transaction.objectStore('weeks').get(day.weekStart);
    this.requireOpenWeek(week, day.weekStart);
    return { day, week };
  }

  private async bumpHabitAggregates(
    transaction: OrbitWriteTransaction,
    day: Extract<Day, { readonly status: 'open' }>,
    week: Extract<Week, { readonly status: 'open' }>,
  ): Promise<void> {
    await transaction.objectStore('days').put({ ...day, revision: nextRevision(day.revision) });
    await transaction.objectStore('weeks').put({
      ...week,
      revision: nextRevision(week.revision),
    });
  }

  private async executeQuery<T>(work: () => Promise<T>): Promise<QueryResult<T>> {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof DomainFailure ? error.error : normalizeStorageError(error),
      };
    }
  }

  private async executeCommand<T>(
    stores: readonly OrbitStoreName[],
    work: (transaction: OrbitWriteTransaction) => Promise<AtomicCommandValue<T>>,
  ): Promise<CommandResult<T>> {
    try {
      const receipt = await runAtomic(this.database, stores, work);
      return {
        ok: true,
        value: receipt.value,
        affectedDates: receipt.affectedDates,
        affectedWeeks: receipt.affectedWeeks,
      };
    } catch (error) {
      return this.commandError(error);
    }
  }

  private commandError<T>(error: unknown): CommandResult<T> {
    return {
      ok: false,
      error: error instanceof DomainFailure ? error.error : normalizeStorageError(error),
    };
  }

  private requireOpenWeek(
    week: Week | undefined,
    weekStart: LocalDate,
    expectedRevision?: Revision,
  ): asserts week is Extract<Week, { readonly status: 'open' }> {
    if (week === undefined) {
      throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: weekStart });
    }
    if (week.status !== 'open') {
      throw new DomainFailure({ code: 'PeriodImmutable', weekStart });
    }
    if (expectedRevision !== undefined) {
      const guard = revisionGuard(week.revision, expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
    }
  }

  private requireOpenDay(
    day: Day,
    expectedRevision?: Revision,
  ): asserts day is Extract<Day, { readonly status: 'open' }> {
    if (day.status !== 'open') {
      throw new DomainFailure({ code: 'PeriodImmutable', date: day.date });
    }
    if (expectedRevision !== undefined) {
      const guard = revisionGuard(day.revision, expectedRevision);
      if (guard !== undefined) throw new DomainFailure(guard);
    }
  }

  private nextId<TKind extends string>(): EntityId<TKind> {
    return generateEntityId<TKind>(this.dependencies.generateUuid);
  }

  private taskValueSnapshot(occurrence: TaskOccurrence): TaskValueSnapshot {
    return {
      title: occurrence.title,
      ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
      ...(occurrence.plannedDurationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
    };
  }

  private async readDayFacts(day: Day): Promise<DayPlanningFacts> {
    const entries = (
      await this.database.getAllFromIndex('taskPlanEntries', 'by-date', day.date)
    ).map(fromStoredTaskPlanEntry);
    const projected = await Promise.all(
      entries.map(async (membership) => {
        const storedOccurrence = await this.database.get(
          'taskOccurrences',
          membership.occurrenceId,
        );
        if (storedOccurrence === undefined) return undefined;
        const events = (
          await this.database.getAllFromIndex(
            'taskEvents',
            'by-occurrence-sequence',
            IDBKeyRange.bound(
              [membership.occurrenceId, 0],
              [membership.occurrenceId, Number.MAX_SAFE_INTEGER],
            ),
          )
        ).map(fromStoredTaskEvent);
        return {
          occurrence: fromStoredTaskOccurrence(storedOccurrence),
          membership,
          events,
        };
      }),
    );
    const tasks = projected
      .filter((item) => item !== undefined)
      .filter(
        ({ occurrence, membership }) =>
          membership.outcome !== 'deleted' &&
          (day.status === 'closed' ||
            (occurrence.state === 'active' &&
              occurrence.placement.kind === 'day' &&
              occurrence.placement.date === day.date)),
      )
      .sort((left, right) => {
        const leftPosition =
          left.occurrence.state === 'active' &&
          left.occurrence.placement.kind === 'day' &&
          'dayPosition' in left.occurrence
            ? (left.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER;
        const rightPosition =
          right.occurrence.state === 'active' &&
          right.occurrence.placement.kind === 'day' &&
          'dayPosition' in right.occurrence
            ? (right.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER;
        return (
          leftPosition - rightPosition ||
          left.occurrence.createdSequence - right.occurrence.createdSequence
        );
      });
    const habits = await this.database.getAllFromIndex('habitOccurrences', 'by-date', day.date);
    const occurrences = tasks.map(({ occurrence }) => occurrence);
    const signals = selectDaySignals({
      day,
      occurrences,
      planEntries: entries,
      habits,
    });
    return {
      day,
      tasks,
      habits,
      score: signals.score,
      plannedLoadMinutes: signals.plannedLoadMinutes,
    };
  }

  auditContext(): RepositoryAuditContext {
    return {
      id: generateEntityId(this.dependencies.generateUuid),
      occurredAt: this.dependencies.clock.now(),
    };
  }

  dispose(): void {
    this.database.close();
  }
}

export function createIndexedDbPlanningRepository(
  database: IDBPDatabase<OrbitPlanningDB>,
  dependencies: IndexedDbPlanningRepositoryDependencies,
): DisposablePlanningRepository {
  return new IndexedDbPlanningRepository(database, dependencies);
}

export const indexedDbRepositoryInternals = Object.freeze({
  runAtomic,
  normalizeStorageError,
  revisionGuard,
  mutableDayGuard,
  allocateNextCreationSequence,
  allocateNextEventSequence,
});
