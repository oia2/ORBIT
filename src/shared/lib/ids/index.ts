declare const entityIdBrand: unique symbol;
declare const revisionBrand: unique symbol;
declare const eventSequenceBrand: unique symbol;
declare const creationSequenceBrand: unique symbol;
declare const dayPositionBrand: unique symbol;
declare const durationMinutesBrand: unique symbol;
declare const nonNegativeDurationMinutesBrand: unique symbol;

export type EntityId<TKind extends string = string> = string & {
  readonly [entityIdBrand]: TKind;
};

export type WeeklyGoalId = EntityId<'weekly-goal'>;
export type WeekGoalId = WeeklyGoalId;
export type TaskSeriesId = EntityId<'task-series'>;
export type TaskOccurrenceId = EntityId<'task-occurrence'>;
export type TaskPlanEntryId = EntityId<'task-plan-entry'>;
export type TaskEventId = EntityId<'task-event'>;
export type HabitDefinitionId = EntityId<'habit-definition'>;
export type HabitOccurrenceId = EntityId<'habit-occurrence'>;

export type Revision = number & { readonly [revisionBrand]: 'Revision' };
export type EventSequence = number & {
  readonly [eventSequenceBrand]: 'EventSequence';
};
export type CreationSequence = number & {
  readonly [creationSequenceBrand]: 'CreationSequence';
};
export type DayPosition = number & {
  readonly [dayPositionBrand]: 'DayPosition';
};
export type DurationMinutes = number & {
  readonly [durationMinutesBrand]: 'DurationMinutes';
};
export type NonNegativeDurationMinutes = number & {
  readonly [nonNegativeDurationMinutesBrand]: 'NonNegativeDurationMinutes';
};
export type SleepDurationMinutes = NonNegativeDurationMinutes;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function entityId<TKind extends string = 'entity'>(value: string): EntityId<TKind> {
  if (!isEntityId(value)) {
    throw new RangeError(`Invalid entity UUID: ${value}`);
  }

  return value as EntityId<TKind>;
}

export function generateEntityId<TKind extends string = 'entity'>(
  generateUuid: () => string = () => globalThis.crypto.randomUUID(),
): EntityId<TKind> {
  return entityId<TKind>(generateUuid());
}

export const createEntityId = generateEntityId;

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!isNonNegativeInteger(value)) {
    throw new RangeError(`${name} must be a non-negative safe integer: ${String(value)}`);
  }

  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!isPositiveInteger(value)) {
    throw new RangeError(`${name} must be a positive safe integer: ${String(value)}`);
  }

  return value;
}

function increment(value: number, name: string): number {
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} cannot exceed Number.MAX_SAFE_INTEGER`);
  }

  return value + 1;
}

export function revision(value: number): Revision {
  return requireNonNegativeInteger(value, 'Revision') as Revision;
}

export function isRevision(value: unknown): value is Revision {
  return isNonNegativeInteger(value);
}

export function nextRevision(value: Revision): Revision {
  return revision(increment(value, 'Revision'));
}

export function eventSequence(value: number): EventSequence {
  return requirePositiveInteger(value, 'EventSequence') as EventSequence;
}

export function isEventSequence(value: unknown): value is EventSequence {
  return isPositiveInteger(value);
}

export function nextEventSequence(value: EventSequence): EventSequence {
  return eventSequence(increment(value, 'EventSequence'));
}

export function creationSequence(value: number): CreationSequence {
  return requirePositiveInteger(value, 'CreationSequence') as CreationSequence;
}

export function isCreationSequence(value: unknown): value is CreationSequence {
  return isPositiveInteger(value);
}

export function nextCreationSequence(value: CreationSequence): CreationSequence {
  return creationSequence(increment(value, 'CreationSequence'));
}

export function dayPosition(value: number): DayPosition {
  return requireNonNegativeInteger(value, 'DayPosition') as DayPosition;
}

export function isDayPosition(value: unknown): value is DayPosition {
  return isNonNegativeInteger(value);
}

export function durationMinutes(value: number): DurationMinutes {
  return requirePositiveInteger(value, 'DurationMinutes') as DurationMinutes;
}

export function isDurationMinutes(value: unknown): value is DurationMinutes {
  return isPositiveInteger(value);
}

export function nonNegativeDurationMinutes(value: number): NonNegativeDurationMinutes {
  return requireNonNegativeInteger(
    value,
    'NonNegativeDurationMinutes',
  ) as NonNegativeDurationMinutes;
}

export function isNonNegativeDurationMinutes(value: unknown): value is NonNegativeDurationMinutes {
  return isNonNegativeInteger(value);
}

export const INITIAL_REVISION = revision(0);
