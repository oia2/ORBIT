import { describe, expect, it } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  revision,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek } from '@/shared/lib/local-date/local-date';

import type { HabitDefinition, HabitOccurrence } from './habit';
import {
  habitOccurrenceNaturalKey,
  planOccurrenceMaterialization,
  taskOccurrenceNaturalKey,
} from './occurrence-materialization';
import type { ActiveRecurrenceRuleVersion } from './recurrence';
import type { TaskOccurrence, TaskPlanEntry, TaskSeries } from './task';

const SERIES_ID = entityId<'task-series'>('00000000-0000-4000-8000-000000000101');
const LATE_SORT_SERIES_ID = entityId<'task-series'>('00000000-0000-4000-8000-000000000999');
const EARLY_SORT_SERIES_ID = entityId<'task-series'>('00000000-0000-4000-8000-000000000100');
const DEFINITION_ID = entityId<'habit-definition'>('00000000-0000-4000-8000-000000000102');
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const THURSDAY = localDate('2026-08-13');

function activeVersion(weekdays: ActiveRecurrenceRuleVersion['rule']['weekdays']) {
  return {
    revision: revision(0),
    effectiveFrom: localDate('2026-08-01'),
    state: 'active' as const,
    rule: { startDate: localDate('2026-08-01'), weekdays },
  };
}

function taskSeries(
  weekdays: ActiveRecurrenceRuleVersion['rule']['weekdays'],
  options: {
    readonly id?: TaskSeries['id'];
    readonly title?: string;
    readonly duration?: number;
  } = {},
): TaskSeries {
  return {
    id: options.id ?? SERIES_ID,
    template: {
      title: options.title ?? 'Recurring task',
      plannedDurationMinutes: durationMinutes(options.duration ?? 25),
    },
    ruleVersions: [activeVersion(weekdays)],
    revision: revision(0),
  };
}

function habitDefinition(
  weekdays: ActiveRecurrenceRuleVersion['rule']['weekdays'],
): HabitDefinition {
  return {
    id: DEFINITION_ID,
    title: 'Habit',
    ruleVersions: [activeVersion(weekdays)],
    revision: revision(0),
  };
}

function generatedTask(
  date: typeof MONDAY,
  options: { isException?: boolean; state?: 'active' | 'deleted' } = {},
): TaskOccurrence {
  const common = {
    id: entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000201'),
    seriesId: SERIES_ID,
    nominalDate: date,
    ruleRevision: revision(0),
    title: 'Recurring task',
    plannedDurationMinutes: durationMinutes(25),
    isException: options.isException ?? false,
    createdSequence: creationSequence(1),
    revision: revision(0),
  };

  return options.state === 'deleted'
    ? { ...common, state: 'deleted', placement: { kind: 'none' } }
    : {
        ...common,
        state: 'active',
        placement: { kind: 'day', date },
        dayPosition: dayPosition(0),
        completion: 'incomplete',
      };
}

function existingDatedTask(
  id: TaskOccurrence['id'],
  title: string,
  date: typeof TUESDAY,
  position: number,
  sequence: number,
): TaskOccurrence {
  return {
    id,
    title,
    plannedDurationMinutes: durationMinutes(title.startsWith('Zulu') ? 90 : 10),
    isException: false,
    createdSequence: creationSequence(sequence),
    revision: revision(0),
    state: 'active',
    placement: { kind: 'day', date },
    dayPosition: dayPosition(position),
    completion: 'incomplete',
  };
}

function generatedMembership(date: typeof MONDAY): TaskPlanEntry {
  return {
    id: entityId<'task-plan-entry'>('00000000-0000-4000-8000-000000000301'),
    occurrenceId: entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000201'),
    date,
    weekStart: startOfWeek(date),
    plannedSnapshot: {
      title: 'Recurring task',
      plannedDurationMinutes: durationMinutes(25),
    },
    outcome: 'planned',
    enteredAt: instant('2026-08-10T00:00:00.000Z'),
  };
}

