import type { Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import {
  dayPosition,
  durationMinutes,
  INITIAL_REVISION,
  isNonNegativeInteger,
  isPositiveInteger,
  nextRevision,
  type CreationSequence,
  type DayPosition,
  type DurationMinutes,
  type EventSequence,
  type Revision,
  type TaskEventId,
  type TaskOccurrenceId,
  type TaskPlanEntryId,
  type TaskSeriesId,
} from '@/shared/lib/ids';
import { err, ok, type Result } from '@/shared/lib/result';

/*
 * These record contracts remain intentionally plain and serializable. The pure
 * functions below prepare records/effects; adapters own transactions and audit
 * sequence allocation.
 */
import type { RecurrenceRuleVersion } from './recurrence';

export interface TaskTemplate {
  readonly title: string;
  readonly notes?: string;
  readonly plannedDurationMinutes: DurationMinutes;
  /** Optional clock time, "HH:MM" 24-hour, independent of `plannedDurationMinutes`. */
  readonly startTime?: string;
  readonly endTime?: string;
}

export interface TaskSeries {
  readonly id: TaskSeriesId;
  readonly template: TaskTemplate;
  readonly ruleVersions: readonly RecurrenceRuleVersion[];
  readonly revision: Revision;
}

export interface DayTaskPlacement {
  readonly kind: 'day';
  readonly date: LocalDate;
}

export interface BacklogTaskPlacement {
  readonly kind: 'backlog';
}

export interface NoTaskPlacement {
  readonly kind: 'none';
}
export type TaskPlacement = DayTaskPlacement | BacklogTaskPlacement | NoTaskPlacement;

interface TaskOccurrenceBase {
  readonly id: TaskOccurrenceId;
  readonly seriesId?: TaskSeriesId;
  readonly nominalDate?: LocalDate;
  readonly ruleRevision?: Revision;
  readonly title: string;
  readonly notes?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly isException: boolean;
  readonly createdSequence: CreationSequence;
  readonly revision: Revision;
}

interface ActiveDatedTaskBase extends TaskOccurrenceBase {
  readonly state: 'active';
  readonly placement: DayTaskPlacement;
  readonly plannedDurationMinutes: DurationMinutes;
  /** Dated-list order; generated occurrences append after the current final position. */
  readonly dayPosition?: DayPosition;
}

export interface IncompleteDatedTaskOccurrence extends ActiveDatedTaskBase {
  readonly completion: 'incomplete';
}

export interface CompletedDatedTaskOccurrence extends ActiveDatedTaskBase {
  readonly completion: 'completed';
  readonly actualCompletedAt: Instant;
}

export interface BacklogTaskOccurrence extends TaskOccurrenceBase {
  readonly state: 'active';
  readonly placement: BacklogTaskPlacement;
  readonly plannedDurationMinutes?: DurationMinutes;
}

export interface FinalizedTaskOccurrence extends TaskOccurrenceBase {
  readonly state: 'finalized';
  readonly placement: NoTaskPlacement;
  readonly plannedDurationMinutes?: DurationMinutes;
}

export interface DeletedTaskOccurrence extends TaskOccurrenceBase {
  readonly state: 'deleted';
  readonly placement: NoTaskPlacement;
  readonly plannedDurationMinutes?: DurationMinutes;
}

export type TaskOccurrence =
  | IncompleteDatedTaskOccurrence
  | CompletedDatedTaskOccurrence
  | BacklogTaskOccurrence
  | FinalizedTaskOccurrence
  | DeletedTaskOccurrence;

export interface TaskPlannedSnapshot {
  readonly title: string;
  readonly notes?: string;
  readonly plannedDurationMinutes: DurationMinutes;
  readonly startTime?: string;
  readonly endTime?: string;
}

interface TaskPlanEntryBase {
  readonly id: TaskPlanEntryId;
  readonly occurrenceId: TaskOccurrenceId;
  readonly date: LocalDate;
  readonly weekStart: LocalDate;
  readonly plannedSnapshot: TaskPlannedSnapshot;
  readonly enteredAt: Instant;
  readonly finalizedAt?: Instant;
}

export interface PlannedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'planned';
}

export interface CompletedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'completed';
}

export interface MovedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'moved';
  readonly destination: DayTaskPlacement;
}

