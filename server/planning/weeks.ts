import { nextRevision, revision } from '@/shared/lib/ids';
import { startOfWeek, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day } from '@/entities/planning/model/day';
import type {
  AddWeeklyGoalInput,
  DeleteWeeklyGoalInput,
  EditWeeklyGoalInput,
  EnsureCalendarWeekInput,
  ReorderWeeklyGoalsInput,
} from '@/entities/planning/model/planning-repository';
import type { Week, WeeklyGoal } from '@/entities/planning/model/week';

import { requireOpenWeek, type RepositoryContext } from './context';
import { canonicalRequiredText, DomainFailure } from './errors';
import { getDay, getWeek, insertDay, insertWeek, putWeek } from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

export async function ensureCalendarWeek(
  _ctx: RepositoryContext,
  trx: PlanningTransaction,
  { date }: EnsureCalendarWeekInput,
): Promise<CommandReceipt<LocalDate>> {
  const weekStart = startOfWeek(date);
  const existingWeek = await getWeek(trx, weekStart);
  const createdDates: LocalDate[] = [];

  if (existingWeek === undefined) {
    const week: Week = {
      startDate: weekStart,
      status: 'open',
      goals: [],
      revision: revision(0),
    };
    await insertWeek(trx, week);
  }

  for (const ownedDate of weekDates(weekStart)) {
    if ((await getDay(trx, ownedDate)) === undefined) {
      const day: Day = {
        date: ownedDate,
        weekStart,
        status: 'open',
        revision: revision(0),
      };
      await insertDay(trx, day);
      createdDates.push(ownedDate);
    }
  }

  return {
    value: weekStart,
    affectedDates: createdDates,
    affectedWeeks: existingWeek === undefined ? [weekStart] : [],
  };
}

export async function addWeeklyGoal(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: AddWeeklyGoalInput,
): Promise<CommandReceipt<WeeklyGoal['id']>> {
  const statement = canonicalRequiredText(input.statement, 'statement');
  const week = await getWeek(trx, input.weekStart);
  requireOpenWeek(week, input.weekStart, input.expectedRevision);

  const occurredAt = ctx.clock.now();
  const goalId = ctx.nextId<'weekly-goal'>();
  const goal: WeeklyGoal = {
    id: goalId,
    statement,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };

  await putWeek(
    trx,
    { ...week, goals: [...week.goals, goal], revision: nextRevision(week.revision) },
    week.revision,
  );

  return { value: goalId, affectedDates: [], affectedWeeks: [input.weekStart] };
}

export async function editWeeklyGoal(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: EditWeeklyGoalInput,
): Promise<CommandReceipt<undefined>> {
  const statement = canonicalRequiredText(input.statement, 'statement');
  const week = await getWeek(trx, input.weekStart);
  requireOpenWeek(week, input.weekStart, input.expectedRevision);

  const index = week.goals.findIndex((goal) => goal.id === input.goalId);
  if (index < 0) {
    throw new DomainFailure({ code: 'NotFound', entity: 'WeeklyGoal', id: input.goalId });
  }

  const goals = week.goals.slice();
  const current = goals[index];
  if (current === undefined) throw new Error('Goal index disappeared');
  goals[index] = { ...current, statement, updatedAt: ctx.clock.now() };

  await putWeek(trx, { ...week, goals, revision: nextRevision(week.revision) }, week.revision);

  return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
}

export async function reorderWeeklyGoals(
  _ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: ReorderWeeklyGoalsInput,
): Promise<CommandReceipt<undefined>> {
  const week = await getWeek(trx, input.weekStart);
  requireOpenWeek(week, input.weekStart, input.expectedRevision);

  const goalsById = new Map(week.goals.map((goal) => [goal.id, goal]));
  if (
    input.orderedGoalIds.length !== week.goals.length ||
    new Set(input.orderedGoalIds).size !== input.orderedGoalIds.length ||
    input.orderedGoalIds.some((id) => !goalsById.has(id))
  ) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'orderedGoalIds', message: 'Goal order must contain every goal once' }],
    });
  }

  const goals = input.orderedGoalIds.map((id) => {
    const goal = goalsById.get(id);
    if (goal === undefined) throw new Error('Validated goal is missing');
    return goal;
  });

  await putWeek(trx, { ...week, goals, revision: nextRevision(week.revision) }, week.revision);

  return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
}

export async function deleteWeeklyGoal(
  _ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: DeleteWeeklyGoalInput,
): Promise<CommandReceipt<undefined>> {
  const week = await getWeek(trx, input.weekStart);
  requireOpenWeek(week, input.weekStart, input.expectedRevision);

  if (!week.goals.some((goal) => goal.id === input.goalId)) {
    throw new DomainFailure({ code: 'NotFound', entity: 'WeeklyGoal', id: input.goalId });
  }

  await putWeek(
    trx,
    {
      ...week,
      goals: week.goals.filter((goal) => goal.id !== input.goalId),
      revision: nextRevision(week.revision),
    },
    week.revision,
  );

  return { value: undefined, affectedDates: [], affectedWeeks: [input.weekStart] };
}