function generatedHabit(
  date: typeof MONDAY,
  outcome: HabitOccurrence['outcome'] = 'pending',
): HabitOccurrence {
  return {
    id: entityId<'habit-occurrence'>('00000000-0000-4000-8000-000000000401'),
    definitionId: DEFINITION_ID,
    date,
    weekStart: startOfWeek(date),
    definitionSnapshot: { title: 'Habit' },
    ruleRevision: revision(0),
    isException: false,
    outcome,
    outcomeEvents: [],
    updatedAt: instant('2026-08-10T00:00:00.000Z'),
  };
}

describe('bounded occurrence materialization', () => {
  it('creates one natural-keyed task bundle and habit occurrence per applicable open date', () => {
    const effects = planOccurrenceMaterialization({
      openDates: [MONDAY, TUESDAY, TUESDAY, WEDNESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([1, 2, 3])],
      habitDefinitions: [habitDefinition([1, 2, 3])],
      taskOccurrences: [],
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [],
    });

    expect(effects.createTaskBundles.map((effect) => effect.nominalDate)).toEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
    ]);
    expect(effects.createHabitOccurrences.map((effect) => effect.date)).toEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
    ]);
    expect(effects.createTaskBundles).toMatchObject([
      { dayPosition: dayPosition(0) },
      { dayPosition: dayPosition(0) },
      { dayPosition: dayPosition(0) },
    ]);
    expect(effects.taskEvents).toEqual([]);
    expect(new Set(effects.createTaskBundles.map((effect) => effect.naturalKey)).size).toBe(3);
  });

  it('uses stable series/date and definition/date natural keys', () => {
    expect(taskOccurrenceNaturalKey(SERIES_ID, MONDAY)).toEqual(`${SERIES_ID}|${MONDAY}`);
    expect(habitOccurrenceNaturalKey(DEFINITION_ID, MONDAY)).toEqual(`${DEFINITION_ID}|${MONDAY}`);
  });

  it('appends multiple generated rows after the final position without sorting or mutating existing tasks', () => {
    const existingTasks: TaskOccurrence[] = [
      existingDatedTask(
        entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000211'),
        'Zulu existing',
        TUESDAY,
        0,
        1,
      ),
      existingDatedTask(
        entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000212'),
        'Alpha existing',
        TUESDAY,
        4,
        2,
      ),
    ];
    const existingBytes = JSON.stringify(existingTasks);

    const effects = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [
        taskSeries([2], {
          id: LATE_SORT_SERIES_ID,
          title: 'Zulu recurring',
          duration: 90,
        }),
        taskSeries([2], {
          id: EARLY_SORT_SERIES_ID,
          title: 'Alpha recurring',
          duration: 10,
        }),
      ],
      habitDefinitions: [],
      taskOccurrences: existingTasks,
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [],
    });

    expect(JSON.stringify(existingTasks)).toBe(existingBytes);
    expect(effects.createTaskBundles).toMatchObject([
      {
        seriesId: LATE_SORT_SERIES_ID,
        title: 'Zulu recurring',
        plannedDurationMinutes: durationMinutes(90),
        dayPosition: dayPosition(5),
      },
      {
        seriesId: EARLY_SORT_SERIES_ID,
        title: 'Alpha recurring',
        plannedDurationMinutes: durationMinutes(10),
        dayPosition: dayPosition(6),
      },
    ]);
  });

  it('is idempotent when the natural-keyed occurrences already exist', () => {
    const effects = planOccurrenceMaterialization({
      openDates: [MONDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([1])],
      habitDefinitions: [habitDefinition([1])],
      taskOccurrences: [generatedTask(MONDAY)],
      taskPlanEntries: [generatedMembership(MONDAY)],
      taskEvents: [],
      habitOccurrences: [generatedHabit(MONDAY)],
    });

    expect(effects.createTaskBundles).toEqual([]);
    expect(effects.createHabitOccurrences).toEqual([]);
    expect(effects.removeTaskBundles).toEqual([]);
    expect(effects.removeHabitOccurrences).toEqual([]);
  });

  it('preserves explicit future exceptions/tombstones while materializing untouched siblings', () => {
    const exception = generatedTask(TUESDAY, { isException: true });
    const tombstone = {
      ...generatedTask(WEDNESDAY, { state: 'deleted' }),
      id: entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000202'),
    };
    const habitTombstone = generatedHabit(TUESDAY, 'deleted');

    const effects = planOccurrenceMaterialization({
      openDates: [TUESDAY, WEDNESDAY, THURSDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([2, 3, 4])],
      habitDefinitions: [habitDefinition([2, 3, 4])],
      taskOccurrences: [exception, tombstone],
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [habitTombstone],
    });

    expect(effects.createTaskBundles.map((effect) => effect.nominalDate)).toEqual([THURSDAY]);
    expect(effects.removeTaskBundles).toEqual([]);
    expect(effects.createHabitOccurrences.map((effect) => effect.date)).toEqual([
      WEDNESDAY,
      THURSDAY,
    ]);
    expect(effects.removeHabitOccurrences).toEqual([]);
  });

  it('removes only an untouched future occurrence/membership bundle and can materialize it later', () => {
    const occurrence = generatedTask(TUESDAY);
    const membership = generatedMembership(TUESDAY);
    const first = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([1])],
      habitDefinitions: [],
      taskOccurrences: [occurrence],
      taskPlanEntries: [membership],
      taskEvents: [],
      habitOccurrences: [],
    });

    expect(first.removeTaskBundles).toEqual([
      { occurrenceId: occurrence.id, planEntryId: membership.id },
    ]);
    expect(first.taskEvents).toEqual([]);

    const later = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([2])],
      habitDefinitions: [],
      taskOccurrences: [],
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [],
    });

    expect(later.createTaskBundles).toHaveLength(1);
    expect(later.createTaskBundles[0]?.nominalDate).toBe(TUESDAY);
    expect(JSON.stringify(later)).not.toContain('suppressed');
  });

  it('removes and later re-materializes an untouched future habit occurrence', () => {
    const occurrence = generatedHabit(TUESDAY);
    const first = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [],
      habitDefinitions: [habitDefinition([1])],
      taskOccurrences: [],
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [occurrence],
    });

    expect(first.removeHabitOccurrences).toEqual([{ occurrenceId: occurrence.id }]);

    const later = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [],
      habitDefinitions: [habitDefinition([2])],
      taskOccurrences: [],
      taskPlanEntries: [],
      taskEvents: [],
      habitOccurrences: [],
    });

    expect(later.createHabitOccurrences).toHaveLength(1);
    expect(later.createHabitOccurrences[0]?.date).toBe(TUESDAY);
  });

  it('does not remove a touched future task or generate outside the supplied open dates', () => {
    const occurrence = generatedTask(TUESDAY);
    const membership = generatedMembership(TUESDAY);
    const taskEvent = {
      id: entityId<'task-event'>('00000000-0000-4000-8000-000000000501'),
      sequence: eventSequence(1),
      occurrenceId: occurrence.id,
      effectiveDate: TUESDAY,
      occurredAt: instant('2026-08-10T00:00:00.000Z'),
      type: 'edit' as const,
      payload: {
        before: { title: 'Recurring task' },
        after: { title: 'Changed' },
      },
    };

    const effects = planOccurrenceMaterialization({
      openDates: [TUESDAY],
      currentLocalDate: MONDAY,
      taskSeries: [taskSeries([1])],
      habitDefinitions: [],
      taskOccurrences: [occurrence],
      taskPlanEntries: [membership],
      taskEvents: [taskEvent],
      habitOccurrences: [],
    });

    expect(effects.removeTaskBundles).toEqual([]);
    expect(effects.createTaskBundles).toEqual([]);
  });
});
