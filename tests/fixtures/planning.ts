import type {
  DailyStateEntry,
  DayClosureSnapshot,
  ScoreBreakdown,
} from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import type { DomainOrStorageError } from '@/entities/planning/model/planning-repository';
import type { RecurrenceRule, RecurrenceRuleVersion } from '@/entities/planning/model/recurrence';
import type {
  BacklogTaskOccurrence,
  CompletedDatedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  PlannedTaskPlanEntry,
  TaskEvent,
  TaskSeries,
  TaskTemplate,
} from '@/entities/planning/model/task';
import type {
  CompletedWeek,
  OpenWeek,
  WeekCompletionSnapshot,
  WeeklyGoal,
} from '@/entities/planning/model/week';
import type { ClosedDay, OpenDay } from '@/entities/planning/model/day';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  nonNegativeDurationMinutes,
  revision,
  type EntityId,
  type Revision,
} from '@/shared/lib/ids';
import {
  instant,
  type ApplicationClock,
  type FixedClockValue,
} from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

export const PLANNING_FIXTURE_DATE = localDate('2026-05-20');
export const PLANNING_FIXTURE_WEEK_START = localDate('2026-05-18');
export const PLANNING_FIXTURE_INSTANT = instant('2026-05-20T05:00:00.000Z');

export interface ControllablePlanningClock extends ApplicationClock {
  set(value: FixedClockValue): void;
}

export function createPlanningFixtureClock(
  initial: FixedClockValue = {
    instant: PLANNING_FIXTURE_INSTANT,
    currentLocalDate: PLANNING_FIXTURE_DATE,
  },
): ControllablePlanningClock {
  let value = initial;

  return {
    now: () => value.instant,
    currentLocalDate: () => value.currentLocalDate,
    set(nextValue) {
      value = nextValue;
    },
  };
}

export function deterministicEntityId<TKind extends string>(ordinal: number): EntityId<TKind> {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 999_999_999_999) {
    throw new RangeError(`Fixture ID ordinal must be 1..999999999999: ${String(ordinal)}`);
  }

  return entityId<TKind>(`00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`);
}

export interface DeterministicIdFactory {
  next<TKind extends string>(): EntityId<TKind>;
}

export function createDeterministicIdFactory(startOrdinal = 1): DeterministicIdFactory {
  let nextOrdinal = startOrdinal;
  deterministicEntityId(nextOrdinal);

  return {
    next<TKind extends string>(): EntityId<TKind> {
      const id = deterministicEntityId<TKind>(nextOrdinal);
      nextOrdinal += 1;
      return id;
    },
  };
}

export function buildRevision(value = 0): Revision {
  return revision(value);
}

export function buildWeeklyGoal(overrides: Partial<WeeklyGoal> = {}): WeeklyGoal {
  return {
    id: deterministicEntityId<'weekly-goal'>(1),
    statement: 'Подготовить прототип к проверке',
    createdAt: PLANNING_FIXTURE_INSTANT,
    updatedAt: PLANNING_FIXTURE_INSTANT,
    ...overrides,
  };
}

export function buildOpenWeek(overrides: Partial<OpenWeek> = {}): OpenWeek {
  return {
    status: 'open',
    startDate: PLANNING_FIXTURE_WEEK_START,
    goals: [buildWeeklyGoal()],
    revision: revision(0),
    ...overrides,
  };
}

export function buildCompletedWeek(overrides: Partial<CompletedWeek> = {}): CompletedWeek {
  return {
    status: 'completed',
    startDate: PLANNING_FIXTURE_WEEK_START,
    goals: [buildWeeklyGoal()],
    revision: revision(1),
    completionSnapshot: buildWeekCompletionSnapshot(),
    completedAt: PLANNING_FIXTURE_INSTANT,
    ...overrides,
  };
}

export function buildDailyState(overrides: Partial<DailyStateEntry> = {}): DailyStateEntry {
  return {
    energy: 3,
    mood: 4,
    sleepDurationMinutes: nonNegativeDurationMinutes(450),
    updatedAt: PLANNING_FIXTURE_INSTANT,
    ...overrides,
  };
}

export function buildOpenDay(overrides: Partial<OpenDay> = {}): OpenDay {
  return {
    status: 'open',
    date: PLANNING_FIXTURE_DATE,
    weekStart: PLANNING_FIXTURE_WEEK_START,
    revision: revision(0),
    ...overrides,
  };
}

