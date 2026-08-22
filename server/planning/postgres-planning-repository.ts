import { generateEntityId } from '@/shared/lib/ids';
import type { Instant } from '@/shared/lib/local-date/clock';

import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import type { PlanningDatabase } from '../db/client';
import { createRepositoryContext, type RepositoryDependencies } from './context';
import { deriveHistoryRange, getHistoryView } from './history-queries';
import * as closure from './closure';
import * as reopening from './reopening';
import * as dailyState from './daily-state';
import * as habits from './habits';
import * as materialization from './materialization';
import * as queries from './queries';
import * as series from './series';
import * as tasks from './tasks';
import * as weekCompletion from './week-completion';
import * as weeks from './weeks';
import { queryFailure, runCommand, runRead } from './transaction';

export interface RepositoryAuditContext {
  readonly id: string;
  readonly occurredAt: Instant;
}

export type ServerPlanningRepository = PlanningRepository & {
  readonly auditContext: () => RepositoryAuditContext;
};

/**
 * The authoritative implementation of `PlanningRepository`.
 *
 * It is a facade: every method opens exactly one transaction — a command
 * transaction for a mutation, a `REPEATABLE READ` read transaction for a
 * projection — and delegates the work to the concern module that owns it. The
 * domain rules themselves are unchanged; they live in `src/entities/planning/
 * model/` and are shared with the browser.
 *
 * The injected clock is passed through untouched. The server never reads its
 * own time (002 FR-009).
 */
export function createPostgresPlanningRepository(
  db: PlanningDatabase,
  dependencies: RepositoryDependencies,
): ServerPlanningRepository {
  const ctx = createRepositoryContext(dependencies);

  return {
    // ── queries ──────────────────────────────────────────────────────────────

    getWeekView: (dateOrWeekStart) =>
      runRead(db, (trx) => queries.getWeekView(trx, dateOrWeekStart)),

    getDayView: (date) => runRead(db, (trx) => queries.getDayView(trx, date)),

    getBacklogView: () => runRead(db, (trx) => queries.getBacklogView(trx)),

    getHistoryView: async (query) => {
      // The range is derived before any transaction opens, so a selection
      // outside its anchor month is rejected without touching the database.
      try {
        const range = deriveHistoryRange(query);
        return await runRead(db, (trx) => getHistoryView(trx, query, range));
      } catch (error) {
        return queryFailure(error);
      }
    },

    getTaskHistory: (occurrenceId) =>
      runRead(db, (trx) => queries.getTaskHistory(trx, occurrenceId)),

    // ── period preparation ───────────────────────────────────────────────────

    prepareOpenPeriod: (range) =>
      runCommand(db, (trx) => materialization.prepareOpenPeriod(ctx, trx, range)),

    ensureCalendarWeek: (input) =>
      runCommand(db, (trx) => weeks.ensureCalendarWeek(ctx, trx, input)),

    // ── weekly goals ─────────────────────────────────────────────────────────

    addWeeklyGoal: (input) => runCommand(db, (trx) => weeks.addWeeklyGoal(ctx, trx, input)),
    editWeeklyGoal: (input) => runCommand(db, (trx) => weeks.editWeeklyGoal(ctx, trx, input)),
    reorderWeeklyGoals: (input) =>
      runCommand(db, (trx) => weeks.reorderWeeklyGoals(ctx, trx, input)),
    deleteWeeklyGoal: (input) => runCommand(db, (trx) => weeks.deleteWeeklyGoal(ctx, trx, input)),

    // ── task lifecycle ───────────────────────────────────────────────────────

    createTask: (input) => runCommand(db, (trx) => tasks.createTask(ctx, trx, input)),
    editTaskOccurrence: (input) =>
      runCommand(db, (trx) => tasks.editTaskOccurrence(ctx, trx, input)),
    setTaskCompletion: (input) => runCommand(db, (trx) => tasks.setTaskCompletion(ctx, trx, input)),
    moveTaskToDate: (input) => runCommand(db, (trx) => tasks.moveTaskToDate(ctx, trx, input)),
    moveTaskToBacklog: (input) => runCommand(db, (trx) => tasks.moveTaskToBacklog(ctx, trx, input)),
    deleteTaskOccurrence: (input) =>
      runCommand(db, (trx) => tasks.deleteTaskOccurrence(ctx, trx, input)),
    reorderDatedTasks: (input) => runCommand(db, (trx) => tasks.reorderDatedTasks(ctx, trx, input)),

    // ── recurrence ───────────────────────────────────────────────────────────

    createTaskSeries: (input) => runCommand(db, (trx) => series.createTaskSeries(ctx, trx, input)),
    updateTaskSeriesRule: (input) =>
      runCommand(db, (trx) => series.updateTaskSeriesRule(ctx, trx, input)),
    stopTaskSeries: (input) => runCommand(db, (trx) => series.stopTaskSeries(ctx, trx, input)),

    // ── habits ───────────────────────────────────────────────────────────────

    createHabitDefinition: (input) =>
      runCommand(db, (trx) => habits.createHabitDefinition(ctx, trx, input)),
    updateHabitDuration: (input) =>
      runCommand(db, (trx) => habits.updateHabitDuration(ctx, trx, input)),
    updateHabitRule: (input) => runCommand(db, (trx) => habits.updateHabitRule(ctx, trx, input)),
    stopHabitDefinition: (input) =>
      runCommand(db, (trx) => habits.stopHabitDefinition(ctx, trx, input)),
    editHabitOccurrence: (input) =>
      runCommand(db, (trx) => habits.editHabitOccurrence(ctx, trx, input)),
    recordHabitOutcome: (input) =>
      runCommand(db, (trx) => habits.recordHabitOutcome(ctx, trx, input)),
    correctBoundaryMissToCompleted: (input) =>
      runCommand(db, (trx) => habits.correctBoundaryMissToCompleted(ctx, trx, input)),
    clearHabitOutcome: (input) =>
      runCommand(db, (trx) => habits.clearHabitOutcome(ctx, trx, input)),
    deleteHabitOccurrence: (input) =>
      runCommand(db, (trx) => habits.deleteHabitOccurrence(ctx, trx, input)),

    // ── daily state, closure, weekly review ──────────────────────────────────

    saveDailyState: (input) => runCommand(db, (trx) => dailyState.saveDailyState(ctx, trx, input)),
    closeDay: (input) => runCommand(db, (trx) => closure.closeDay(ctx, trx, input)),
    reopenDay: (input) => runCommand(db, (trx) => reopening.reopenDay(ctx, trx, input)),
    completeWeek: (input) => runCommand(db, (trx) => weekCompletion.completeWeek(ctx, trx, input)),

    auditContext: (): RepositoryAuditContext => ({
      id: generateEntityId(dependencies.generateUuid),
      occurredAt: dependencies.clock.now(),
    }),
  };
}
