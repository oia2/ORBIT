import { nextRevision } from '@/shared/lib/ids';

import { prepareDailyStateUpdate } from '@/entities/planning/model/day';
import type { SaveDailyStateInput } from '@/entities/planning/model/planning-repository';

import { requireOpenDay, requireOpenWeek, type RepositoryContext } from './context';
import { DomainFailure } from './errors';
import { getDay, getWeek, putDay, putWeek } from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

export async function saveDailyState(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: SaveDailyStateInput,
): Promise<CommandReceipt<undefined>> {
  const day = await getDay(trx, input.date);
  if (day === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
  }
  requireOpenDay(day, input.expectedDayRevision);
  const week = await getWeek(trx, day.weekStart);
  requireOpenWeek(week, day.weekStart);

  const prepared = prepareDailyStateUpdate({
    day,
    weekStatus: week.status,
    ...(input.energy === undefined ? {} : { energy: input.energy }),
    ...(input.mood === undefined ? {} : { mood: input.mood }),
    ...(input.sleepDurationMinutes === undefined
      ? {}
      : { sleepDurationMinutes: input.sleepDurationMinutes }),
    updatedAt: ctx.clock.now(),
  });
  if (!prepared.ok) throw new DomainFailure(prepared.error);

  await putDay(trx, prepared.value, day.revision);
  await putWeek(trx, { ...week, revision: nextRevision(week.revision) }, week.revision);

  return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
}
