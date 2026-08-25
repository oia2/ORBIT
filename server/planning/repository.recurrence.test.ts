import { beforeEach, describe, expect, it } from 'vitest';

import { latestRecurrenceRule } from '@/entities/planning/model/recurrence';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';

import {
  createRepositoryUnderTest,
  reopenRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

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

describe('PostgreSQL planning repository — US3', () => {
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
    await repository.ensureCalendarWeek({ date: MONDAY });
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

    const tasks = await database.getAllTaskOccurrences();
    expect(tasks.map((task) => task.nominalDate)).toEqual([TUESDAY, WEDNESDAY]);
    expect(tasks.map((task) => task.createdSequence)).toEqual([1, 2]);
    expect(tasks).toMatchObject([{ dayPosition: dayPosition(0) }, { dayPosition: dayPosition(0) }]);
    expect(await database.countPlanEntries()).toBe(2);
    expect(await database.countTaskEvents()).toBe(0);

    const habits = await database.getAllHabitOccurrences();
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
      existingIds.map((occurrenceId) => database.getTaskOccurrence(occurrenceId)),
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
      existingIds.map((occurrenceId) => database.getTaskOccurrence(occurrenceId)),
    );
    expect(existingAfter).toEqual(existingBefore);

    const generated = (await database.getAllTaskOccurrences()).filter(
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

    const generated = await database.getAllTaskOccurrences();
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

    const series = await database.getTaskSeries(created.value);
    expect(series?.ruleVersions.map((version) => version.effectiveFrom)).toEqual([
      MONDAY,
      WEDNESDAY,
    ]);
    const afterRuleChange = await database.getAllTaskOccurrences();
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
    expect((await database.getAllPlanEntries()).some((entry) => entry.date === THURSDAY)).toBe(
      false,
    );

    await expect(
      repository.stopTaskSeries({ seriesId: created.value, expectedRevision: revision(2) }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(
      (await database.getAllTaskOccurrences()).some((row) => row.nominalDate === WEDNESDAY),
    ).toBe(true);
  });

  it('projects the habit definition a day’s recurrence editor needs, and keeps it usable after an edit', async () => {
    const definition = await repository.createHabitDefinition({
      title: 'Journal',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const initialView = await repository.getDayView(TUESDAY);
    if (!initialView.ok) throw new Error(initialView.error.code);
    expect(initialView.value.habitDefinitions).toHaveLength(1);
    const [initialDefinition] = initialView.value.habitDefinitions;
    if (initialDefinition === undefined) throw new Error('missing habit definition');
    // The whole schedule, not just the weekday of the day being looked at.
    expect(latestRecurrenceRule(initialDefinition.ruleVersions)).toMatchObject({
      startDate: MONDAY,
      weekdays: [1, 2],
    });

    await expect(
      repository.updateHabitRule({
        definitionId: definition.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [1, 2, 4] },
        expectedRevision: initialDefinition.revision,
      }),
    ).resolves.toMatchObject({ ok: true });

    const editedView = await repository.getDayView(TUESDAY);
    if (!editedView.ok) throw new Error(editedView.error.code);
    const [editedDefinition] = editedView.value.habitDefinitions;
    const occurrence = editedView.value.habits[0];
    if (editedDefinition === undefined || occurrence === undefined) {
      throw new Error('missing habit projection');
    }
    // The change takes effect tomorrow, so today's occurrence still points at
    // the revision it was materialized from. Guarding a series command with it
    // is what used to make a second edit or a stop fail for the rest of the day.
    expect(occurrence.ruleRevision).toBe(initialDefinition.revision);
    expect(editedDefinition.revision).not.toBe(occurrence.ruleRevision);
    expect(latestRecurrenceRule(editedDefinition.ruleVersions)).toMatchObject({
      weekdays: [1, 2, 4],
    });

    await expect(
      repository.stopHabitDefinition({
        definitionId: definition.value,
        expectedRevision: occurrence.ruleRevision,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });
    await expect(
      repository.stopHabitDefinition({
        definitionId: definition.value,
        expectedRevision: editedDefinition.revision,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('materializes a weekday added to a habit today on that same day', async () => {
    // The clock's current date is Tuesday; the habit runs on Mondays only.
    const definition = await repository.createHabitDefinition({
      title: 'Journal',
      recurrenceRule: { startDate: MONDAY, weekdays: [1] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(
      (await database.getAllHabitOccurrences()).some((occurrence) => occurrence.date === TUESDAY),
    ).toBe(false);

    await expect(
      repository.updateHabitRule({
        definitionId: definition.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const tuesday = (await database.getAllHabitOccurrences()).find(
      (occurrence) => occurrence.date === TUESDAY,
    );
    expect(tuesday).toMatchObject({ outcome: 'pending', ruleRevision: revision(1) });
    const view = await repository.getDayView(TUESDAY);
    if (!view.ok) throw new Error(view.error.code);
    expect(view.value.habits).toHaveLength(1);
  });

  it('keeps the current day’s habit record when its weekday is dropped today', async () => {
    const definition = await repository.createHabitDefinition({
      title: 'Journal',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    const before = (await database.getAllHabitOccurrences()).find(
      (occurrence) => occurrence.date === TUESDAY,
    );
    if (before === undefined) throw new Error('missing Tuesday occurrence');

    await expect(
      repository.updateHabitRule({
        definitionId: definition.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [4] },
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    // Today is no longer scheduled, but what it already formed is not erased.
    expect(await database.getHabitOccurrence(before.id)).toMatchObject({ id: before.id });
    // A future day that lost its weekday is reconciled away as before.
    expect(
      (await database.getAllHabitOccurrences()).some((occurrence) => occurrence.date === FRIDAY),
    ).toBe(false);
  });

  it('projects the task series a recurrence editor needs, and keeps it usable after an edit', async () => {
    const series = await repository.createTaskSeries({
      template: { title: 'Focus block', plannedDurationMinutes: durationMinutes(25) },
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!series.ok) throw new Error(series.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const initialView = await repository.getDayView(TUESDAY);
    if (!initialView.ok) throw new Error(initialView.error.code);
    const [initialSeries] = initialView.value.taskSeries;
    if (initialSeries === undefined) throw new Error('missing task series');
    expect(latestRecurrenceRule(initialSeries.ruleVersions)).toMatchObject({ weekdays: [1, 2] });

    await expect(
      repository.updateTaskSeriesRule({
        seriesId: series.value,
        recurrenceRule: { startDate: MONDAY, weekdays: [1, 2, 4] },
        expectedRevision: initialSeries.revision,
      }),
    ).resolves.toMatchObject({ ok: true });

    const editedView = await repository.getDayView(TUESDAY);
    if (!editedView.ok) throw new Error(editedView.error.code);
    const [editedSeries] = editedView.value.taskSeries;
    const occurrence = editedView.value.tasks[0]?.occurrence;
    if (editedSeries === undefined || occurrence === undefined) {
      throw new Error('missing task projection');
    }
    expect(occurrence.ruleRevision).toBe(initialSeries.revision);
    expect(editedSeries.revision).not.toBe(occurrence.ruleRevision);

    await expect(
      repository.stopTaskSeries({
        seriesId: series.value,
        expectedRevision: occurrence.ruleRevision ?? revision(0),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });
    await expect(
      repository.stopTaskSeries({
        seriesId: series.value,
        expectedRevision: editedSeries.revision,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('retains automatic miss and correction events and enforces owning-day revisions', async () => {
    const definition = await repository.createHabitDefinition({
      title: 'Journal',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const occurrences = await database.getAllHabitOccurrences();
    const monday = occurrences.find((occurrence) => occurrence.date === MONDAY);
    const tuesday = occurrences.find((occurrence) => occurrence.date === TUESDAY);
    if (monday === undefined || tuesday === undefined) throw new Error('missing habit occurrences');
    const mondayDay = await database.getDay(MONDAY);
    const tuesdayDay = await database.getDay(TUESDAY);
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
    const tuesdayAfterEdit = await database.getDay(TUESDAY);
    if (tuesdayAfterEdit === undefined) throw new Error('missing Tuesday after edit');
    await expect(
      repository.recordHabitOutcome({
        occurrenceId: tuesday.id,
        outcome: 'completed',
        expectedRevision: tuesdayAfterEdit.revision,
      }),
    ).resolves.toMatchObject({ ok: true });

    const corrected = await database.getHabitOccurrence(monday.id);
    expect(corrected).toMatchObject({
      outcome: 'completed',
      outcomeEvents: [
        { ordinal: 1, source: 'date-boundary', outcome: 'not-completed' },
        { ordinal: 2, source: 'user-correction', outcome: 'completed' },
      ],
    });
    const recorded = await database.getHabitOccurrence(tuesday.id);
    expect(recorded).toMatchObject({
      outcome: 'completed',
      definitionSnapshot: { title: 'Evening journal' },
      isException: true,
      outcomeEvents: [{ ordinal: 1, source: 'user', outcome: 'completed' }],
    });

    const tuesdayAfterOutcome = await database.getDay(TUESDAY);
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

    const reopened = await reopenRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    database = reopened.database;
    expect(await database.getHabitOccurrence(monday.id)).toMatchObject({
      outcome: 'completed',
      outcomeEvents: [{ source: 'date-boundary' }, { source: 'user-correction' }],
    });
    expect(await database.getHabitOccurrence(tuesday.id)).toMatchObject({
      outcome: 'deleted',
      isException: true,
      outcomeEvents: [{ source: 'user' }],
    });
    // A habit's rule change starts on the current date, so the Tuesday edit is a
    // version of its own rather than being folded into the Wednesday boundary.
    expect(await database.getHabitDefinition(definition.value)).toMatchObject({
      revision: revision(2),
      ruleVersions: [
        { effectiveFrom: MONDAY, effectiveThrough: MONDAY, state: 'active' },
        { effectiveFrom: TUESDAY, effectiveThrough: TUESDAY, state: 'active' },
        { effectiveFrom: WEDNESDAY, state: 'stopped' },
      ],
    });
  });
});
