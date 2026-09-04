import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({})),
  destroy: vi.fn(async () => {}),
  createBackup: vi.fn(async () => ({ id: 'checkpoint', dir: '/workspace', localBucket: true })),
  restoreBackup: vi.fn(async () => {}),
  getState: vi.fn(async () => ({ status: 'running' })),
  setOutboundByHost: vi.fn(async () => {}),
  exec: vi.fn(async (command: string) => ({
    success: true,
    stdout:
      command === 'git remote get-url origin'
        ? 'https://x-access-token:proxy-read@github.com/PrairieLearn/test.git'
        : command === 'git branch --show-current'
          ? 'master'
          : command.includes('test -d')
            ? 'yes'
            : '',
    stderr: '',
  })),
}));
vi.mock('@cloudflare/sandbox', () => ({
  Sandbox: vi.fn(),
  ContainerProxy: vi.fn(),
  getSandbox: () => sandbox,
}));

import { CourseAgentCoordinator } from './index.js';

function fixture(
  activeRunId: string | null,
  expiresAt: number,
  idleExpiresAt: number | null = null,
) {
  const initial = {
    identity: { userId: '1', courseId: '2', conversationId: 'conversation', sandboxId: 'sandbox' },
    activeRunId,
    activeRunExpiresAt: '2099-01-01T00:00:00.000Z',
    sandboxExpiresAt: expiresAt,
    idleExpiresAt,
    runtimeSettings: {
      idleTimeoutSeconds: 600,
      maxLifetimeSeconds: 600,
      backupTtlSeconds: 604800,
      turnTimeoutSeconds: 900,
    },
    workspaceBackup: null,
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
    {
      Sandbox: { idFromName: () => 'sandbox-id' },
      OPENAI_MODEL: 'test-model',
    } as unknown as ConstructorParameters<typeof CourseAgentCoordinator>[1],
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
    expect(sandbox.createBackup).not.toHaveBeenCalled();
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
    expect(sandbox.createBackup).not.toHaveBeenCalled();
  });

  it('checkpoints an idle workspace before destroying it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture(null, 100000, 5000);
    await coordinator.alarm();
    expect(sandbox.createBackup).toHaveBeenCalledWith({
      dir: '/workspace',
      name: 'conversation',
      ttl: 604800,
      localBucket: true,
    });
    expect(sandbox.createBackup.mock.invocationCallOrder[0]).toBeLessThan(
      sandbox.destroy.mock.invocationCallOrder[0],
    );
    expect(await storage.get('conversation')).toMatchObject({
      workspaceBackup: {
        handle: { id: 'checkpoint' },
        expiresAt: new Date(5000 + 604800000).toISOString(),
      },
      status: 'offline',
    });
  });

  it('keeps an idle workspace alive when its backup fails and schedules a retry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    sandbox.createBackup.mockRejectedValueOnce(new Error('Storage unavailable'));
    const { coordinator, storage } = fixture(null, 100000, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(65000);
    expect(await storage.get('conversation')).toMatchObject({
      status: 'waiting_for_user',
      workspaceBackup: null,
    });
  });

  it.each(['running', 'stopped'])(
    'restores only a fresh sandbox and checkpoints after the turn (%s)',
    async (status) => {
      const { coordinator, storage } = fixture('run', Date.now() + 600000);
      const backup = {
        handle: { id: 'previous-checkpoint', dir: '/workspace', localBucket: true },
        expiresAt: new Date(Date.now() + 604800000).toISOString(),
      };
      await coordinator['update']({ workspaceBackup: backup });
      sandbox.getState.mockResolvedValueOnce({ status });
      await coordinator['run']({
        conversationId: 'conversation',
        sandboxId: 'sandbox',
        runId: 'run',
        capability: 'unused',
        prompt: 'Continue editing',
        course: {
          repository: 'https://github.com/PrairieLearn/test.git',
          branch: 'master',
          expectedSha: null,
        },
        workspaceBackup: backup,
        runtimeSettings: {
          idleTimeoutSeconds: 600,
          maxLifetimeSeconds: 600,
          turnTimeoutSeconds: 900,
          backupTtlSeconds: 604800,
        },
      });
      expect(sandbox.restoreBackup).toHaveBeenCalledTimes(status === 'stopped' ? 1 : 0);
      expect(await storage.get('conversation')).toMatchObject({
        status: 'waiting_for_user',
        error: null,
        workspaceBackup: { handle: { id: 'checkpoint' } },
      });
      expect(sandbox.createBackup).toHaveBeenCalledOnce();
    },
  );
});
