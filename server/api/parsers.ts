import {
  isDayPosition,
  isDurationMinutes,
  isEntityId,
  isNonNegativeDurationMinutes,
  isRevision,
  type DayPosition,
  type DurationMinutes,
  type EntityId,
  type HabitDefinitionId,
  type HabitOccurrenceId,
  type Revision,
  type TaskOccurrenceId,
  type TaskSeriesId,
  type WeekGoalId,
} from '@/shared/lib/ids';
import { parseLocalDate, type LocalDate } from '@/shared/lib/local-date/local-date';

import { isFivePointOrdinal, type FivePointOrdinal } from '@/entities/planning/model/day';
import type {
  AddWeeklyGoalInput,
  ClearHabitOutcomeInput,
  CloseDayDisposition,
  CloseDayInput,
  CompleteWeekInput,
  CorrectBoundaryMissInput,
  CreateHabitDefinitionInput,
  CreateTaskInput,
  CreateTaskSeriesInput,
  DeleteHabitOccurrenceInput,
  DeleteTaskOccurrenceInput,
  DeleteWeeklyGoalInput,
  EditHabitOccurrenceInput,
  EditTaskOccurrenceInput,
  EditWeeklyGoalInput,
  EnsureCalendarWeekInput,
  HistoryQuery,
  MoveTaskToBacklogInput,
  MoveTaskToDateInput,
  OpenPeriodRange,
  RecordHabitOutcomeInput,
  ReorderDatedTasksInput,
  ReorderWeeklyGoalsInput,
  SaveDailyStateInput,
  SetTaskCompletionInput,
  StopHabitDefinitionInput,
  StopTaskSeriesInput,
  UpdateHabitRuleInput,
  UpdateTaskSeriesRuleInput,
  ValidationIssue,
} from '@/entities/planning/model/planning-repository';
import type { IsoWeekday, RecurrenceRule } from '@/entities/planning/model/recurrence';
import type {
  BacklogTaskPlacement,
  DayTaskPlacement,
  TaskTemplate,
} from '@/entities/planning/model/task';

export type ParseResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/**
 * Fields the `PlanningRepository` interface has never exposed. A caller must
 * not be able to stamp an audit instant on a specific record or choose when a
 * recurrence rule takes effect: the boundary comment at
 * `planning-repository.ts:291` calls both out as deliberately absent, and
 * allowing them now would let a caller backdate individual history entries.
 *
 * This is distinct from the `X-Orbit-Instant` header, which carries one clock
 * *reading* per request from which the server derives every timestamp.
 */
const FORBIDDEN_FIELDS = new Set([
  'occurredAt',
  'enteredAt',
  'finalizedAt',
  'updatedAt',
  'createdAt',
  'completedAt',
  'closedAt',
  'actualCompletedAt',
  'effectiveFrom',
  'effectiveThrough',
  'effectiveDate',
  'ruleRevision',
  'createdSequence',
  'sequence',
  'revision',
]);

class Issues {
  readonly list: ValidationIssue[] = [];

  add(field: string, message: string): void {
    this.list.push({ field, message });
  }

  get failed(): boolean {
    return this.list.length > 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectForbiddenFields(body: Record<string, unknown>, issues: Issues, path = ''): void {
  for (const [key, value] of Object.entries(body)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      issues.add(`${path}${key}`, 'This field is not part of the planning boundary');
      continue;
    }
    if (isRecord(value)) {
      rejectForbiddenFields(value, issues, `${path}${key}.`);
    }
  }
}

function requireBody(input: unknown, issues: Issues): Record<string, unknown> {
  if (!isRecord(input)) {
    issues.add('body', 'Request body must be a JSON object');
    return {};
  }

  rejectForbiddenFields(input, issues);
  return input;
}

function result<TValue>(issues: Issues, build: () => TValue): ParseResult<TValue> {
  return issues.failed ? { ok: false, issues: issues.list } : { ok: true, value: build() };
}

// ── field readers ────────────────────────────────────────────────────────────

function readString(body: Record<string, unknown>, field: string, issues: Issues): string {
  const value = body[field];
  if (typeof value !== 'string') {
    issues.add(field, `${field} must be a string`);
    return '';
  }
  return value;
}

function readOptionalString(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.add(field, `${field} must be a string`);
    return undefined;
  }
  return value;
}

