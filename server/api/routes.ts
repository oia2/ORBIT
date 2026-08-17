import type { FastifyInstance } from 'fastify';

import type { ApplicationClock } from '@/shared/lib/local-date/clock';

import type {
  CommandResult,
  PlanningRepository,
  QueryResult,
  ValidationIssue,
} from '@/entities/planning/model/planning-repository';

import * as parse from './parsers';
import type { ParseResult } from './parsers';
import { readRequestClock } from './request-clock';

export type PlanningEnvelope = QueryResult<unknown> | CommandResult<unknown>;

export type PlanningRepositoryFactory = (clock: ApplicationClock) => PlanningRepository;

interface MethodHandler {
  readonly parse: (input: unknown) => ParseResult<unknown>;
  readonly invoke: (repository: PlanningRepository, input: never) => Promise<PlanningEnvelope>;
}

function handler<TInput>(
  parseInput: (input: unknown) => ParseResult<TInput>,
  invoke: (repository: PlanningRepository, input: TInput) => Promise<PlanningEnvelope>,
): MethodHandler {
  return {
    parse: parseInput,
    invoke: invoke,
  };
}

/**
 * One route per `PlanningRepository` method (research Decision 3). The
 * interface *is* the contract, so the API mirrors it one-to-one rather than
 * modelling resources independently — there is nothing here to drift from.
 */
export const PLANNING_METHODS: Readonly<Record<string, MethodHandler>> = Object.freeze({
  // queries
  getWeekView: handler(
    (input) => parse.parseLocalDateArgument(input, 'dateOrWeekStart'),
    (repository, value) => repository.getWeekView(value),
  ),
  getDayView: handler(
    (input) => parse.parseLocalDateArgument(input, 'date'),
    (repository, value) => repository.getDayView(value),
  ),
  getBacklogView: handler(parse.parseEmpty, (repository) => repository.getBacklogView()),
  getHistoryView: handler(parse.parseHistoryQuery, (repository, value) =>
    repository.getHistoryView(value),
  ),
  getTaskHistory: handler(
    (input) => parse.parseOccurrenceIdArgument(input, 'occurrenceId'),
    (repository, value) => repository.getTaskHistory(value),
  ),

  // period preparation
  prepareOpenPeriod: handler(parse.parseOpenPeriodRange, (repository, value) =>
    repository.prepareOpenPeriod(value),
  ),
  ensureCalendarWeek: handler(parse.parseEnsureCalendarWeek, (repository, value) =>
    repository.ensureCalendarWeek(value),
  ),

  // weekly goals
  addWeeklyGoal: handler(parse.parseAddWeeklyGoal, (repository, value) =>
    repository.addWeeklyGoal(value),
  ),
  editWeeklyGoal: handler(parse.parseEditWeeklyGoal, (repository, value) =>
    repository.editWeeklyGoal(value),
  ),
  reorderWeeklyGoals: handler(parse.parseReorderWeeklyGoals, (repository, value) =>
    repository.reorderWeeklyGoals(value),
  ),
  deleteWeeklyGoal: handler(parse.parseDeleteWeeklyGoal, (repository, value) =>
    repository.deleteWeeklyGoal(value),
  ),

  // task lifecycle
  createTask: handler(parse.parseCreateTask, (repository, value) => repository.createTask(value)),
  editTaskOccurrence: handler(parse.parseEditTaskOccurrence, (repository, value) =>
    repository.editTaskOccurrence(value),
  ),
  setTaskCompletion: handler(parse.parseSetTaskCompletion, (repository, value) =>
    repository.setTaskCompletion(value),
  ),
  moveTaskToDate: handler(parse.parseMoveTaskToDate, (repository, value) =>
    repository.moveTaskToDate(value),
  ),
  moveTaskToBacklog: handler(parse.parseMoveTaskToBacklog, (repository, value) =>
    repository.moveTaskToBacklog(value),
  ),
  deleteTaskOccurrence: handler(parse.parseDeleteTaskOccurrence, (repository, value) =>
    repository.deleteTaskOccurrence(value),
  ),
  reorderDatedTasks: handler(parse.parseReorderDatedTasks, (repository, value) =>
    repository.reorderDatedTasks(value),
  ),

  // recurrence
  createTaskSeries: handler(parse.parseCreateTaskSeries, (repository, value) =>
    repository.createTaskSeries(value),
  ),
  updateTaskSeriesRule: handler(parse.parseUpdateTaskSeriesRule, (repository, value) =>
    repository.updateTaskSeriesRule(value),
  ),
  stopTaskSeries: handler(parse.parseStopTaskSeries, (repository, value) =>
    repository.stopTaskSeries(value),
  ),

  // habits
  createHabitDefinition: handler(parse.parseCreateHabitDefinition, (repository, value) =>
    repository.createHabitDefinition(value),
  ),
  updateHabitRule: handler(parse.parseUpdateHabitRule, (repository, value) =>
    repository.updateHabitRule(value),
  ),
  stopHabitDefinition: handler(parse.parseStopHabitDefinition, (repository, value) =>
    repository.stopHabitDefinition(value),
  ),
  editHabitOccurrence: handler(parse.parseEditHabitOccurrence, (repository, value) =>
    repository.editHabitOccurrence(value),
  ),
  recordHabitOutcome: handler(parse.parseRecordHabitOutcome, (repository, value) =>
    repository.recordHabitOutcome(value),
  ),
  correctBoundaryMissToCompleted: handler(parse.parseCorrectBoundaryMiss, (repository, value) =>
    repository.correctBoundaryMissToCompleted(value),
  ),
  clearHabitOutcome: handler(parse.parseClearHabitOutcome, (repository, value) =>
    repository.clearHabitOutcome(value),
  ),
  deleteHabitOccurrence: handler(parse.parseDeleteHabitOccurrence, (repository, value) =>
    repository.deleteHabitOccurrence(value),
  ),

  // daily state, closure, weekly review
  saveDailyState: handler(parse.parseSaveDailyState, (repository, value) =>
    repository.saveDailyState(value),
  ),
  closeDay: handler(parse.parseCloseDay, (repository, value) => repository.closeDay(value)),
  completeWeek: handler(parse.parseCompleteWeek, (repository, value) =>
    repository.completeWeek(value),
  ),
});