export interface BackloggedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'backlogged';
  readonly destination: BacklogTaskPlacement;
}

export interface CanceledTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'canceled';
}

export interface KeptUnfinishedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'kept-unfinished';
}

export interface DeletedTaskPlanEntry extends TaskPlanEntryBase {
  readonly outcome: 'deleted';
}

export type TaskPlanEntry =
  | PlannedTaskPlanEntry
  | CompletedTaskPlanEntry
  | MovedTaskPlanEntry
  | BackloggedTaskPlanEntry
  | CanceledTaskPlanEntry
  | KeptUnfinishedTaskPlanEntry
  | DeletedTaskPlanEntry;

export type TaskEventType =
  | 'create'
  | 'edit'
  | 'completion-checked'
  | 'completion-unchecked'
  | 'move-to-date'
  | 'move-to-backlog'
  | 'schedule-from-backlog'
  | 'delete'
  | 'recurrence-change'
  | 'occurrence-exception'
  | 'closure-keep'
  | 'closure-move'
  | 'closure-cancel';

export interface TaskValueSnapshot {
  readonly title: string;
  readonly notes?: string;
  readonly plannedDurationMinutes?: DurationMinutes;
  readonly startTime?: string;
  readonly endTime?: string;
}

export interface TaskEventPayloadByType {
  readonly create: {
    readonly created: TaskValueSnapshot;
    readonly placement: TaskPlacement;
  };
  readonly edit: {
    readonly before: TaskValueSnapshot;
    readonly after: TaskValueSnapshot;
  };
  readonly 'completion-checked': { readonly date: LocalDate };
  readonly 'completion-unchecked': { readonly date: LocalDate };
  readonly 'move-to-date': {
    readonly from: TaskPlacement;
    readonly destination: DayTaskPlacement;
  };
  readonly 'move-to-backlog': {
    readonly from: DayTaskPlacement;
    readonly destination: BacklogTaskPlacement;
  };
  readonly 'schedule-from-backlog': {
    readonly from: BacklogTaskPlacement;
    readonly destination: DayTaskPlacement;
  };
  readonly delete: { readonly previousPlacement: TaskPlacement };
  readonly 'recurrence-change': { readonly ruleRevision: Revision };
  readonly 'occurrence-exception': {
    readonly before: TaskValueSnapshot;
    readonly after: TaskValueSnapshot;
  };
  readonly 'closure-keep': { readonly date: LocalDate };
  readonly 'closure-move': {
    readonly fromDate: LocalDate;
    readonly destination: DayTaskPlacement | BacklogTaskPlacement;
  };
  readonly 'closure-cancel': { readonly date: LocalDate };
}

interface TaskEventBase {
  readonly id: TaskEventId;
  readonly sequence: EventSequence;
  readonly occurrenceId: TaskOccurrenceId;
  readonly seriesId?: TaskSeriesId;
  readonly planEntryId?: TaskPlanEntryId;
  readonly effectiveDate: LocalDate;
  readonly occurredAt: Instant;
}

export type TaskEvent = {
  readonly [Type in TaskEventType]: TaskEventBase & {
    readonly type: Type;
    readonly payload: TaskEventPayloadByType[Type];
  };
}[TaskEventType];

export type DatedTaskOccurrence = IncompleteDatedTaskOccurrence | CompletedDatedTaskOccurrence;

export interface CreateOneOffTaskInput {
  readonly id: TaskOccurrenceId;
  readonly planEntryId?: TaskPlanEntryId;
  readonly title: string;
  readonly notes?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly placement: DayTaskPlacement | BacklogTaskPlacement;
  readonly plannedDurationMinutes?: number | undefined;
  readonly dayPosition?: number | undefined;
  readonly createdSequence: CreationSequence;
  readonly createdAt: Instant;
}

export interface OneOffTaskPlanningResult {
  readonly occurrence: DatedTaskOccurrence | BacklogTaskOccurrence;
  readonly planEntries: readonly PlannedTaskPlanEntry[];
}