/** `undefined` leaves the field unchanged; `null` explicitly clears it. */
function readClearableString(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): string | null | undefined {
  if (!Object.hasOwn(body, field)) return undefined;
  const value = body[field];
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.add(field, `${field} must be a string, null to clear it, or omitted`);
    return undefined;
  }
  return value;
}

function readLocalDate(body: Record<string, unknown>, field: string, issues: Issues): LocalDate {
  const parsed = parseLocalDate(body[field]);
  if (parsed === undefined) {
    issues.add(field, `${field} must be a YYYY-MM-DD calendar date`);
    return '' as LocalDate;
  }
  return parsed;
}

function readOptionalLocalDate(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): LocalDate | undefined {
  if (body[field] === undefined) return undefined;
  return readLocalDate(body, field, issues);
}

function readEntityId<TKind extends string>(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): EntityId<TKind> {
  const value = body[field];
  if (!isEntityId(value)) {
    issues.add(field, `${field} must be a UUID`);
    return '' as EntityId<TKind>;
  }
  return value as EntityId<TKind>;
}

function readRevision(body: Record<string, unknown>, field: string, issues: Issues): Revision {
  const value = body[field];
  if (!isRevision(value)) {
    issues.add(field, `${field} must be a non-negative integer revision`);
    return 0 as Revision;
  }
  return value;
}

function readDuration(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): DurationMinutes {
  const value = body[field];
  if (!isDurationMinutes(value)) {
    issues.add(field, `${field} must be a positive whole number of minutes`);
    return 1 as DurationMinutes;
  }
  return value;
}

function readOptionalDuration(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): DurationMinutes | undefined {
  if (body[field] === undefined) return undefined;
  return readDuration(body, field, issues);
}

function readDayPosition(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): DayPosition {
  const value = body[field];
  if (!isDayPosition(value)) {
    issues.add(field, `${field} must be a non-negative integer position`);
    return 0 as DayPosition;
  }
  return value;
}

function readOptionalDayPosition(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): DayPosition | undefined {
  if (body[field] === undefined) return undefined;
  return readDayPosition(body, field, issues);
}

function readIdList<TKind extends string>(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): readonly EntityId<TKind>[] {
  const value = body[field];
  if (!Array.isArray(value)) {
    issues.add(field, `${field} must be an array of UUIDs`);
    return [];
  }
  const ids: EntityId<TKind>[] = [];
  for (const [index, candidate] of value.entries()) {
    if (!isEntityId(candidate)) {
      issues.add(`${field}[${String(index)}]`, `${field} entries must be UUIDs`);
      continue;
    }
    ids.push(candidate as EntityId<TKind>);
  }
  return ids;
}

function readPlacement(
  body: Record<string, unknown>,
  issues: Issues,
): DayTaskPlacement | BacklogTaskPlacement {
  const placement = body.placement;
  if (!isRecord(placement)) {
    issues.add('placement', 'placement must be an object');
    return { kind: 'backlog' };
  }
  if (placement.kind === 'backlog') return { kind: 'backlog' };
  if (placement.kind === 'day') {
    return { kind: 'day', date: readLocalDate(placement, 'date', issues) };
  }
  issues.add('placement.kind', 'placement.kind must be "day" or "backlog"');
  return { kind: 'backlog' };
}