export const PLANNING_METHOD_NAMES = Object.keys(PLANNING_METHODS);

function validationFailure(issues: readonly ValidationIssue[]): QueryResult<never> {
  return { ok: false, error: { code: 'ValidationFailure', issues } };
}

export interface PlanningRoutesOptions {
  readonly createRepository: PlanningRepositoryFactory;
}

export function registerPlanningRoutes(app: FastifyInstance, options: PlanningRoutesOptions): void {
  app.post<{ Params: { method: string }; Body: unknown }>(
    '/api/planning/:method',
    async (request, reply) => {
      const handlerForMethod = Object.hasOwn(PLANNING_METHODS, request.params.method)
        ? PLANNING_METHODS[request.params.method]
        : undefined;
      if (handlerForMethod === undefined) {
        return reply.code(404).send({ error: `Unknown planning method: ${request.params.method}` });
      }

      const clock = readRequestClock(request.headers);
      if (!clock.ok) {
        return reply.code(400).send({ error: clock.message });
      }

      const parsed = handlerForMethod.parse(request.body ?? {});
      if (!parsed.ok) {
        // An invalid *field* inside a well-formed body is not a transport
        // error: it is the ValidationFailure feature 001 already defines, and
        // it travels as a 200 envelope like every other domain outcome.
        return reply.code(200).send(validationFailure(parsed.issues));
      }

      const repository = options.createRepository(clock.clock);
      const envelope = await handlerForMethod.invoke(repository, parsed.value as never);
      return reply.code(200).send(envelope);
    },
  );
}