export function buildClosedDay(overrides: Partial<ClosedDay> = {}): ClosedDay {
  return {
    status: 'closed',
    date: PLANNING_FIXTURE_DATE,
    weekStart: PLANNING_FIXTURE_WEEK_START,
    revision: revision(1),
    closureSnapshot: buildDayClosureSnapshot(),
    closedAt: PLANNING_FIXTURE_INSTANT,
    ...overrides,
  };
}

export function buildScoreBreakdown(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    task: { completed: 2, applicable: 3, rate: 2 / 3 },
    habit: { completed: 1, applicable: 2, rate: 1 / 2 },
    value: 62,
    weightsApplied: { task: 70, habit: 30 },
    ...overrides,
  };
}

export function buildUnavailableScoreBreakdown(): ScoreBreakdown {
  return {
    task: { completed: 0, applicable: 0, rate: 'unavailable' },
    habit: { completed: 0, applicable: 0, rate: 'unavailable' },
    value: 'unavailable',
    weightsApplied: { task: 0, habit: 0 },
  };
}

export function buildDayClosureSnapshot(
  overrides: Partial<DayClosureSnapshot> = {},
): DayClosureSnapshot {
  return {
    score: buildScoreBreakdown(),
    plannedLoadMinutes: nonNegativeDurationMinutes(90),
    ...overrides,
  };
}

export function buildWeekCompletionSnapshot(
  overrides: Partial<WeekCompletionSnapshot> = {},
): WeekCompletionSnapshot {
  return {
    progress: buildScoreBreakdown(),
    ...overrides,
  };
}

export function buildRecurrenceRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    startDate: PLANNING_FIXTURE_WEEK_START,
    weekdays: [1, 3, 5],
    ...overrides,
  };
}

export function buildRecurrenceRuleVersion(
  overrides: Partial<Extract<RecurrenceRuleVersion, { state: 'active' }>> = {},
): Extract<RecurrenceRuleVersion, { state: 'active' }> {
  return {
    state: 'active',
    revision: revision(0),
    effectiveFrom: PLANNING_FIXTURE_WEEK_START,
    rule: buildRecurrenceRule(),
    ...overrides,
  };
}

export function buildTaskTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    title: 'Подготовить сценарий проверки',
    plannedDurationMinutes: durationMinutes(45),
    ...overrides,
  };
}

export function buildTaskSeries(overrides: Partial<TaskSeries> = {}): TaskSeries {
  return {
    id: deterministicEntityId<'task-series'>(2),
    template: buildTaskTemplate(),
    ruleVersions: [buildRecurrenceRuleVersion()],
    revision: revision(0),
    ...overrides,
  };
}

export function buildIncompleteTaskOccurrence(
  overrides: Partial<IncompleteDatedTaskOccurrence> = {},
): IncompleteDatedTaskOccurrence {
  return {
    id: deterministicEntityId<'task-occurrence'>(3),
    title: 'Подготовить сценарий проверки',
    state: 'active',
    placement: { kind: 'day', date: PLANNING_FIXTURE_DATE },
    plannedDurationMinutes: durationMinutes(45),
    dayPosition: dayPosition(0),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(0),
    ...overrides,
  };
}

export function buildCompletedTaskOccurrence(
  overrides: Partial<CompletedDatedTaskOccurrence> = {},
): CompletedDatedTaskOccurrence {
  return {
    id: deterministicEntityId<'task-occurrence'>(3),
    title: 'Подготовить сценарий проверки',
    state: 'active',
    placement: { kind: 'day', date: PLANNING_FIXTURE_DATE },
    plannedDurationMinutes: durationMinutes(45),
    dayPosition: dayPosition(0),
    completion: 'completed',
    actualCompletedAt: PLANNING_FIXTURE_INSTANT,
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(1),
    ...overrides,
  };
}

export function buildBacklogTaskOccurrence(
  overrides: Partial<BacklogTaskOccurrence> = {},
): BacklogTaskOccurrence {
  return {
    id: deterministicEntityId<'task-occurrence'>(3),
    title: 'Разобрать заметки',
    state: 'active',
    placement: { kind: 'backlog' },
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(0),
    ...overrides,
  };
}

export function buildPlannedTaskEntry(
  overrides: Partial<PlannedTaskPlanEntry> = {},
): PlannedTaskPlanEntry {
  return {
    id: deterministicEntityId<'task-plan-entry'>(4),
    occurrenceId: deterministicEntityId<'task-occurrence'>(3),
    date: PLANNING_FIXTURE_DATE,
    weekStart: PLANNING_FIXTURE_WEEK_START,
    plannedSnapshot: buildTaskTemplate(),
    enteredAt: PLANNING_FIXTURE_INSTANT,
    outcome: 'planned',
    ...overrides,
  };
}

