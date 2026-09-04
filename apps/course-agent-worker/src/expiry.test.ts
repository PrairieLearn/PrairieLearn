import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ destroy: vi.fn(async () => {}) }));
vi.mock('@cloudflare/sandbox', () => ({
  Sandbox: vi.fn(),
  ContainerProxy: vi.fn(),
  getSandbox: () => sandbox,
}));

import { CourseAgentCoordinator } from './index.js';

function fixture(activeRunId: string | null, expiresAt: number) {
  const initial = {
    identity: { userId: '1', courseId: '2', conversationId: 'conversation', sandboxId: 'sandbox' },
    activeRunId,
    activeRunExpiresAt: '2099-01-01T00:00:00.000Z',
    sandboxExpiresAt: expiresAt,
    status: activeRunId ? 'running' : 'waiting_for_user',
    response: null,
    error: null,
    events: [],
  };
  const values = new Map<string, unknown>([['conversation', initial]]);
  const storage = {
    get: vi.fn(async (key: string) => structuredClone(values.get(key))),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    }),
    setAlarm: vi.fn(async () => {}),
    deleteAlarm: vi.fn(async () => {}),
  };
  const state = {
    storage,
    blockConcurrencyWhile: async (callback: () => Promise<unknown>) => callback(),
  };
  const coordinator = new CourseAgentCoordinator(
    state as unknown as DurableObjectState,
    {} as ConstructorParameters<typeof CourseAgentCoordinator>[1],
  );
  return { coordinator, storage };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('sandbox expiry alarm', () => {
  it('reschedules an early alarm without destroying the sandbox', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(5000);
  });

  it.each([null, 'active-run'])('expires an idle or active sandbox durably (%s)', async (runId) => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture(runId, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: null,
      status: 'offline',
      sandboxExpiresAt: null,
    });
    expect(storage.deleteAlarm).toHaveBeenCalledOnce();
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });

  it('drops late output and completion from an expired run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture('old-run', 5000);
    await coordinator.alarm();
    const expired = await storage.get('conversation');
    await coordinator['append']('assistant.delta', { text: 'Late response' }, 'old-run');
    expect(await coordinator['update']({ status: 'waiting_for_user' }, 'old-run')).toBe(false);
    expect(await storage.get('conversation')).toEqual(expired);
  });
});