export type TaskPlanningError =
  | { readonly code: 'DatedDurationRequired' }
  | { readonly code: 'DatedPositionRequired' }
  | { readonly code: 'PlanEntryIdRequired' }
  | { readonly code: 'BacklogDurationInvalid' }
  | { readonly code: 'BacklogPositionNotAllowed' }
  | { readonly code: 'DuplicateMembership'; readonly date: LocalDate }
  | { readonly code: 'DatedPlacementRequired'; readonly date: LocalDate }
  | { readonly code: 'DatedOrderMismatch' }
  | { readonly code: 'InvalidTimeRange' };

function optionalNotes(notes: string | undefined): { readonly notes?: string } {
  return notes === undefined ? {} : { notes };
}

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" 24-hour clock time, independent of calendar date. */
export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(value);
}

export interface TaskTimeRange {
  readonly startTime?: string;
  readonly endTime?: string;
}

/**
 * Both fields are independently optional. When both are present, `endTime`
 * must be strictly after `startTime` (same-day clock comparison only).
 */
export function validateTaskTimeRange(
  startTime: string | undefined,
  endTime: string | undefined,
): Result<TaskTimeRange, TaskPlanningError> {
  if (startTime !== undefined && !isValidLocalTime(startTime)) {
    return err({ code: 'InvalidTimeRange' });
  }
  if (endTime !== undefined && !isValidLocalTime(endTime)) {
    return err({ code: 'InvalidTimeRange' });
  }
  if (startTime !== undefined && endTime !== undefined && endTime <= startTime) {
    return err({ code: 'InvalidTimeRange' });
  }
  return ok({
    ...(startTime === undefined ? {} : { startTime }),
    ...(endTime === undefined ? {} : { endTime }),
  });
}

export function createOneOffTask(
  input: CreateOneOffTaskInput,
): Result<OneOffTaskPlanningResult, TaskPlanningError> {
  const timeRange = validateTaskTimeRange(input.startTime, input.endTime);
  if (!timeRange.ok) {
    return timeRange;
  }

  const common = {
    id: input.id,
    title: input.title,
    ...optionalNotes(input.notes),
    ...timeRange.value,
    isException: false,
    createdSequence: input.createdSequence,
    revision: INITIAL_REVISION,
  } as const;

  if (input.placement.kind === 'backlog') {
    if (input.dayPosition !== undefined) {
      return err({ code: 'BacklogPositionNotAllowed' });
    }
    if (
      input.plannedDurationMinutes !== undefined &&
      !isPositiveInteger(input.plannedDurationMinutes)
    ) {
      return err({ code: 'BacklogDurationInvalid' });
    }

    const occurrence: BacklogTaskOccurrence = {
      ...common,
      state: 'active',
      placement: input.placement,
      ...(input.plannedDurationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: durationMinutes(input.plannedDurationMinutes) }),
    };
    return ok({ occurrence, planEntries: [] });
  }

  if (!isPositiveInteger(input.plannedDurationMinutes)) {
    return err({ code: 'DatedDurationRequired' });
  }
  if (!isNonNegativeInteger(input.dayPosition)) {
    return err({ code: 'DatedPositionRequired' });
  }
  if (input.planEntryId === undefined) {
    return err({ code: 'PlanEntryIdRequired' });
  }

  const plannedDurationMinutes = durationMinutes(input.plannedDurationMinutes);
  const occurrence: IncompleteDatedTaskOccurrence = {
    ...common,
    state: 'active',
    placement: input.placement,
    plannedDurationMinutes,
    dayPosition: dayPosition(input.dayPosition),
    completion: 'incomplete',
  };
  const membership: PlannedTaskPlanEntry = {
    id: input.planEntryId,
    occurrenceId: input.id,
    date: input.placement.date,
    weekStart: startOfWeek(input.placement.date),
    plannedSnapshot: {
      title: input.title,
      ...optionalNotes(input.notes),
      plannedDurationMinutes,
      ...timeRange.value,
    },
    outcome: 'planned',
    enteredAt: input.createdAt,
  };

  return ok({ occurrence, planEntries: [membership] });
}

export interface EnsureDatedMembershipInput {
  readonly occurrence: TaskOccurrence;
  readonly date: LocalDate;
  readonly memberships: readonly TaskPlanEntry[];
  readonly planEntryId: TaskPlanEntryId;
  readonly enteredAt: Instant;
}

export interface EnsuredDatedMembership {
  readonly membership: TaskPlanEntry;
  readonly memberships: readonly TaskPlanEntry[];
  readonly created: boolean;
}