export function buildTaskCreateEvent(
  overrides: Partial<Extract<TaskEvent, { type: 'create' }>> = {},
): Extract<TaskEvent, { type: 'create' }> {
  return {
    id: deterministicEntityId<'task-event'>(5),
    sequence: eventSequence(1),
    occurrenceId: deterministicEntityId<'task-occurrence'>(3),
    effectiveDate: PLANNING_FIXTURE_DATE,
    occurredAt: PLANNING_FIXTURE_INSTANT,
    type: 'create',
    payload: {
      created: buildTaskTemplate(),
      placement: { kind: 'day', date: PLANNING_FIXTURE_DATE },
    },
    ...overrides,
  };
}

export function buildHabitDefinition(overrides: Partial<HabitDefinition> = {}): HabitDefinition {
  return {
    id: deterministicEntityId<'habit-definition'>(6),
    title: 'Прогулка после обеда',
    ruleVersions: [buildRecurrenceRuleVersion()],
    revision: revision(0),
    ...overrides,
  };
}

export function buildHabitOccurrence(overrides: Partial<HabitOccurrence> = {}): HabitOccurrence {
  return {
    id: deterministicEntityId<'habit-occurrence'>(7),
    definitionId: deterministicEntityId<'habit-definition'>(6),
    date: PLANNING_FIXTURE_DATE,
    weekStart: PLANNING_FIXTURE_WEEK_START,
    definitionSnapshot: { title: 'Прогулка после обеда' },
    ruleRevision: revision(0),
    isException: false,
    outcome: 'pending',
    outcomeEvents: [],
    updatedAt: PLANNING_FIXTURE_INSTANT,
    ...overrides,
  };
}

type RepositoryFailureCode = DomainOrStorageError['code'];
type RepositoryFailureOf<TCode extends RepositoryFailureCode> = Extract<
  DomainOrStorageError,
  { code: TCode }
>;

const DEFAULT_REPOSITORY_FAILURES = {
  ValidationFailure: {
    code: 'ValidationFailure',
    issues: [{ field: 'title', message: 'Значение обязательно' }],
  },
  NotFound: { code: 'NotFound', entity: 'task', id: deterministicEntityId(3) },
  PeriodImmutable: { code: 'PeriodImmutable', date: PLANNING_FIXTURE_DATE },
  InvalidTransition: {
    code: 'InvalidTransition',
    entity: 'task',
    currentState: 'completed',
    attemptedTransition: 'move',
  },
  TaskMustBeIncompleteToMove: {
    code: 'TaskMustBeIncompleteToMove',
    occurrenceId: deterministicEntityId<'task-occurrence'>(3),
  },
  MoveTargetClosed: {
    code: 'MoveTargetClosed',
    destinationDate: PLANNING_FIXTURE_DATE,
  },
  FutureDayClosure: {
    code: 'FutureDayClosure',
    date: localDate('2026-05-21'),
    currentLocalDate: PLANNING_FIXTURE_DATE,
  },
  PendingHabitOutcomes: {
    code: 'PendingHabitOutcomes',
    occurrenceIds: [deterministicEntityId<'habit-occurrence'>(7)],
  },
  ClosureDispositionMismatch: {
    code: 'ClosureDispositionMismatch',
    expectedOccurrenceIds: [deterministicEntityId<'task-occurrence'>(3)],
    receivedOccurrenceIds: [],
  },
  WeekNotClosable: {
    code: 'WeekNotClosable',
    weekStart: PLANNING_FIXTURE_WEEK_START,
    openDates: [PLANNING_FIXTURE_DATE],
  },
  RevisionConflict: {
    code: 'RevisionConflict',
    expectedRevision: revision(0),
    actualRevision: revision(1),
  },
  ServerUnavailable: {
    code: 'ServerUnavailable',
    message: 'The ORBIT server is unavailable',
  },
  UnexpectedServerFailure: {
    code: 'UnexpectedServerFailure',
    message: 'Unexpected server failure',
  },
} as const satisfies Record<RepositoryFailureCode, DomainOrStorageError>;

export function buildRepositoryFailure<TCode extends RepositoryFailureCode>(
  code: TCode,
  overrides: Partial<RepositoryFailureOf<TCode>> = {},
): RepositoryFailureOf<TCode> {
  return {
    ...DEFAULT_REPOSITORY_FAILURES[code],
    ...overrides,
  } as unknown as RepositoryFailureOf<TCode>;
}

export function buildServerUnavailableFailure(
  message = 'The ORBIT server is unavailable',
): RepositoryFailureOf<'ServerUnavailable'> {
  return buildRepositoryFailure('ServerUnavailable', { message });
}