function readRecurrenceRule(body: Record<string, unknown>, issues: Issues): RecurrenceRule {
  const rule = body.recurrenceRule;
  if (!isRecord(rule)) {
    issues.add('recurrenceRule', 'recurrenceRule must be an object');
    return { startDate: '' as LocalDate, weekdays: [] };
  }

  const weekdaysValue = rule.weekdays;
  const weekdays: IsoWeekday[] = [];
  if (!Array.isArray(weekdaysValue)) {
    issues.add('recurrenceRule.weekdays', 'weekdays must be an array of ISO weekday numbers');
  } else {
    for (const [index, candidate] of weekdaysValue.entries()) {
      if (
        typeof candidate !== 'number' ||
        !Number.isInteger(candidate) ||
        candidate < 1 ||
        candidate > 7
      ) {
        issues.add(
          `recurrenceRule.weekdays[${String(index)}]`,
          'weekdays entries must be integers from 1 to 7',
        );
        continue;
      }
      weekdays.push(candidate as IsoWeekday);
    }
  }

  const startDate = readLocalDate(rule, 'startDate', issues);
  const endDate = readOptionalLocalDate(rule, 'endDate', issues);
  return { startDate, weekdays, ...(endDate === undefined ? {} : { endDate }) };
}

function readTaskTemplate(body: Record<string, unknown>, issues: Issues): TaskTemplate {
  const template = body.template;
  if (!isRecord(template)) {
    issues.add('template', 'template must be an object');
    return { title: '', plannedDurationMinutes: 1 as DurationMinutes };
  }

  const notes = readOptionalString(template, 'notes', issues);
  const startTime = readOptionalString(template, 'startTime', issues);
  const endTime = readOptionalString(template, 'endTime', issues);
  return {
    title: readString(template, 'title', issues),
    ...(notes === undefined ? {} : { notes }),
    plannedDurationMinutes: readDuration(template, 'plannedDurationMinutes', issues),
    ...(startTime === undefined ? {} : { startTime }),
    ...(endTime === undefined ? {} : { endTime }),
  };
}

function readFivePoint(
  body: Record<string, unknown>,
  field: string,
  issues: Issues,
): FivePointOrdinal | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!isFivePointOrdinal(value)) {
    issues.add(field, `${field} must be an integer from 1 to 5`);
    return undefined;
  }
  return value;
}

function readDispositions(
  body: Record<string, unknown>,
  issues: Issues,
): Record<string, CloseDayDisposition> {
  const dispositions = body.dispositions;
  if (!isRecord(dispositions)) {
    issues.add('dispositions', 'dispositions must be an object keyed by task occurrence id');
    return {};
  }

  const parsed: Record<string, CloseDayDisposition> = {};
  for (const [occurrenceId, value] of Object.entries(dispositions)) {
    const field = `dispositions.${occurrenceId}`;
    if (!isEntityId(occurrenceId)) {
      issues.add(field, 'disposition keys must be task occurrence UUIDs');
      continue;
    }
    if (!isRecord(value)) {
      issues.add(field, 'each disposition must be an object');
      continue;
    }

    switch (value.kind) {
      case 'keep-unfinished':
        parsed[occurrenceId] = { kind: 'keep-unfinished' };
        break;
      case 'move-to-backlog':
        parsed[occurrenceId] = { kind: 'move-to-backlog' };
        break;
      case 'cancel':
        parsed[occurrenceId] = { kind: 'cancel' };
        break;
      case 'move-to-date':
        parsed[occurrenceId] = {
          kind: 'move-to-date',
          destinationDate: readLocalDate(value, 'destinationDate', issues),
          durationMinutes: readDuration(value, 'durationMinutes', issues),
          dayPosition: readDayPosition(value, 'dayPosition', issues),
        };
        break;
      default:
        issues.add(
          `${field}.kind`,
          'disposition kind must be keep-unfinished, move-to-date, move-to-backlog, or cancel',
        );
    }
  }

  return parsed;
}

// ── per-endpoint parsers ─────────────────────────────────────────────────────

export function parseLocalDateArgument(input: unknown, field: string): ParseResult<LocalDate> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const value = readLocalDate(body, field, issues);
  return result(issues, () => value);
}

export function parseOccurrenceIdArgument(
  input: unknown,
  field: string,
): ParseResult<TaskOccurrenceId> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const value = readEntityId<'task-occurrence'>(body, field, issues);
  return result(issues, () => value);
}

export function parseEmpty(input: unknown): ParseResult<Record<string, never>> {
  const issues = new Issues();
  requireBody(input, issues);
  return result(issues, () => ({}));
}