export function ensureDatedMembership(
  input: EnsureDatedMembershipInput,
): Result<EnsuredDatedMembership, TaskPlanningError> {
  const matching = input.memberships.filter(
    (membership) =>
      membership.occurrenceId === input.occurrence.id && membership.date === input.date,
  );
  if (matching.length > 1) {
    return err({ code: 'DuplicateMembership', date: input.date });
  }
  const existing = matching[0];
  if (existing !== undefined) {
    return ok({ membership: existing, memberships: input.memberships, created: false });
  }

  if (!isDatedTaskOccurrence(input.occurrence) || input.occurrence.placement.date !== input.date) {
    return err({ code: 'DatedPlacementRequired', date: input.date });
  }

  const membership: PlannedTaskPlanEntry = {
    id: input.planEntryId,
    occurrenceId: input.occurrence.id,
    date: input.date,
    weekStart: startOfWeek(input.date),
    plannedSnapshot: {
      title: input.occurrence.title,
      ...optionalNotes(input.occurrence.notes),
      plannedDurationMinutes: input.occurrence.plannedDurationMinutes,
      ...(input.occurrence.startTime === undefined
        ? {}
        : { startTime: input.occurrence.startTime }),
      ...(input.occurrence.endTime === undefined ? {} : { endTime: input.occurrence.endTime }),
    },
    outcome: 'planned',
    enteredAt: input.enteredAt,
  };
  return ok({
    membership,
    memberships: [...input.memberships, membership],
    created: true,
  });
}

export function isDatedTaskOccurrence(
  occurrence: TaskOccurrence,
): occurrence is DatedTaskOccurrence {
  return occurrence.state === 'active' && occurrence.placement.kind === 'day';
}

function requiredDayPosition(occurrence: DatedTaskOccurrence): DayPosition {
  if (occurrence.dayPosition === undefined) {
    throw new RangeError(`Dated task ${occurrence.id} has no approved day position`);
  }
  return occurrence.dayPosition;
}

export function sortDatedTaskOccurrences(
  occurrences: readonly TaskOccurrence[],
  date: LocalDate,
): readonly DatedTaskOccurrence[] {
  return occurrences
    .filter(
      (occurrence): occurrence is DatedTaskOccurrence =>
        isDatedTaskOccurrence(occurrence) && occurrence.placement.date === date,
    )
    .toSorted((left, right) => {
      const byPosition = requiredDayPosition(left) - requiredDayPosition(right);
      if (byPosition !== 0) {
        return byPosition;
      }
      const byCreation = left.createdSequence - right.createdSequence;
      return byCreation !== 0 ? byCreation : left.id.localeCompare(right.id);
    });
}

export interface ReorderDatedTasksInput {
  readonly occurrences: readonly TaskOccurrence[];
  readonly date: LocalDate;
  readonly orderedOccurrenceIds: readonly TaskOccurrenceId[];
}

export function reorderDatedTasks(
  input: ReorderDatedTasksInput,
): Result<readonly TaskOccurrence[], TaskPlanningError> {
  const datedTasks = sortDatedTaskOccurrences(input.occurrences, input.date);
  const expectedIds = new Set(datedTasks.map((task) => task.id));
  const requestedIds = new Set(input.orderedOccurrenceIds);
  if (
    input.orderedOccurrenceIds.length !== datedTasks.length ||
    requestedIds.size !== input.orderedOccurrenceIds.length ||
    input.orderedOccurrenceIds.some((id) => !expectedIds.has(id))
  ) {
    return err({ code: 'DatedOrderMismatch' });
  }

  const positionById = new Map(
    input.orderedOccurrenceIds.map((id, index) => [id, dayPosition(index)]),
  );
  return ok(
    input.occurrences.map((occurrence) => {
      if (!isDatedTaskOccurrence(occurrence) || occurrence.placement.date !== input.date) {
        return occurrence;
      }
      const position = positionById.get(occurrence.id);
      if (position === undefined) {
        throw new Error(`Validated dated order omitted ${occurrence.id}`);
      }
      return {
        ...occurrence,
        dayPosition: position,
        revision: nextRevision(occurrence.revision),
      };
    }),
  );
}
