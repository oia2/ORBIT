import type { CommandResult, OpenPeriodRange, PlanningRepository } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

export type BoundaryCheckScheduler = (callback: () => void) => () => void;
export type VisibilityResumeSource = (listener: () => void) => () => void;

export type BoundaryPreparationFailure = unknown;

export interface HabitBoundaryCoordinatorDependencies {
  readonly clock: ApplicationClock;
  readonly repository: Pick<PlanningRepository, 'prepareOpenPeriod'>;
  /** Schedules exactly one future local-date observation and returns its canceler. */
  readonly scheduleBoundaryCheck?: BoundaryCheckScheduler;
  /** Calls the listener only when browser visibility resumes. */
  readonly subscribeVisibilityResume?: VisibilityResumeSource;
  /** Defaults to the fixed calendar week containing the observed local date. */
  readonly rangeForDate?: (date: LocalDate) => OpenPeriodRange;
  readonly onPreparationFailure?: (failure: BoundaryPreparationFailure) => void;
}

export interface HabitBoundaryCoordinator {
  /** The page-level bounded preparation seam; no arbitrary from/to scan exists. */
  prepareOpenPeriod(range: OpenPeriodRange): Promise<CommandResult>;
  /** Resolves after all background startup/resume/rollover work queued so far. */
  whenIdle(): Promise<void>;
  dispose(): void;
}

const DEFAULT_BOUNDARY_POLL_INTERVAL_MS = 60_000;

const noop = (): void => undefined;

function scheduleBrowserBoundaryCheck(callback: () => void): () => void {
  const handle = globalThis.setTimeout(callback, DEFAULT_BOUNDARY_POLL_INTERVAL_MS);
  return () => {
    globalThis.clearTimeout(handle);
  };
}

function subscribeBrowserVisibilityResume(listener: () => void): () => void {
  if (typeof document === 'undefined') {
    return noop;
  }

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      listener();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

function defaultRangeForDate(date: LocalDate): OpenPeriodRange {
  return { kind: 'week', weekStart: startOfWeek(date) };
}

function rangeKey(range: OpenPeriodRange): string {
  switch (range.kind) {
    case 'day':
      return `day:${range.date}`;
    case 'week':
      return `week:${range.weekStart}`;
    case 'month':
      return `month:${range.anchorDate}`;
  }
}

function uniqueRanges(ranges: readonly OpenPeriodRange[]): readonly OpenPeriodRange[] {
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = rangeKey(range);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Coordinates idempotent boundary preparation without React. The timer is an
 * immediacy aid only: visibility resume independently observes the injected
 * local date and queues the same bounded repository command.
 */
export function createHabitBoundaryCoordinator(
  dependencies: HabitBoundaryCoordinatorDependencies,
): HabitBoundaryCoordinator {
  const scheduleBoundaryCheck = dependencies.scheduleBoundaryCheck ?? scheduleBrowserBoundaryCheck;
  const subscribeVisibilityResume =
    dependencies.subscribeVisibilityResume ?? subscribeBrowserVisibilityResume;
  const rangeForDate = dependencies.rangeForDate ?? defaultRangeForDate;
  const reportFailure = dependencies.onPreparationFailure ?? noop;

  let disposed = false;
  let lastObservedDate = dependencies.clock.currentLocalDate();
  let cancelScheduledCheck: (() => void) | undefined;
  let unsubscribeVisibility = noop;
  let queue: Promise<void> = Promise.resolve();

  const prepareOpenPeriod = (range: OpenPeriodRange): Promise<CommandResult> =>
    dependencies.repository.prepareOpenPeriod(range);

  const enqueueRanges = (ranges: readonly OpenPeriodRange[]): void => {
    const boundedRanges = uniqueRanges(ranges);
    queue = queue.then(async () => {
      for (const range of boundedRanges) {
        if (disposed) {
          return;
        }
        try {
          const result = await prepareOpenPeriod(range);
          if (!result.ok) {
            reportFailure(result.error);
          }
        } catch (error) {
          reportFailure(error);
        }
      }
    });
  };

  const observeLocalDate = (prepareWhenUnchanged: boolean): void => {
    const currentDate = dependencies.clock.currentLocalDate();
    const previousDate = lastObservedDate;
    if (currentDate === previousDate && !prepareWhenUnchanged) {
      return;
    }

    lastObservedDate = currentDate;
    enqueueRanges(
      currentDate === previousDate
        ? [rangeForDate(currentDate)]
        : [rangeForDate(previousDate), rangeForDate(currentDate)],
    );
  };

  const scheduleNextCheck = (): void => {
    if (disposed) {
      return;
    }
    cancelScheduledCheck = scheduleBoundaryCheck(() => {
      cancelScheduledCheck = undefined;
      if (disposed) {
        return;
      }
      observeLocalDate(false);
      scheduleNextCheck();
    });
  };

  const handleVisibilityResume = (): void => {
    if (disposed) {
      return;
    }
    observeLocalDate(true);
    cancelScheduledCheck?.();
    cancelScheduledCheck = undefined;
    scheduleNextCheck();
  };

  enqueueRanges([rangeForDate(lastObservedDate)]);
  unsubscribeVisibility = subscribeVisibilityResume(handleVisibilityResume);
  scheduleNextCheck();

  return Object.freeze({
    prepareOpenPeriod,
    whenIdle: (): Promise<void> => queue,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      cancelScheduledCheck?.();
      cancelScheduledCheck = undefined;
      unsubscribeVisibility();
      unsubscribeVisibility = noop;
    },
  });
}
