import { describe, expect, it, vi } from 'vitest';

import type {
  CommandResult,
  OpenPeriodRange,
  PlanningRepository,
} from '@/entities/planning/model/planning-repository';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate, type LocalDate } from '@/shared/lib/local-date/local-date';

import {
  createHabitBoundaryCoordinator,
  type BoundaryCheckScheduler,
  type VisibilityResumeSource,
} from './habit-boundary';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const SUNDAY = localDate('2026-08-16');
const NEXT_MONDAY = localDate('2026-08-17');

const successfulPreparation: CommandResult = {
  ok: true,
  value: undefined,
  affectedDates: [],
  affectedWeeks: [],
};

interface ControllableClock extends ApplicationClock {
  setCurrentLocalDate(date: LocalDate): void;
}

function controllableClock(initialDate = MONDAY): ControllableClock {
  let currentDate = initialDate;
  let currentInstant = instant('2026-08-10T08:00:00.000Z');
  return {
    now: () => currentInstant,
    currentLocalDate: () => currentDate,
    setCurrentLocalDate(date) {
      currentDate = date;
      currentInstant = instant(`${date}T08:00:00.000Z`);
    },
  };
}

interface SchedulerHarness {
  readonly scheduler: BoundaryCheckScheduler;
  readonly schedule: ReturnType<typeof vi.fn<BoundaryCheckScheduler>>;
  fire(): void;
  currentCancel(): ReturnType<typeof vi.fn<() => void>>;
}

function schedulerHarness(): SchedulerHarness {
  let scheduled: (() => void) | undefined;
  let cancel = vi.fn<() => void>();
  const schedule = vi.fn<BoundaryCheckScheduler>((callback) => {
    scheduled = callback;
    cancel = vi.fn<() => void>();
    return cancel;
  });

  return {
    scheduler: schedule,
    schedule,
    fire() {
      const callback = scheduled;
      scheduled = undefined;
      if (callback === undefined) {
        throw new Error('No boundary check is scheduled');
      }
      callback();
    },
    currentCancel: () => cancel,
  };
}

interface VisibilityHarness {
  readonly source: VisibilityResumeSource;
  readonly subscribe: ReturnType<typeof vi.fn<VisibilityResumeSource>>;
  readonly unsubscribe: ReturnType<typeof vi.fn<() => void>>;
  resume(): void;
}

function visibilityHarness(): VisibilityHarness {
  let listener: (() => void) | undefined;
  const unsubscribe = vi.fn<() => void>();
  const subscribe = vi.fn<VisibilityResumeSource>((nextListener) => {
    listener = nextListener;
    return unsubscribe;
  });
  return {
    source: subscribe,
    subscribe,
    unsubscribe,
    resume() {
      if (listener === undefined) {
        throw new Error('Visibility listener is not subscribed');
      }
      listener();
    },
  };
}

function repositoryHarness(): {
  readonly repository: Pick<PlanningRepository, 'prepareOpenPeriod'>;
  readonly prepareOpenPeriod: ReturnType<typeof vi.fn<PlanningRepository['prepareOpenPeriod']>>;
} {
  const prepareOpenPeriod = vi
    .fn<PlanningRepository['prepareOpenPeriod']>()
    .mockResolvedValue(successfulPreparation);
  return { repository: { prepareOpenPeriod }, prepareOpenPeriod };
}