export function parseHistoryQuery(input: unknown): ParseResult<HistoryQuery> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const anchorDate = readLocalDate(body, 'anchorDate', issues);

  switch (body.mode) {
    case 'day':
      return result(issues, () => ({ mode: 'day', anchorDate }));
    case 'week':
      return result(issues, () => ({ mode: 'week', anchorDate }));
    case 'month': {
      const selectedDate = readLocalDate(body, 'selectedDate', issues);
      return result(issues, () => ({ mode: 'month', anchorDate, selectedDate }));
    }
    default:
      issues.add('mode', 'mode must be "day", "week", or "month"');
      return { ok: false, issues: issues.list };
  }
}

export function parseOpenPeriodRange(input: unknown): ParseResult<OpenPeriodRange> {
  const issues = new Issues();
  const body = requireBody(input, issues);

  switch (body.kind) {
    case 'day': {
      const date = readLocalDate(body, 'date', issues);
      return result(issues, () => ({ kind: 'day', date }));
    }
    case 'week': {
      const weekStart = readLocalDate(body, 'weekStart', issues);
      return result(issues, () => ({ kind: 'week', weekStart }));
    }
    case 'month': {
      const anchorDate = readLocalDate(body, 'anchorDate', issues);
      return result(issues, () => ({ kind: 'month', anchorDate }));
    }
    default:
      issues.add('kind', 'kind must be "day", "week", or "month"');
      return { ok: false, issues: issues.list };
  }
}

export function parseEnsureCalendarWeek(input: unknown): ParseResult<EnsureCalendarWeekInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const date = readLocalDate(body, 'date', issues);
  return result(issues, () => ({ date }));
}

export function parseAddWeeklyGoal(input: unknown): ParseResult<AddWeeklyGoalInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const weekStart = readLocalDate(body, 'weekStart', issues);
  const statement = readString(body, 'statement', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ weekStart, statement, expectedRevision }));
}

export function parseEditWeeklyGoal(input: unknown): ParseResult<EditWeeklyGoalInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const weekStart = readLocalDate(body, 'weekStart', issues);
  const goalId = readEntityId<'weekly-goal'>(body, 'goalId', issues) as WeekGoalId;
  const statement = readString(body, 'statement', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ weekStart, goalId, statement, expectedRevision }));
}

export function parseReorderWeeklyGoals(input: unknown): ParseResult<ReorderWeeklyGoalsInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const weekStart = readLocalDate(body, 'weekStart', issues);
  const orderedGoalIds = readIdList<'weekly-goal'>(body, 'orderedGoalIds', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ weekStart, orderedGoalIds, expectedRevision }));
}

export function parseDeleteWeeklyGoal(input: unknown): ParseResult<DeleteWeeklyGoalInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const weekStart = readLocalDate(body, 'weekStart', issues);
  const goalId = readEntityId<'weekly-goal'>(body, 'goalId', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ weekStart, goalId, expectedRevision }));
}

export function parseCreateTask(input: unknown): ParseResult<CreateTaskInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const title = readString(body, 'title', issues);
  const notes = readOptionalString(body, 'notes', issues);
  const startTime = readOptionalString(body, 'startTime', issues);
  const endTime = readOptionalString(body, 'endTime', issues);
  const placement = readPlacement(body, issues);
  const durationMinutes = readOptionalDuration(body, 'durationMinutes', issues);
  const dayPosition = readOptionalDayPosition(body, 'dayPosition', issues);

  return result(issues, () => ({
    title,
    ...(notes === undefined ? {} : { notes }),
    ...(startTime === undefined ? {} : { startTime }),
    ...(endTime === undefined ? {} : { endTime }),
    placement,
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    ...(dayPosition === undefined ? {} : { dayPosition }),
  }));
}

