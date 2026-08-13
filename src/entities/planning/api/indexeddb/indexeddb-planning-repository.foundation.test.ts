import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import {
  creationSequence,
  entityId,
  eventSequence,
  revision,
  type TaskEventId,
  type TaskOccurrenceId,
} from '@/shared/lib/ids';

import { openOrbitPlanningDatabase } from './database';
import {
  createIndexedDbPlanningRepository,
  indexedDbRepositoryInternals,
} from './indexeddb-planning-repository';
import type { OrbitPlanningDB } from './schema';
import type { IDBPDatabase } from 'idb';

const DATABASE_NAME = 'orbit-foundation-test';
const MONDAY = localDate('2026-08-10');
const NOW = instant('2026-08-10T07:08:09.000Z');

describe('IndexedDB repository foundation', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
  });

  afterEach(() => {
    database.close();
  });

  it('resolves a write only after tx.done and persists the complete transaction', async () => {
    const week = {
      startDate: MONDAY,
      status: 'open' as const,
      goals: [],
      revision: revision(0),
    };

    const receipt = await indexedDbRepositoryInternals.runAtomic(
      database,
      ['weeks'],
      async (transaction) => {
        await transaction.objectStore('weeks').put(week);
        return 'committed';
      },
    );

    expect(receipt).toBe('committed');
    await expect(database.get('weeks', MONDAY)).resolves.toEqual(week);
  });

  it('aborts every write when work fails', async () => {
    await expect(
      indexedDbRepositoryInternals.runAtomic(database, ['weeks'], async (transaction) => {
        await transaction.objectStore('weeks').put({
          startDate: MONDAY,
          status: 'open',
          goals: [],
          revision: revision(0),
        });
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    await expect(database.get('weeks', MONDAY)).resolves.toBeUndefined();
  });

  it('returns typed revision and immutable guards', () => {
    expect(indexedDbRepositoryInternals.revisionGuard(revision(2), revision(1))).toEqual({
      code: 'RevisionConflict',
      expectedRevision: revision(1),
      actualRevision: revision(2),
    });
    expect(indexedDbRepositoryInternals.mutableDayGuard('closed', MONDAY)).toEqual({
      code: 'PeriodImmutable',
      date: MONDAY,
    });
  });

  it('uses only injected instants and UUID generation', () => {
    const generateUuid = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    const repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: MONDAY }),
      generateUuid,
    });

    expect(repository.auditContext()).toEqual({ id: generateUuid(), occurredAt: NOW });
    repository.dispose();
  });

  it('allocates creation and event sequences inside the serialized transaction', async () => {
    const occurrenceId = entityId<'task-occurrence'>(
      '00000000-0000-4000-8000-000000000010',
    ) as TaskOccurrenceId;
    const eventId = entityId<'task-event'>('00000000-0000-4000-8000-000000000011') as TaskEventId;

    const allocated = await indexedDbRepositoryInternals.runAtomic(
      database,
      ['taskOccurrences', 'taskEvents'],
      async (transaction) => {
        const firstCreation =
          await indexedDbRepositoryInternals.allocateNextCreationSequence(transaction);
        await transaction.objectStore('taskOccurrences').put({
          id: occurrenceId,
          title: 'First',
          isException: false,
          createdSequence: firstCreation,
          revision: revision(0),
          state: 'active',
          placement: { kind: 'backlog' },
          placementKey: 'backlog',
        });
        const secondCreation =
          await indexedDbRepositoryInternals.allocateNextCreationSequence(transaction);

        const firstEvent =
          await indexedDbRepositoryInternals.allocateNextEventSequence(transaction);
        await transaction.objectStore('taskEvents').put({
          id: eventId,
          sequence: firstEvent,
          occurrenceId,
          effectiveDate: MONDAY,
          occurredAt: NOW,
          type: 'create',
          payload: {
            created: { title: 'First' },
            placement: { kind: 'backlog' },
          },
        });
        const secondEvent =
          await indexedDbRepositoryInternals.allocateNextEventSequence(transaction);

        return { firstCreation, secondCreation, firstEvent, secondEvent };
      },
    );

    expect(allocated).toEqual({
      firstCreation: creationSequence(1),
      secondCreation: creationSequence(2),
      firstEvent: eventSequence(1),
      secondEvent: eventSequence(2),
    });
  });

  it('normalizes storage failures without deleting or resetting the database', () => {
    const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');

    expect(
      indexedDbRepositoryInternals.normalizeStorageError(
        new DOMException('full', 'QuotaExceededError'),
      ),
    ).toEqual({ code: 'QuotaExceeded', message: 'full' });
    expect(
      indexedDbRepositoryInternals.normalizeStorageError(
        new DOMException('disabled', 'InvalidStateError'),
      ),
    ).toEqual({ code: 'StorageUnavailable', message: 'disabled' });
    expect(indexedDbRepositoryInternals.normalizeStorageError(new Error('boom'))).toEqual({
      code: 'UnexpectedStorageFailure',
      message: 'boom',
    });
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
