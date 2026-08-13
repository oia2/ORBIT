import { describe, expect, it, vi } from 'vitest';

import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import {
  createAppRuntime,
  type AppRuntime,
  type AppRuntimeDatabaseLifecycleCallbacks,
  type DisposablePlanningRepository,
} from './create-app-runtime';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

interface FakeDatabase {
  readonly close: ReturnType<typeof vi.fn<() => void>>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function fakeDatabase(): FakeDatabase {
  return { close: vi.fn<() => void>() };
}

function fakeRepository(
  dispose: ReturnType<typeof vi.fn<() => void>> = vi.fn<() => void>(),
): DisposablePlanningRepository {
  return { dispose } as unknown as DisposablePlanningRepository;
}

async function expectStatus(
  runtime: AppRuntime,
  status: ReturnType<AppRuntime['getSnapshot']>['status'],
): Promise<void> {
  await vi.waitFor(() => {
    expect(runtime.getSnapshot().status).toBe(status);
  });
}

describe('createAppRuntime', () => {
  it('returns initializing synchronously, publishes ready, and reports persistence grant', async () => {
    const opened = deferred<FakeDatabase>();
    const persistence = deferred<boolean>();
    const database = fakeDatabase();
    const repository = fakeRepository();
    const observedStatuses: string[] = [];
    const openDatabase = vi.fn(() => opened.promise);
    const createRepository = vi.fn(() => repository);
    const runtime = createAppRuntime({
      openDatabase,
      createRepository,
      requestPersistentStorage: () => persistence.promise,
    });
    const unsubscribe = runtime.subscribe(() => {
      observedStatuses.push(runtime.getSnapshot().status);
    });

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'initializing',
      attempt: 1,
    });
    expect(openDatabase).toHaveBeenCalledOnce();

    opened.resolve(database);
    persistence.resolve(true);
    await expectStatus(runtime, 'ready');

    expect(createRepository).toHaveBeenCalledWith(database);
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'ready',
      attempt: 1,
      repository,
      persistentStorage: 'granted',
    });
    expect(observedStatuses).toContain('ready');

    unsubscribe();
    runtime.dispose();
  });

  it('treats persistent-storage denial as nonfatal ready state', async () => {
    const repository = fakeRepository();
    const runtime = createAppRuntime({
      openDatabase: () => Promise.resolve(fakeDatabase()),
      createRepository: () => repository,
      requestPersistentStorage: () => Promise.resolve(false),
    });

    await expectStatus(runtime, 'ready');

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'ready',
      repository,
      persistentStorage: 'denied',
    });
    runtime.dispose();
  });

  it('publishes storage-unavailable when opening the database fails', async () => {
    const createRepository = vi.fn<() => PlanningRepository>();
    const runtime = createAppRuntime({
      openDatabase: () =>
        Promise.reject(new DOMException('IndexedDB is disabled', 'InvalidStateError')),
      createRepository,
      requestPersistentStorage: () => Promise.resolve(true),
    });

    await expectStatus(runtime, 'failure');

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'failure',
      reason: 'storage-unavailable',
      message: 'IndexedDB is disabled',
    });
    expect(createRepository).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('publishes a blocked state while an upgrade waits for another connection', () => {
    const opened = deferred<FakeDatabase>();
    let lifecycle!: AppRuntimeDatabaseLifecycleCallbacks;
    const runtime = createAppRuntime({
      openDatabase: (callbacks) => {
        lifecycle = callbacks;
        return opened.promise;
      },
      createRepository: () => fakeRepository(),
      requestPersistentStorage: () => Promise.resolve(false),
    });

    lifecycle.onBlocked?.({ currentVersion: 1, requestedVersion: 2 });

    expect(runtime.getSnapshot()).toEqual({
      status: 'blocked',
      attempt: 1,
      currentVersion: 1,
      requestedVersion: 2,
      requiresReload: false,
    });
    runtime.dispose();
  });

  it('disposes the adapter and requires controlled retry after termination', async () => {
    let lifecycle!: AppRuntimeDatabaseLifecycleCallbacks;
    const disposeRepository = vi.fn<() => void>();
    const runtime = createAppRuntime({
      openDatabase: (callbacks) => {
        lifecycle = callbacks;
        return Promise.resolve(fakeDatabase());
      },
      createRepository: () => fakeRepository(disposeRepository),
      requestPersistentStorage: () => Promise.resolve(true),
    });
    await expectStatus(runtime, 'ready');

    lifecycle.onTerminated?.();

    expect(disposeRepository).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'failure',
      reason: 'terminated',
    });
    runtime.dispose();
  });

  it('marks version changes as reload-required and disposes the active adapter', async () => {
    let lifecycle!: AppRuntimeDatabaseLifecycleCallbacks;
    const disposeRepository = vi.fn<() => void>();
    const runtime = createAppRuntime({
      openDatabase: (callbacks) => {
        lifecycle = callbacks;
        return Promise.resolve(fakeDatabase());
      },
      createRepository: () => fakeRepository(disposeRepository),
      requestPersistentStorage: () => Promise.resolve(undefined),
    });
    await expectStatus(runtime, 'ready');

    lifecycle.onVersionChange?.({ currentVersion: 1, requestedVersion: 2 });

    expect(disposeRepository).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toEqual({
      status: 'blocked',
      attempt: 1,
      currentVersion: 1,
      requestedVersion: 2,
      requiresReload: true,
    });
    runtime.dispose();
  });

  it('retries from failure and disposes the previous ready adapter before reopening', async () => {
    const databaseOne = fakeDatabase();
    const databaseTwo = fakeDatabase();
    const repositoryOneDispose = vi.fn<() => void>();
    const repositoryTwoDispose = vi.fn<() => void>();
    const openDatabase = vi
      .fn<(callbacks: AppRuntimeDatabaseLifecycleCallbacks) => Promise<FakeDatabase>>()
      .mockRejectedValueOnce(new Error('first open failed'))
      .mockResolvedValueOnce(databaseOne)
      .mockResolvedValueOnce(databaseTwo);
    const createRepository = vi
      .fn<(database: FakeDatabase) => DisposablePlanningRepository>()
      .mockReturnValueOnce(fakeRepository(repositoryOneDispose))
      .mockReturnValueOnce(fakeRepository(repositoryTwoDispose));
    const runtime = createAppRuntime({
      openDatabase,
      createRepository,
      requestPersistentStorage: () => Promise.resolve(false),
    });

    await expectStatus(runtime, 'failure');
    runtime.retry();
    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 2 });
    await expectStatus(runtime, 'ready');

    runtime.retry();
    expect(repositoryOneDispose).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 3 });
    await expectStatus(runtime, 'ready');

    runtime.dispose();
    expect(repositoryTwoDispose).toHaveBeenCalledOnce();
  });

  it('falls back to closing the database and ignores late completion after disposal', async () => {
    const opened = deferred<FakeDatabase>();
    const database = fakeDatabase();
    const listener = vi.fn<() => void>();
    const runtime = createAppRuntime({
      openDatabase: () => opened.promise,
      createRepository: () => ({}) as PlanningRepository,
      requestPersistentStorage: () => Promise.resolve(false),
    });
    runtime.subscribe(listener);

    runtime.dispose();
    opened.resolve(database);
    await Promise.resolve();
    await Promise.resolve();

    expect(database.close).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
});
