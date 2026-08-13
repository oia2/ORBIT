import { isDurationMinutes, type Revision } from '@/shared/lib/ids';
import {
  addDays,
  compareLocalDates,
  isLocalDate,
  isoWeekday,
  type IsoWeekday,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import type { TaskTemplate } from './task';

export type { IsoWeekday } from '@/shared/lib/local-date/local-date';

/**
 * A serializable weekday recurrence. `endDate`, when present, is inclusive.
 * Arrays are used instead of Set so the value can be structured-cloned.
 */
export interface RecurrenceRule {
  readonly startDate: LocalDate;
  readonly weekdays: readonly IsoWeekday[];
  readonly endDate?: LocalDate;
}

interface RecurrenceRuleVersionBase {
  readonly revision: Revision;
  readonly effectiveFrom: LocalDate;
  readonly effectiveThrough?: LocalDate;
}

export interface ActiveRecurrenceRuleVersion extends RecurrenceRuleVersionBase {
  readonly state: 'active';
  readonly rule: RecurrenceRule;
}

export interface StoppedRecurrenceRuleVersion extends RecurrenceRuleVersionBase {
  readonly state: 'stopped';
}

/**
 * Ordered, non-overlapping effective history. Active/stopped series state is
 * derived from the final version and is not persisted separately.
 */
export type RecurrenceRuleVersion = ActiveRecurrenceRuleVersion | StoppedRecurrenceRuleVersion;

export type RecurrenceValidationError =
  | {
      readonly code: 'InvalidDuration';
      readonly field: 'plannedDurationMinutes';
    }
  | { readonly code: 'InvalidStartDate'; readonly field: 'startDate' }
  | { readonly code: 'InvalidEndDate'; readonly field: 'endDate' }
  | { readonly code: 'WeekdaysRequired'; readonly field: 'weekdays' }
  | {
      readonly code: 'InvalidWeekday';
      readonly field: 'weekdays';
      readonly value: unknown;
    }
  | {
      readonly code: 'DuplicateWeekday';
      readonly field: 'weekdays';
      readonly value: IsoWeekday;
    }
  | { readonly code: 'InvalidDateRange'; readonly field: 'endDate' };

export function validateRecurringTaskTemplate(
  template: TaskTemplate,
): Result<TaskTemplate, readonly RecurrenceValidationError[]> {
  if (!isDurationMinutes(template.plannedDurationMinutes)) {
    return err([
      {
        code: 'InvalidDuration',
        field: 'plannedDurationMinutes',
      },
    ]);
  }

  return ok(template);
}

function isIsoWeekday(value: unknown): value is IsoWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

export function validateRecurrenceRule(
  rule: RecurrenceRule,
): Result<RecurrenceRule, readonly RecurrenceValidationError[]> {
  const errors: RecurrenceValidationError[] = [];

  if (!isLocalDate(rule.startDate)) {
    errors.push({ code: 'InvalidStartDate', field: 'startDate' });
  }

  if (rule.endDate !== undefined && !isLocalDate(rule.endDate)) {
    errors.push({ code: 'InvalidEndDate', field: 'endDate' });
  }

  if (rule.weekdays.length === 0) {
    errors.push({ code: 'WeekdaysRequired', field: 'weekdays' });
  }

  const seenWeekdays = new Set<IsoWeekday>();
  for (const weekday of rule.weekdays as readonly unknown[]) {
    if (!isIsoWeekday(weekday)) {
      errors.push({ code: 'InvalidWeekday', field: 'weekdays', value: weekday });
      continue;
    }

    if (seenWeekdays.has(weekday)) {
      errors.push({ code: 'DuplicateWeekday', field: 'weekdays', value: weekday });
    }
    seenWeekdays.add(weekday);
  }

  if (
    isLocalDate(rule.startDate) &&
    rule.endDate !== undefined &&
    isLocalDate(rule.endDate) &&
    compareLocalDates(rule.endDate, rule.startDate) < 0
  ) {
    errors.push({ code: 'InvalidDateRange', field: 'endDate' });
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok({
    startDate: rule.startDate,
    weekdays: [...seenWeekdays].sort((left, right) => left - right),
    ...(rule.endDate === undefined ? {} : { endDate: rule.endDate }),
  });
}

/** End dates are inclusive. Invalid runtime values simply do not apply. */
export function isRecurrenceDateApplicable(rule: RecurrenceRule, date: LocalDate): boolean {
  if (!isLocalDate(date) || !validateRecurrenceRule(rule).ok) {
    return false;
  }

  if (compareLocalDates(date, rule.startDate) < 0) {
    return false;
  }

  if (rule.endDate !== undefined && compareLocalDates(date, rule.endDate) > 0) {
    return false;
  }

  return rule.weekdays.includes(isoWeekday(date));
}

export function effectiveRecurrenceVersionOn(
  versions: readonly RecurrenceRuleVersion[],
  date: LocalDate,
): RecurrenceRuleVersion | undefined {
  let selected: RecurrenceRuleVersion | undefined;

  for (const version of versions) {
    const hasStarted = compareLocalDates(version.effectiveFrom, date) <= 0;
    const hasNotEnded =
      version.effectiveThrough === undefined ||
      compareLocalDates(date, version.effectiveThrough) <= 0;
    if (
      hasStarted &&
      hasNotEnded &&
      (selected === undefined ||
        compareLocalDates(version.effectiveFrom, selected.effectiveFrom) > 0)
    ) {
      selected = version;
    }
  }

  return selected;
}

export function isRecurrenceApplicableOn(
  versions: readonly RecurrenceRuleVersion[],
  date: LocalDate,
): boolean {
  const version = effectiveRecurrenceVersionOn(versions, date);
  return version?.state === 'active' && isRecurrenceDateApplicable(version.rule, date);
}

export function createInitialRecurrenceVersion(
  rule: RecurrenceRule,
  revision: Revision,
): Result<ActiveRecurrenceRuleVersion, readonly RecurrenceValidationError[]> {
  const validation = validateRecurrenceRule(rule);
  if (!validation.ok) {
    return validation;
  }

  return ok({
    revision,
    effectiveFrom: validation.value.startDate,
    state: 'active',
    rule: validation.value,
  });
}

interface RecurrenceChangeBase {
  readonly ruleVersions: readonly RecurrenceRuleVersion[];
  readonly currentLocalDate: LocalDate;
  readonly revision: Revision;
}

export interface ApplyRecurrenceRuleChangeInput extends RecurrenceChangeBase {
  readonly nextRule: RecurrenceRule;
}

export interface StopRecurrenceInput {
  readonly ruleVersions: readonly RecurrenceRuleVersion[];
  readonly currentLocalDate: LocalDate;
  readonly revision: Revision;
}

function prepareVersionsForNextDate(
  versions: readonly RecurrenceRuleVersion[],
  currentLocalDate: LocalDate,
): RecurrenceRuleVersion[] {
  const boundary = addDays(currentLocalDate, 1);
  const retained = versions
    .filter((version) => compareLocalDates(version.effectiveFrom, boundary) < 0)
    .sort((left, right) => compareLocalDates(left.effectiveFrom, right.effectiveFrom));

  const last = retained.at(-1);
  if (
    last !== undefined &&
    (last.effectiveThrough === undefined ||
      compareLocalDates(last.effectiveThrough, currentLocalDate) > 0)
  ) {
    retained[retained.length - 1] = {
      ...last,
      effectiveThrough: currentLocalDate,
    };
  }

  return retained;
}

export function applyRecurrenceRuleChange(
  input: ApplyRecurrenceRuleChangeInput,
): Result<readonly RecurrenceRuleVersion[], readonly RecurrenceValidationError[]> {
  const validation = validateRecurrenceRule(input.nextRule);
  if (!validation.ok) {
    return validation;
  }

  const versions = prepareVersionsForNextDate(input.ruleVersions, input.currentLocalDate);
  versions.push({
    revision: input.revision,
    effectiveFrom: addDays(input.currentLocalDate, 1),
    state: 'active',
    rule: validation.value,
  });

  return ok(versions);
}

export function stopRecurrence(input: StopRecurrenceInput): readonly RecurrenceRuleVersion[] {
  const versions = prepareVersionsForNextDate(input.ruleVersions, input.currentLocalDate);
  versions.push({
    revision: input.revision,
    effectiveFrom: addDays(input.currentLocalDate, 1),
    state: 'stopped',
  });
  return versions;
}

export interface OccurrenceRuleChangeProtection {
  readonly occurrenceDate: LocalDate;
  readonly currentLocalDate: LocalDate;
  readonly isException: boolean;
  readonly isUserDeleted: boolean;
}

export function shouldPreserveOccurrenceForRuleChange(
  occurrence: OccurrenceRuleChangeProtection,
): boolean {
  return (
    compareLocalDates(occurrence.occurrenceDate, occurrence.currentLocalDate) <= 0 ||
    occurrence.isException ||
    occurrence.isUserDeleted
  );
}
