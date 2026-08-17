import type { CompleteWeekInput } from '@/entities/planning/model/planning-repository';
import type { WeekCompletionSnapshot } from '@/entities/planning/model/week';
import { prepareWeekCompletion } from '@/entities/planning/model/week-completion';

import { requireOpenWeek, type RepositoryContext } from './context';
import { DomainFailure, weekCompletionFailure } from './errors';
import { getDaysByWeekStart, getWeek, putWeek } from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

export async function completeWeek(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CompleteWeekInput,
): Promise<CommandReceipt<WeekCompletionSnapshot>> {
  const week = await getWeek(trx, input.weekStart);
  if (week === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: input.weekStart });
  }
  requireOpenWeek(week, input.weekStart, input.expectedWeekRevision);

  const days = await getDaysByWeekStart(trx, input.weekStart);
  const prepared = prepareWeekCompletion({
    week,
    days,
    ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
    clock: ctx.clock,
  });
  if (!prepared.ok) throw weekCompletionFailure(prepared.error);

  await putWeek(trx, prepared.value.week, week.revision);

  return {
    value: prepared.value.week.completionSnapshot,
    affectedDates: [],
    affectedWeeks: [prepared.value.week.startDate],
  };
}
