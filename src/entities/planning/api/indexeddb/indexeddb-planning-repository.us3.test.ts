import { IDBFactory } from 'fake-indexeddb';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';

import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import type { OrbitPlanningDB } from './schema';

const DATABASE_NAME = 'orbit-us3-test';
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const THURSDAY = localDate('2026-08-13');
const FRIDAY = localDate('2026-08-14');
const NOW = instant('2026-08-11T08:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 500;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('IndexedDB planning repository — US3', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  afterEach(() => {
    repository.dispose();
  });

  it('validates series input and materializes an inclusive, bounded range idempotently', async () => {
    const invalid = await repository.createTaskSeries({
      template: { title: 'Invalid', plannedDurationMinutes: 0 as never },
      recurrenceRule: { startDate: MONDAY, weekdays: [] },
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });

    const series = await repository.createTaskSeries({
      template: { title: 'Focus block', plannedDurationMinutes: durationMinutes(25) },
      recurrenceRule: { startDate: TUESDAY, endDate: WEDNESDAY, weekdays: [2, 3] },
    });
    expect(series.ok).toBe(true);
    const habit = await repository.createHabitDefinition({
      title: 'Stretch',
      recurrenceRule: { startDate: MONDAY, endDate: WEDNESDAY, weekdays: [1, 2, 3] },
    });
    expect(habit.ok).toBe(true);

    const first = await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    const second = await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true, affectedDates: [], affectedWeeks: [] });

    const tasks = await database.getAll('taskOccurrences');
    expect(tasks.map((task) => task.nominalDate)).toEqual([TUESDAY, WEDNESDAY]);
    expect(tasks.map((task) => task.createdSequence)).toEqual([1, 2]);
    expect(tasks).toMatchObject([{ dayPosition: dayPosition(0) }, { dayPosition: dayPosition(0) }]);
    expect(await database.count('taskPlanEntries')).toBe(2);
    expect(await database.count('taskEvents')).toBe(0);

    const habits = await database.getAll('habitOccurrences');
    expect(habits.map((occurrence) => occurrence.date)).toEqual([MONDAY, TUESDAY, WEDNESDAY]);
    expect(habits[0]).toMatchObject({
      date: MONDAY,
      outcome: 'not-completed',
      outcomeEvents: [{ ordinal: 1, source: 'date-boundary', outcome: 'not-completed' }],
    });
  });

  it('appends generated rows after existing dated positions without an implicit list sort', async () => {
    const zuluExisting = await repository.createTask({
      title: 'Zulu existing',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(90),
      dayPosition: dayPosition(0),
    });
    const alphaExisting = await repository.createTask({
      title: 'Alpha existing',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(10),
      dayPosition: dayPosition(4),
    });
    if (!zuluExisting.ok || !alphaExisting.ok) throw new Error('existing task setup failed');

    const existingIds = [zuluExisting.value, alphaExisting.value];
    const existingBefore = await Promise.all(
      existingIds.map((occurrenceId) => database.get('taskOccurrences', occurrenceId)),
    );

    const zuluSeries = await repository.createTaskSeries({
      template: { title: 'Zulu recurring', plannedDurationMinutes: durationMinutes(90) },
      recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
    });
    const alphaSeries = await repository.createTaskSeries({
      template: { title: 'Alpha recurring', plannedDurationMinutes: durationMinutes(10) },
      recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
    });
    if (!zuluSeries.ok || !alphaSeries.ok) throw new Error('series setup failed');

    await expect(
      repository.prepareOpenPeriod({ kind: 'day', date: TUESDAY }),
    ).resolves.toMatchObject({ ok: true });

    const existingAfter = await Promise.all(
      existingIds.map((occurrenceId) => database.get('taskOccurrences', occurrenceId)),
    );
    expect(existingAfter).toEqual(existingBefore);

    const generated = (await database.getAll('taskOccurrences')).filter(
      (occurrence) => occurrence.seriesId !== undefined,
    );
    expect(generated).toMatchObject([
      {
        seriesId: zuluSeries.value,
        title: 'Zulu recurring',
        plannedDurationMinutes: durationMinutes(90),
        dayPosition: dayPosition(5),
      },
      {
        seriesId: alphaSeries.value,
        title: 'Alpha recurring',
        plannedDurationMinutes: durationMinutes(10),
        dayPosition: dayPosition(6),
      },
    ]);

    await expect(repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        tasks: [
          { occurrence: { title: 'Zulu existing', dayPosition: dayPosition(0) } },
          { occurrence: { title: 'Alpha existing', dayPosition: dayPosition(4) } },
          { occurrence: { title: 'Zulu recurring', dayPosition: dayPosition(5) } },
          { occurrence: { title: 'Alpha recurring', dayPosition: dayPosition(6) } },
        ],
      },
    });
  });

  it('coalesces D+1 rule edits and reconciles only untouched future rows', async () => {
    const created = await repository.createTaskSeries({
      template: { title: 'Recurring task', plannedDurationMinutes: durationMinutes(30) },
      recurrenceRule: { startDate: MONDAY, weekdays: [3, 4, 5] },
    });
    if (!created.ok) throw new Error(created.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const generated = await database.getAll('taskOccurrences');
    const wednesday = generated.find((occurrence) => occurrence.nominalDate === WEDNESDAY);
    const friday = generated.find((occurrence) => occurrence.nominalDate === FRIDAY);
    if (wednesday === undefined || friday === undefined) throw new Error('missing occurrences');
    await expect(
      repository.editTaskOccurrence({
        occurrenceId: wednesday.id,
        title: 'Personal exception',
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.deleteTaskOccurrence({
        occurrenceId: friday.id,
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      repository.updateTaskSeriesRule({
        seriesId: created.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [5] },
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.updateTaskSeriesRule({
        seriesId: created.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [3] },
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const series = await database.get('taskSeries', created.value);
    expect(series?.ruleVersions.map((version) => version.effectiveFrom)).toEqual([
      MONDAY,
      WEDNESDAY,
    ]);
    const afterRuleChange = await database.getAll('taskOccurrences');
    expect(
      afterRuleChange.find((occurrence) => occurrence.nominalDate === WEDNESDAY),
    ).toMatchObject({
      title: 'Personal exception',
      isException: true,
    });
    expect(afterRuleChange.some((occurrence) => occurrence.nominalDate === THURSDAY)).toBe(false);
    expect(afterRuleChange.find((occurrence) => occurrence.nominalDate === FRIDAY)).toMatchObject({
      state: 'deleted',
    });
    expect(
      (await database.getAll('taskPlanEntries')).some((entry) => entry.date === THURSDAY),
    ).toBe(false);

    await expect(
      repository.stopTaskSeries({ seriesId: created.value, expectedRevision: revision(2) }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(
      (await database.getAll('taskOccurrences')).some((row) => row.nominalDate === WEDNESDAY),
    ).toBe(true);
  });

  it('retains automatic miss and correction events and enforces owning-day revisions', async () => {
    const definition = await repository.createHabitDefinition({
      title: 'Journal',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const occurrences = await database.getAll('habitOccurrences');
    const monday = occurrences.find((occurrence) => occurrence.date === MONDAY);
    const tuesday = occurrences.find((occurrence) => occurrence.date === TUESDAY);
    if (monday === undefined || tuesday === undefined) throw new Error('missing habit occurrences');
    const mondayDay = await database.get('days', MONDAY);
    const tuesdayDay = await database.get('days', TUESDAY);
    if (mondayDay === undefined || tuesdayDay === undefined) throw new Error('missing days');

    const stale = await repository.correctBoundaryMissToCompleted({
      occurrenceId: monday.id,
      expectedRevision: revision(0),
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });
    await expect(
      repository.correctBoundaryMissToCompleted({
        occurrenceId: monday.id,
        expectedRevision: mondayDay.revision,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.editHabitOccurrence({
        occurrenceId: tuesday.id,
        title: 'Evening journal',
        expectedRevision: tuesdayDay.revision,
      }),
    ).resolves.toMatchObject({ ok: true });
    const tuesdayAfterEdit = await database.get('days', TUESDAY);
    if (tuesdayAfterEdit === undefined) throw new Error('missing Tuesday after edit');
    await expect(
      repository.recordHabitOutcome({
        occurrenceId: tuesday.id,
        outcome: 'completed',
        expectedRevision: tuesdayAfterEdit.revision,
      }),
    ).resolves.toMatchObject({ ok: true });

    const corrected = await database.get('habitOccurrences', monday.id);
    expect(corrected).toMatchObject({
      outcome: 'completed',
      outcomeEvents: [
        { ordinal: 1, source: 'date-boundary', outcome: 'not-completed' },
        { ordinal: 2, source: 'user-correction', outcome: 'completed' },
      ],
    });
    const recorded = await database.get('habitOccurrences', tuesday.id);
    expect(recorded).toMatchObject({
      outcome: 'completed',
      definitionSnapshot: { title: 'Evening journal' },
      isException: true,
      outcomeEvents: [{ ordinal: 1, source: 'user', outcome: 'completed' }],
    });

    const tuesdayAfterOutcome = await database.get('days', TUESDAY);
    if (tuesdayAfterOutcome === undefined) throw new Error('missing Tuesday after outcome');
    await expect(
      repository.deleteHabitOccurrence({
        occurrenceId: tuesday.id,
        expectedRevision: tuesdayAfterOutcome.revision,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.updateHabitRule({
        definitionId: definition.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [3] },
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.stopHabitDefinition({
        definitionId: definition.value,
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    repository.dispose();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    expect(await database.get('habitOccurrences', monday.id)).toMatchObject({
      outcome: 'completed',
      outcomeEvents: [{ source: 'date-boundary' }, { source: 'user-correction' }],
    });
    expect(await database.get('habitOccurrences', tuesday.id)).toMatchObject({
      outcome: 'deleted',
      isException: true,
      outcomeEvents: [{ source: 'user' }],
    });
    expect(await database.get('habitDefinitions', definition.value)).toMatchObject({
      revision: revision(2),
      ruleVersions: [{ state: 'active' }, { effectiveFrom: WEDNESDAY, state: 'stopped' }],
    });
  });
});
