import { beforeEach, describe, expect, it } from 'vitest';

import { nextRevision, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { Week } from '@/entities/planning/model/week';

import { createPlanningDatabase, type PlanningDatabaseHandle } from '../db/client';
import { openSharedTestDatabase } from '../test-support/database';
import { getWeek, insertWeek, putWeek } from './store';
import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';
import { runCommand, runRead } from './transaction';

const MONDAY = localDate('2026-08-10');
const NOW = instant('2026-08-10T07:00:00.000Z');

const OPEN_WEEK: Week = {
  startDate: MONDAY,
  status: 'open',
  goals: [],
  revision: revision(0),
};

describe('planning transaction wrappers', () => {
  let harness: RepositoryUnderTest;
  let secondary: PlanningDatabaseHandle;

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: MONDAY }),
    });
    const testDatabase = await openSharedTestDatabase();
    secondary = createPlanningDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 2,
    });

    return async () => {
      await secondary.destroy();
    };
  });

  it('pins one snapshot for the whole read, so a concurrent commit stays invisible', async () => {
    await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, OPEN_WEEK);
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

    let releaseSecondWrite: (() => void) | undefined;
    const secondWriteCommitted = new Promise<void>((resolve) => {
      releaseSecondWrite = resolve;
    });

    const read = runRead(harness.db, async (trx) => {
      const first = await getWeek(trx, MONDAY);

      // A different connection commits a change while this read is open.
      await runCommand(secondary.db, async (writeTrx) => {
        const current = await getWeek(writeTrx, MONDAY);
        if (current === undefined) throw new Error('missing week');
        await putWeek(
          writeTrx,
          { ...current, goals: [], revision: nextRevision(current.revision) },
          current.revision,
        );
        return { value: undefined, affectedDates: [], affectedWeeks: [] };
      });
      releaseSecondWrite?.();
      await secondWriteCommitted;

      const second = await getWeek(trx, MONDAY);
      return { first, second };
    });

    const result = await read;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);

    expect(result.value.first?.revision).toBe(revision(0));
    // Without a pinned snapshot this would read revision 1 and the projection
    // would describe a state that never existed at any single moment.
    expect(result.value.second?.revision).toBe(revision(0));

    // The committed write is visible to a read that starts afterwards.
    const afterwards = await runRead(harness.db, (trx) => getWeek(trx, MONDAY));
    expect(afterwards.ok && afterwards.value?.revision).toBe(revision(1));
  });

  it('refuses a write that no longer matches the revision it read', async () => {
    await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, OPEN_WEEK);
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

    const stale = await runCommand(harness.db, async (trx) => {
      const current = await getWeek(trx, MONDAY);
      if (current === undefined) throw new Error('missing week');

      // Someone else advanced the week between the read and the write.
      await runCommand(secondary.db, async (writeTrx) => {
        await putWeek(writeTrx, { ...current, revision: revision(1) }, revision(0));
        return { value: undefined, affectedDates: [], affectedWeeks: [] };
      });

      await putWeek(trx, { ...current, revision: revision(1) }, current.revision);
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: 'RevisionConflict',
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    });
  });

  it('rolls the whole command back when any statement fails', async () => {
    const result = await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, OPEN_WEEK);
      await insertWeek(trx, OPEN_WEEK);
      return { value: undefined, affectedDates: [], affectedWeeks: [] };
    });

    expect(result).toMatchObject({ ok: false });
    await expect(harness.database.getWeek(MONDAY)).resolves.toBeUndefined();
  });
});