export function parseEditTaskOccurrence(input: unknown): ParseResult<EditTaskOccurrenceInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'task-occurrence'>(body, 'occurrenceId', issues);
  const title = readOptionalString(body, 'title', issues);
  const notes = readOptionalString(body, 'notes', issues);
  const hasStartTime = Object.hasOwn(body, 'startTime');
  const hasEndTime = Object.hasOwn(body, 'endTime');
  const startTime = readClearableString(body, 'startTime', issues);
  const endTime = readClearableString(body, 'endTime', issues);
  const durationMinutes = readOptionalDuration(body, 'durationMinutes', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);

  return result(issues, () => ({
    occurrenceId,
    ...(title === undefined ? {} : { title }),
    ...(notes === undefined ? {} : { notes }),
    // An absent key means "leave unchanged"; an explicit null means "clear".
    // Collapsing the two would silently drop a clear request.
    ...(hasStartTime ? { startTime: startTime ?? null } : {}),
    ...(hasEndTime ? { endTime: endTime ?? null } : {}),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    expectedRevision,
  }));
}

export function parseSetTaskCompletion(input: unknown): ParseResult<SetTaskCompletionInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'task-occurrence'>(body, 'occurrenceId', issues);
  const date = readLocalDate(body, 'date', issues);
  if (typeof body.completed !== 'boolean') {
    issues.add('completed', 'completed must be a boolean');
  }
  const completed = body.completed === true;
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, date, completed, expectedRevision }));
}

export function parseMoveTaskToDate(input: unknown): ParseResult<MoveTaskToDateInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'task-occurrence'>(body, 'occurrenceId', issues);
  const destinationDate = readLocalDate(body, 'destinationDate', issues);
  const durationMinutes = readDuration(body, 'durationMinutes', issues);
  const dayPosition = readDayPosition(body, 'dayPosition', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({
    occurrenceId,
    destinationDate,
    durationMinutes,
    dayPosition,
    expectedRevision,
  }));
}

export function parseMoveTaskToBacklog(input: unknown): ParseResult<MoveTaskToBacklogInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'task-occurrence'>(body, 'occurrenceId', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, expectedRevision }));
}

export function parseDeleteTaskOccurrence(input: unknown): ParseResult<DeleteTaskOccurrenceInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'task-occurrence'>(body, 'occurrenceId', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, expectedRevision }));
}

export function parseReorderDatedTasks(input: unknown): ParseResult<ReorderDatedTasksInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const date = readLocalDate(body, 'date', issues);
  const orderedOccurrenceIds = readIdList<'task-occurrence'>(body, 'orderedOccurrenceIds', issues);
  const expectedDayRevision = readRevision(body, 'expectedDayRevision', issues);
  return result(issues, () => ({ date, orderedOccurrenceIds, expectedDayRevision }));
}

export function parseCreateTaskSeries(input: unknown): ParseResult<CreateTaskSeriesInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const template = readTaskTemplate(body, issues);
  const recurrenceRule = readRecurrenceRule(body, issues);
  return result(issues, () => ({ template, recurrenceRule }));
}

export function parseUpdateTaskSeriesRule(input: unknown): ParseResult<UpdateTaskSeriesRuleInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const seriesId = readEntityId<'task-series'>(body, 'seriesId', issues) as TaskSeriesId;
  const recurrenceRule = readRecurrenceRule(body, issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ seriesId, recurrenceRule, expectedRevision }));
}

export function parseStopTaskSeries(input: unknown): ParseResult<StopTaskSeriesInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const seriesId = readEntityId<'task-series'>(body, 'seriesId', issues) as TaskSeriesId;
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ seriesId, expectedRevision }));
}

export function parseCreateHabitDefinition(
  input: unknown,
): ParseResult<CreateHabitDefinitionInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const title = readString(body, 'title', issues);
  const recurrenceRule = readRecurrenceRule(body, issues);
  return result(issues, () => ({ title, recurrenceRule }));
}

export function parseUpdateHabitRule(input: unknown): ParseResult<UpdateHabitRuleInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const definitionId = readEntityId<'habit-definition'>(
    body,
    'definitionId',
    issues,
  ) as HabitDefinitionId;
  const recurrenceRule = readRecurrenceRule(body, issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ definitionId, recurrenceRule, expectedRevision }));
}

