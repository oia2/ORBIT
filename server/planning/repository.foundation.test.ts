import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { creationSequence, eventSequence, revision } from '@/shared/lib/ids';

import { mutableDayGuard, normalizeServerError, revisionGuard } from './errors';
import { allocateNextCreationSequence, allocateNextEventSequence } from './audit';
import { getWeek, insertTaskEvent, insertTaskOccurrence, insertWeek } from './store';
import { runCommand } from './transaction';
import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const NOW = instant('2026-08-10T07:08:09.000Z');

describe('PostgreSQL repository foundation', () => {
  let harness: RepositoryUnderTest;

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: MONDAY }),
    });
  });

  it('resolves a write only after commit and persists the complete transaction', async () => {
    const week = {
      startDate: MONDAY,
      status: 'open' as const,
      goals: [],
      revision: revision(0),
    };

    const receipt = await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, week);
      return { value: 'committed', affectedDates: [], affectedWeeks: [] };
    });

    expect(receipt).toMatchObject({ ok: true, value: 'committed' });
    await expect(harness.database.getWeek(MONDAY)).resolves.toEqual(week);
  });

  it('aborts every write when work fails', async () => {
    const result = await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, {
        startDate: MONDAY,
        status: 'open',
        goals: [],
        revision: revision(0),
      });
      throw new Error('stop');
    });

    expect(result).toMatchObject({ ok: false, error: { message: 'stop' } });
    await expect(harness.database.getWeek(MONDAY)).resolves.toBeUndefined();
  });

  it('returns typed revision and immutable guards', () => {
    expect(revisionGuard(revision(2), revision(1))).toEqual({
      code: 'RevisionConflict',
      expectedRevision: revision(1),
      actualRevision: revision(2),
    });
    expect(mutableDayGuard('closed', MONDAY)).toEqual({
      code: 'PeriodImmutable',
      date: MONDAY,
    });
  });

  it('uses only injected instants and UUID generation', async () => {
    const generateUuid = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    const injected = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: MONDAY }),
      generateUuid,
    });

    expect(injected.repository.auditContext()).toEqual({ id: generateUuid(), occurredAt: NOW });
  });

  it('allocates creation and event sequences inside the serialized transaction', async () => {
    const occurrenceId = '00000000-0000-4000-8000-000000000010';
    const eventId = '00000000-0000-4000-8000-000000000011';

    const allocated = await runCommand(harness.db, async (trx) => {
      const firstCreation = await allocateNextCreationSequence(trx);
      await insertTaskOccurrence(trx, {
        id: occurrenceId as never,
        title: 'First',
        isException: false,
        createdSequence: firstCreation,
        revision: revision(0),
        state: 'active',
        placement: { kind: 'backlog' },
      });
      const secondCreation = await allocateNextCreationSequence(trx);

      const firstEvent = await allocateNextEventSequence(trx);
      await insertTaskEvent(trx, {
        id: eventId as never,
        sequence: firstEvent,
        occurrenceId: occurrenceId as never,
        effectiveDate: MONDAY,
        occurredAt: NOW,
        type: 'create',
        payload: {
          created: { title: 'First' },
          placement: { kind: 'backlog' },
        },
      });
      const secondEvent = await allocateNextEventSequence(trx);

      return {
        value: { firstCreation, secondCreation, firstEvent, secondEvent },
        affectedDates: [],
        affectedWeeks: [],
      };
    });

    expect(allocated).toMatchObject({
      ok: true,
      value: {
        firstCreation: creationSequence(1),
        secondCreation: creationSequence(2),
        firstEvent: eventSequence(1),
        secondEvent: eventSequence(2),
      },
    });
  });

  /*
   * REPLACED STORAGE-MECHANISM ASSERTION (recorded in traceability.md).
   *
   * 001 asserted the IndexedDB failure taxonomy — `QuotaExceeded`,
   * `StorageUnavailable`, `UnexpectedStorageFailure` — and that recovery never
   * called `indexedDB.deleteDatabase`. 002 FR-014 replaces those codes with the
   * two server codes; the preserved property is the one that mattered: a
   * failure is classified honestly and never resolved by discarding data.
   */
  it('normalizes server failures without dropping or resetting the database', async () => {
    const connectionRefused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const adminShutdown = Object.assign(new Error('terminating connection'), { code: '57P01' });

    expect(normalizeServerError(connectionRefused)).toEqual({
      code: 'ServerUnavailable',
      message: 'connect ECONNREFUSED',
    });
    expect(normalizeServerError(adminShutdown)).toEqual({
      code: 'ServerUnavailable',
      message: 'terminating connection',
    });
    expect(normalizeServerError(new Error('boom'))).toEqual({
      code: 'UnexpectedServerFailure',
      message: 'boom',
    });

    const recording = harness.recordQueries();
    const failed = await runCommand(harness.db, async (trx) => {
      await insertWeek(trx, {
        startDate: MONDAY,
        status: 'open',
        goals: [],
        revision: revision(0),
      });
      throw Object.assign(new Error('connection terminated'), { code: '08006' });
    });
    const statements = recording.stop().map((query) => query.sql);

    expect(failed).toMatchObject({ ok: false, error: { code: 'ServerUnavailable' } });
    for (const sql of statements) {
      expect(sql).not.toMatch(/\b(drop|truncate)\b/i);
    }
    await expect(getWeek(harness.db, MONDAY)).resolves.toBeUndefined();
  });
});
