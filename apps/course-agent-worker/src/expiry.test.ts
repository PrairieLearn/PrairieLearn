import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  getProcess: vi.fn(
    async (_id: string): Promise<{ status: string; exitCode?: number } | null> => ({
      status: 'running',
    }),
  ),
  getProcessLogs: vi.fn(async (_id: string) => ({ stdout: '', stderr: '' })),
  killProcess: vi.fn(async (_id: string) => {}),
}));
vi.mock('@cloudflare/sandbox', () => ({
  Sandbox: vi.fn(),
  ContainerProxy: vi.fn(),
  getSandbox: () => sandbox,
}));
const authorization = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./auth.js', () => ({ authorizeRun: authorization.run }));

import { CourseAgentCoordinator } from './index.js';

function fixture(activeRunId: string | null, expiresAt: number) {
  const initial = {
    identity: { userId: '1', courseId: '2', conversationId: 'conversation', sandboxId: 'sandbox' },
    activeRunId,
    activeRunExpiresAt: '2099-01-01T00:00:00.000Z',
    sandboxExpiresAt: expiresAt,
    lifecycleVersion: 2,
    conversationState: activeRunId ? 'working' : 'waiting_for_user',
    sandboxState: 'ready',
    sandboxGeneration: 1,
    revision: 1,
    idleExpiresAt: activeRunId ? null : expiresAt,
    processId: activeRunId ? `course-agent-${activeRunId}` : null,
    runtimeSettings: {
      idleTimeoutSeconds: 600,
      sleepAfterSeconds: 21_600,
      turnTimeoutSeconds: 21_600,
    },
    status: activeRunId ? 'running' : 'waiting_for_user',
    response: null,
    error: null,
    nextSequence: 0,
  };
  const values = new Map<string, unknown>([['conversation', initial]]);
  const storage = {
    get: vi.fn(async (key: string) => structuredClone(values.get(key))),
    put: vi.fn(async (keyOrEntries: string | Record<string, unknown>, value?: unknown) => {
      if (typeof keyOrEntries === 'string') {
        values.set(keyOrEntries, structuredClone(value));
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        values.set(key, structuredClone(entry));
      }
    }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      return new Map(
        [...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, value]),
      );
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) values.delete(key);
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
  return { coordinator, storage, values, state };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  sandbox.getProcess.mockResolvedValue({ status: 'running' });
  sandbox.getProcessLogs.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('sandbox expiry alarm', () => {
  it('rechecks ownership after the alarm before accepting a run', async () => {
    const { coordinator, storage } = fixture(null, 5000);
    const identity = {
      userId: '1',
      courseId: '2',
      conversationId: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
      sandboxId: 'course-agent-9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
    };
    await coordinator['update']({ identity });
    authorization.run.mockResolvedValue(identity);
    vi.spyOn(coordinator, 'alarm').mockImplementation(async () => {
      await coordinator['update']({ identity: { ...identity, userId: 'other-owner' } });
    });
    const response = await coordinator.fetch(
      new Request('https://coordinator/run', {
        method: 'POST',
        body: JSON.stringify({
          capability: 'test-capability',
          ...identity,
          runId: '40cff9bd-6931-4405-a8e6-57f93a190d4b',
          prompt: 'Hello',
          runtimeSettings: { idleTimeoutSeconds: 600, turnTimeoutSeconds: 900 },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await storage.get('conversation')).toMatchObject({ activeRunId: null });
  });

  it('backs off quiet logs without rewriting state and resets when output arrives', async () => {
    const { coordinator, storage } = fixture('quiet-run', 5000);
    for (let attempt = 0; attempt < 5; attempt++) await coordinator.alarm();
    expect(storage.put).not.toHaveBeenCalled();
    expect(coordinator['pollDelayMs']).toBe(8000);
    sandbox.getProcessLogs.mockResolvedValue({
      stdout:
        JSON.stringify({ method: 'thread/started', params: { thread: { id: 'thread' } } }) + '\n',
      stderr: '',
    });
    await coordinator.alarm();
    expect(coordinator['pollDelayMs']).toBe(1000);
    expect(storage.put).toHaveBeenCalledOnce();
  });

  it.each(['completed', 'failed'])(
    'closes %s listeners before releasing the state lock',
    async (status) => {
      const { coordinator, state } = fixture('finished-run', 5000);
      sandbox.getProcess.mockResolvedValue({ status, exitCode: status === 'completed' ? 0 : 1 });
      sandbox.getProcessLogs.mockResolvedValue({
        stdout: [
          JSON.stringify({
            method: 'item/completed',
            params: { item: { id: 'answer', type: 'agentMessage', text: 'Done' } },
          }),
          JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
        ].join('\n'),
        stderr: '',
      });
      let locked = false;
      state.blockConcurrencyWhile = async (callback) => {
        locked = true;
        try {
          return await callback();
        } finally {
          locked = false;
        }
      };
      const close = vi.fn(() => expect(locked).toBe(true));
      coordinator['listeners'].add({
        enqueue: vi.fn(),
        close,
      } as unknown as ReadableStreamDefaultController<string>);
      await coordinator.alarm();
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('reschedules an early alarm without destroying the sandbox', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(5000);
  });

  it('suspends an idle sandbox durably', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: null,
      status: 'offline',
      sandboxState: 'offline',
      idleExpiresAt: null,
    });
    expect(storage.deleteAlarm).toHaveBeenCalledOnce();
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });

  it('protects a live process when the old absolute lifetime expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture('active-run', 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(sandbox.killProcess).not.toHaveBeenCalled();
    expect(sandbox.getProcess).toHaveBeenCalledWith('course-agent-active-run');
    expect(storage.setAlarm).toHaveBeenCalledWith(65_000);
  });

  it('drops late output after the separate active execution guard expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture('old-run', 5000);
    await coordinator['update']({ activeRunExpiresAt: new Date(5000).toISOString() });
    await coordinator.alarm();
    const expired = await storage.get('conversation');
    await coordinator['append']('assistant.delta', { text: 'Late response' }, 'old-run');
    expect(await coordinator['update']({ status: 'waiting_for_user' }, 'old-run')).toBe(false);
    expect(await storage.get('conversation')).toEqual(expired);
    expect(sandbox.killProcess).toHaveBeenCalledOnce();
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });

  it('drains a completed process when its recovery alarm runs after the execution deadline', async () => {
    const { coordinator, storage } = fixture('completed-run', 5000);
    await coordinator['update']({ activeRunExpiresAt: new Date(5000).toISOString() });
    sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
    sandbox.getProcessLogs.mockResolvedValue({
      stdout: [
        JSON.stringify({
          method: 'item/completed',
          params: {
            item: { id: 'answer', type: 'agentMessage', text: 'Finished before recovery.' },
          },
        }),
        JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
      ].join('\n'),
      stderr: '',
    });
    await coordinator.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      response: 'Finished before recovery.',
      error: null,
      activeRunId: null,
    });
    expect(sandbox.killProcess).not.toHaveBeenCalled();
  });

  it('starts a full idle interval when upgrading a legacy workspace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator['update']({ lifecycleVersion: undefined, idleExpiresAt: undefined });
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(await storage.get('conversation')).toMatchObject({
      lifecycleVersion: 2,
      sandboxExpiresAt: null,
      idleExpiresAt: 605000,
    });
    expect(storage.setAlarm).toHaveBeenLastCalledWith(605000);
  });

  it('ignores an old idle alarm after the conversation starts working again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator['update']({
      activeRunId: 'new-run',
      processId: 'course-agent-new-run',
      conversationState: 'working',
      idleExpiresAt: null,
    });
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(65000);
  });

  it('reconciles a missing process without destroying its workspace', async () => {
    const { coordinator, storage } = fixture('missing-run', 5000);
    sandbox.getProcess.mockResolvedValue(null);
    await coordinator.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: null,
      conversationState: 'failed',
      sandboxState: 'ready',
    });
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });

  it('resumes incremental output after coordinator replacement without replaying a turn', async () => {
    const { coordinator, storage, state } = fixture('restart-run', 5000);
    const notification = (method: string, params: unknown) => JSON.stringify({ method, params });
    const first =
      [
        notification('item/started', {
          item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: '' },
        }),
        notification('item/agentMessage/delta', { itemId: 'answer', delta: 'Hello' }),
      ].join('\n') + '\n';
    sandbox.getProcessLogs.mockResolvedValue({ stdout: first, stderr: '' });
    await coordinator.alarm();
    const restarted = new CourseAgentCoordinator(
      state as unknown as DurableObjectState,
      {} as ConstructorParameters<typeof CourseAgentCoordinator>[1],
    );
    await restarted.alarm();
    expect(
      [...(await storage.list({ prefix: 'event:' }))].filter(
        ([, event]) => (event as { type: string }).type === 'assistant.delta',
      ),
    ).toHaveLength(1);
    sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
    sandbox.getProcessLogs.mockResolvedValue({
      stdout:
        first +
        [
          notification('item/completed', {
            item: {
              id: 'answer',
              type: 'agentMessage',
              phase: 'final_answer',
              text: 'Hello world',
            },
          }),
          notification('turn/completed', { turn: { status: 'completed' } }),
        ].join('\n'),
      stderr: '',
    });
    await restarted.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      response: 'Hello world',
      activeRunId: null,
      conversationState: 'waiting_for_user',
      sandboxState: 'ready',
    });
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });

  it('stores stream events separately and prunes deltas after completion', async () => {
    const { coordinator, storage, values } = fixture(null, 5000);
    await coordinator['append']('user.message', { text: 'First', runId: 'run-1' });
    await coordinator['append']('assistant.delta', { text: 'Hello' });
    await coordinator['append']('agent.completed', { response: 'Hello' });
    await coordinator['append']('user.message', { text: 'Second', runId: 'run-2' });
    await coordinator['append']('assistant.delta', { text: 'Still running' });

    expect(await storage.get('conversation')).toMatchObject({ nextSequence: 5 });
    expect(values.get('event:000000000001')).toMatchObject({
      sequence: 1,
      type: 'assistant.delta',
    });
    expect(values.get('event:000000000002')).toMatchObject({
      sequence: 2,
      type: 'agent.completed',
    });

    await coordinator['pruneCompletedDeltas']('run-1');
    expect(values.has('event:000000000001')).toBe(false);
    expect(values.has('event:000000000002')).toBe(true);
    expect(values.has('event:000000000004')).toBe(true);
  });
});