export function parseStopHabitDefinition(input: unknown): ParseResult<StopHabitDefinitionInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const definitionId = readEntityId<'habit-definition'>(
    body,
    'definitionId',
    issues,
  ) as HabitDefinitionId;
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ definitionId, expectedRevision }));
}

export function parseEditHabitOccurrence(input: unknown): ParseResult<EditHabitOccurrenceInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'habit-occurrence'>(
    body,
    'occurrenceId',
    issues,
  ) as HabitOccurrenceId;
  const title = readString(body, 'title', issues);
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, title, expectedRevision }));
}

export function parseRecordHabitOutcome(input: unknown): ParseResult<RecordHabitOutcomeInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'habit-occurrence'>(
    body,
    'occurrenceId',
    issues,
  ) as HabitOccurrenceId;
  if (body.outcome !== 'completed' && body.outcome !== 'not-completed') {
    issues.add('outcome', 'outcome must be "completed" or "not-completed"');
  }
  const outcome = body.outcome === 'completed' ? 'completed' : 'not-completed';
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, outcome, expectedRevision }));
}

function parseHabitOccurrenceCommand(
  input: unknown,
): ParseResult<CorrectBoundaryMissInput & ClearHabitOutcomeInput & DeleteHabitOccurrenceInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const occurrenceId = readEntityId<'habit-occurrence'>(
    body,
    'occurrenceId',
    issues,
  ) as HabitOccurrenceId;
  const expectedRevision = readRevision(body, 'expectedRevision', issues);
  return result(issues, () => ({ occurrenceId, expectedRevision }));
}

export const parseCorrectBoundaryMiss: (input: unknown) => ParseResult<CorrectBoundaryMissInput> =
  parseHabitOccurrenceCommand;
export const parseClearHabitOutcome: (input: unknown) => ParseResult<ClearHabitOutcomeInput> =
  parseHabitOccurrenceCommand;
export const parseDeleteHabitOccurrence: (
  input: unknown,
) => ParseResult<DeleteHabitOccurrenceInput> = parseHabitOccurrenceCommand;

export function parseSaveDailyState(input: unknown): ParseResult<SaveDailyStateInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const date = readLocalDate(body, 'date', issues);
  const energy = readFivePoint(body, 'energy', issues);
  const mood = readFivePoint(body, 'mood', issues);

  let sleepDurationMinutes: SaveDailyStateInput['sleepDurationMinutes'];
  if (body.sleepDurationMinutes !== undefined) {
    if (!isNonNegativeDurationMinutes(body.sleepDurationMinutes)) {
      issues.add('sleepDurationMinutes', 'sleepDurationMinutes must be a non-negative integer');
    } else {
      sleepDurationMinutes = body.sleepDurationMinutes;
    }
  }

  const expectedDayRevision = readRevision(body, 'expectedDayRevision', issues);
  return result(issues, () => ({
    date,
    ...(energy === undefined ? {} : { energy }),
    ...(mood === undefined ? {} : { mood }),
    ...(sleepDurationMinutes === undefined ? {} : { sleepDurationMinutes }),
    expectedDayRevision,
  }));
}

export function parseCloseDay(input: unknown): ParseResult<CloseDayInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const date = readLocalDate(body, 'date', issues);
  const expectedDayRevision = readRevision(body, 'expectedDayRevision', issues);
  const dispositions = readDispositions(body, issues);
  return result(issues, () => ({ date, expectedDayRevision, dispositions }));
}

export function parseCompleteWeek(input: unknown): ParseResult<CompleteWeekInput> {
  const issues = new Issues();
  const body = requireBody(input, issues);
  const weekStart = readLocalDate(body, 'weekStart', issues);
  const reflection = readOptionalString(body, 'reflection', issues);
  const expectedWeekRevision = readRevision(body, 'expectedWeekRevision', issues);
  return result(issues, () => ({
    weekStart,
    ...(reflection === undefined ? {} : { reflection }),
    expectedWeekRevision,
  }));
}
