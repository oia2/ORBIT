import { describe, expect, it, vi } from 'vitest';

import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import { createAppRuntime, createHealthProbe, type AppRuntime } from './create-app-runtime';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
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

function fakeRepository(): PlanningRepository {
  return {} as PlanningRepository;
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
  it('returns initializing synchronously and publishes ready once the server answers', async () => {
    const probed = deferred<boolean>();
    const repository = fakeRepository();
    const observedStatuses: string[] = [];
    const probeHealth = vi.fn(() => probed.promise);
    const createRepository = vi.fn(() => repository);
    const runtime = createAppRuntime({ probeHealth, createRepository });
    const unsubscribe = runtime.subscribe(() => {
      observedStatuses.push(runtime.getSnapshot().status);
    });

    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 1 });
    expect(probeHealth).toHaveBeenCalledOnce();
    // The repository is only built once the server is known to be reachable.
    expect(createRepository).not.toHaveBeenCalled();

    probed.resolve(true);
    await expectStatus(runtime, 'ready');

    expect(runtime.getSnapshot()).toEqual({ status: 'ready', attempt: 1, repository });
    expect(observedStatuses).toContain('ready');

    unsubscribe();
    runtime.dispose();
  });

  it('publishes failure when the server answers that it is unavailable', async () => {
    const createRepository = vi.fn<() => PlanningRepository>();
    const runtime = createAppRuntime({
      probeHealth: () => Promise.resolve(false),
      createRepository,
    });

    await expectStatus(runtime, 'failure');

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'failure',
      attempt: 1,
      message: 'The ORBIT server is unavailable',
    });
    expect(createRepository).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('publishes failure when the probe itself cannot reach the server', async () => {
    const runtime = createAppRuntime({
      probeHealth: () => Promise.reject(new Error('Failed to fetch')),
      createRepository: fakeRepository,
    });

    await expectStatus(runtime, 'failure');

    expect(runtime.getSnapshot()).toMatchObject({
      status: 'failure',
      message: 'Failed to fetch',
    });
    runtime.dispose();
  });

  it('re-probes on retry and reaches ready once the server recovers', async () => {
    const probeHealth = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('first probe failed'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const runtime = createAppRuntime({ probeHealth, createRepository: fakeRepository });

    await expectStatus(runtime, 'failure');

    runtime.retry();
    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 2 });
    await expectStatus(runtime, 'failure');

    runtime.retry();
    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 3 });
    await expectStatus(runtime, 'ready');

    expect(probeHealth).toHaveBeenCalledTimes(3);
    runtime.dispose();
  });

  it('ignores a probe that completes after disposal', async () => {
    const probed = deferred<boolean>();
    const listener = vi.fn<() => void>();
    const runtime = createAppRuntime({
      probeHealth: () => probed.promise,
      createRepository: fakeRepository,
    });
    runtime.subscribe(listener);

    runtime.dispose();
    probed.resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().status).toBe('initializing');
  });

  it('ignores a superseded probe when a retry has already started', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const probeHealth = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const runtime = createAppRuntime({ probeHealth, createRepository: fakeRepository });

    runtime.retry();
    first.resolve(false);
    await Promise.resolve();

    expect(runtime.getSnapshot()).toMatchObject({ status: 'initializing', attempt: 2 });

    second.resolve(true);
    await expectStatus(runtime, 'ready');
    runtime.dispose();
  });
});

describe('createHealthProbe', () => {
  it('reports healthy for a 200 from /api/health', async () => {
    const fetchStub = vi.fn(() => Promise.resolve({ ok: true } as Response));

    const probe = createHealthProbe({ fetch: fetchStub as unknown as typeof globalThis.fetch });

    await expect(probe()).resolves.toBe(true);
    expect(fetchStub).toHaveBeenCalledWith('/api/health');
  });

  it('reports unhealthy for a 503, so a database outage is not reported as ready', async () => {
    const fetchStub = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response));

    const probe = createHealthProbe({ fetch: fetchStub as unknown as typeof globalThis.fetch });

    await expect(probe()).resolves.toBe(false);
  });

  it('honours an explicit base URL', async () => {
    const fetchStub = vi.fn(() => Promise.resolve({ ok: true } as Response));

    const probe = createHealthProbe({
      baseUrl: 'http://localhost:3000/api',
      fetch: fetchStub as unknown as typeof globalThis.fetch,
    });
    await probe();

    expect(fetchStub).toHaveBeenCalledWith('http://localhost:3000/api/health');
  });
});