describe('habit boundary runtime coordinator', () => {
  it('runs bounded open-week preparation at startup', async () => {
    const clock = controllableClock(TUESDAY);
    const repository = repositoryHarness();
    const scheduler = schedulerHarness();
    const visibility = visibilityHarness();

    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: scheduler.scheduler,
      subscribeVisibilityResume: visibility.source,
    });
    await coordinator.whenIdle();

    expect(repository.prepareOpenPeriod).toHaveBeenCalledOnce();
    expect(repository.prepareOpenPeriod).toHaveBeenCalledWith({
      kind: 'week',
      weekStart: MONDAY,
    });
    expect(scheduler.schedule).toHaveBeenCalledOnce();
    expect(visibility.subscribe).toHaveBeenCalledOnce();

    coordinator.dispose();
  });

  it('runs the same idempotent preparation on visible resume and recalibrates the timer', async () => {
    const clock = controllableClock(TUESDAY);
    const repository = repositoryHarness();
    const scheduler = schedulerHarness();
    const visibility = visibilityHarness();
    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: scheduler.scheduler,
      subscribeVisibilityResume: visibility.source,
    });
    await coordinator.whenIdle();
    const firstCancel = scheduler.currentCancel();

    visibility.resume();
    await coordinator.whenIdle();

    expect(repository.prepareOpenPeriod).toHaveBeenCalledTimes(2);
    expect(repository.prepareOpenPeriod).toHaveBeenLastCalledWith({
      kind: 'week',
      weekStart: MONDAY,
    });
    expect(firstCancel).toHaveBeenCalledOnce();
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);

    coordinator.dispose();
  });

  it('detects local-date rollover from the injected clock and prepares the new period', async () => {
    const clock = controllableClock(MONDAY);
    const repository = repositoryHarness();
    const scheduler = schedulerHarness();
    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: scheduler.scheduler,
      subscribeVisibilityResume: visibilityHarness().source,
    });
    await coordinator.whenIdle();

    clock.setCurrentLocalDate(TUESDAY);
    scheduler.fire();
    await coordinator.whenIdle();

    expect(repository.prepareOpenPeriod).toHaveBeenCalledTimes(2);
    expect(repository.prepareOpenPeriod).toHaveBeenLastCalledWith({
      kind: 'week',
      weekStart: MONDAY,
    });
    coordinator.dispose();
  });

  it('keeps exactly one rescheduled boundary check after every timer wake-up', async () => {
    const clock = controllableClock(MONDAY);
    const repository = repositoryHarness();
    const scheduler = schedulerHarness();
    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: scheduler.scheduler,
      subscribeVisibilityResume: visibilityHarness().source,
    });
    await coordinator.whenIdle();

    scheduler.fire();
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
    expect(repository.prepareOpenPeriod).toHaveBeenCalledOnce();

    clock.setCurrentLocalDate(TUESDAY);
    scheduler.fire();
    await coordinator.whenIdle();

    expect(scheduler.schedule).toHaveBeenCalledTimes(3);
    expect(repository.prepareOpenPeriod).toHaveBeenCalledTimes(2);
    coordinator.dispose();
    expect(scheduler.currentCancel()).toHaveBeenCalledOnce();
  });

  it('delegates only a typed bounded affected range through the same repository command', async () => {
    const clock = controllableClock(MONDAY);
    const repository = repositoryHarness();
    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: schedulerHarness().scheduler,
      subscribeVisibilityResume: visibilityHarness().source,
    });
    await coordinator.whenIdle();
    const affectedRange: OpenPeriodRange = {
      kind: 'month',
      anchorDate: localDate('2026-08-01'),
    };

    await expect(coordinator.prepareOpenPeriod(affectedRange)).resolves.toEqual(
      successfulPreparation,
    );
    expect(repository.prepareOpenPeriod).toHaveBeenLastCalledWith(affectedRange);

    coordinator.dispose();
  });

  it('catches up after suspension on visibility resume without requiring the missed timer', async () => {
    const clock = controllableClock(SUNDAY);
    const repository = repositoryHarness();
    const scheduler = schedulerHarness();
    const visibility = visibilityHarness();
    const coordinator = createHabitBoundaryCoordinator({
      clock,
      repository: repository.repository,
      scheduleBoundaryCheck: scheduler.scheduler,
      subscribeVisibilityResume: visibility.source,
    });
    await coordinator.whenIdle();

    // Simulate a suspended browser: the scheduled callback never runs while the
    // injected local date crosses into a new calendar week.
    clock.setCurrentLocalDate(NEXT_MONDAY);
    visibility.resume();
    await coordinator.whenIdle();

    expect(repository.prepareOpenPeriod.mock.calls.map(([range]) => range)).toEqual([
      { kind: 'week', weekStart: MONDAY },
      { kind: 'week', weekStart: MONDAY },
      { kind: 'week', weekStart: NEXT_MONDAY },
    ]);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);

    coordinator.dispose();
    expect(visibility.unsubscribe).toHaveBeenCalledOnce();
  });
});
