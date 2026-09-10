import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({})),
  destroy: vi.fn(async () => {}),
  createBackup: vi.fn(async () => ({ id: 'checkpoint', dir: '/workspace', localBucket: true })),
  restoreBackup: vi.fn(async () => {}),
  getState: vi.fn(async () => ({ status: 'running' })),
  setOutboundByHost: vi.fn(async () => {}),
  exec: vi.fn(
    async (command: string, options?: { onOutput?: (stream: string, data: string) => void }) => {
      if (command.startsWith('node ')) {
        options?.onOutput?.(
          'stdout',
          `${JSON.stringify({
            method: 'item/completed',
            params: {
              item: { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: 'Hello.' },
            },
          })}\n`,
        );
      }
      return {
        success: true,
        stdout:
          command === 'git remote get-url origin'
            ? 'https://x-access-token:proxy-read@github.com/PrairieLearn/test.git'
            : command === 'git branch --show-current'
              ? 'master'
              : command.includes('test -d')
                ? 'yes'
                : command === 'git rev-parse HEAD'
                  ? 'a'.repeat(40)
                  : '',
        stderr: '',
      };
    },
  ),
  getProcess: vi.fn(
    async (_id: string): Promise<{ status: string; exitCode?: number } | null> => ({
      status: 'running',
    }),
  ),
  getProcessLogs: vi.fn(async (_id: string) => ({ stdout: '', stderr: '' })),
  killProcess: vi.fn(async (_id: string) => {}),
  startProcess: vi.fn(async () => ({})),
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
  idleExpiresAt: number | null = expiresAt,
) {
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
    idleExpiresAt: activeRunId ? null : idleExpiresAt,
    processId: activeRunId ? `course-agent-${activeRunId}` : null,
    runtimeSettings: {
      idleTimeoutSeconds: 600,
      sleepAfterSeconds: 21_600,
      backupTtlSeconds: 604800,
      turnTimeoutSeconds: 21_600,
    },
    workspaceBackup: null,
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
    {
      Sandbox: { idFromName: () => 'sandbox-id' },
      OPENAI_MODEL: 'test-model',
    } as unknown as ConstructorParameters<typeof CourseAgentCoordinator>[1],
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
  it('reschedules an early alarm without destroying the sandbox', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { coordinator, storage } = fixture(null, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(sandbox.createBackup).not.toHaveBeenCalled();
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
    const { coordinator, storage } = fixture(null, 5000, 5000);
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(65000);
    expect(await storage.get('conversation')).toMatchObject({
      status: 'waiting_for_user',
      workspaceBackup: null,
    });
    vi.setSystemTime(65000);
    sandbox.createBackup.mockRejectedValueOnce(new Error('Storage still unavailable'));
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenLastCalledWith(125000);
  });

  it('preserves the final answer when the successful-turn checkpoint fails', async () => {
    const { coordinator, storage } = fixture('run', Date.now());
    sandbox.createBackup.mockRejectedValueOnce(new Error('Storage unavailable'));
    sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
    sandbox.getProcessLogs.mockResolvedValue({
      stdout: [
        JSON.stringify({
          method: 'item/completed',
          params: {
            item: {
              type: 'agentMessage',
              id: 'answer',
              phase: 'final_answer',
              text: 'Your question is ready.',
            },
          },
        }),
        JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
      ].join('\n'),
      stderr: '',
    });
    await coordinator.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      response: 'Your question is ready.',
      conversationState: 'waiting_for_user',
      error: null,
      workspaceBackup: null,
    });
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });

  it.each(['running', 'stopped'])(
    'restores and checkpoints despite a different expected course revision (%s)',
    async (status) => {
      const { coordinator, storage } = fixture('run', Date.now() + 600000);
      const backup = {
        handle: { id: 'previous-checkpoint', dir: '/workspace', localBucket: true },
        expiresAt: new Date(Date.now() + 604800000).toISOString(),
      };
      await coordinator['update']({ workspaceBackup: backup });
      sandbox.getState.mockResolvedValueOnce({ status });
      sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
      sandbox.getProcessLogs.mockResolvedValue({
        stdout: [
          JSON.stringify({
            method: 'item/completed',
            params: {
              item: { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: 'Hello.' },
            },
          }),
          JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
        ].join('\n'),
        stderr: '',
      });
      await coordinator['run']({
        conversationId: 'conversation',
        sandboxId: 'sandbox',
        runId: 'run',
        capability: 'unused',
        prompt: 'Continue editing',
        course: {
          repository: 'https://github.com/PrairieLearn/test.git',
          branch: 'master',
          expectedSha: 'b'.repeat(40),
        },
        authoringContext: { courseInstance: null },
        workspaceBackup: backup,
        runtimeSettings: {
          idleTimeoutSeconds: 600,
          sleepAfterSeconds: 21_600,
          turnTimeoutSeconds: 900,
          backupTtlSeconds: 604800,
        },
      });
      expect(sandbox.restoreBackup).toHaveBeenCalledTimes(status === 'stopped' ? 1 : 0);
      expect(await storage.get('conversation')).toMatchObject({
        status: 'waiting_for_user',
        error: null,
        response: 'Hello.',
        workspaceBackup: { handle: { id: 'checkpoint' } },
      });
      expect(sandbox.createBackup).toHaveBeenCalledOnce();
    },
  );

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

  const proposal = {
    id: 'approval-1',
    branch: 'master',
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    treeSha: 'c'.repeat(40),
    diff: 'patch',
    diffSummary: 'one file',
    commitMessage: 'Update question',
    status: 'pending' as const,
    result: null,
  };

  it('only starts the approval idle clock after the harness has stopped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture('run', 5000);
    await coordinator['update']({ pendingApproval: proposal, approvalValidated: true });
    sandbox.getProcessLogs.mockResolvedValue({
      stdout:
        JSON.stringify({
          method: 'course_agent/approvalPaused',
          params: { approvalId: proposal.id },
        }) + '\n',
      stderr: '',
    });
    await coordinator.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      processId: 'course-agent-run',
      idleExpiresAt: null,
    });
    sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
    await coordinator.alarm();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: 'run',
      pausedApprovalId: proposal.id,
      processId: null,
      activeRunExpiresAt: null,
      conversationState: 'waiting_for_approval',
      idleExpiresAt: 605000,
      error: null,
    });
    vi.setSystemTime(605000);
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: 'run',
      pendingApproval: proposal,
      sandboxState: 'offline',
      conversationState: 'waiting_for_approval',
    });
    expect(sandbox.killProcess).not.toHaveBeenCalled();
  });

  it('keeps approval waits alive if the pre-suspension checkpoint fails', async () => {
    const { coordinator, storage } = fixture('run', 5000);
    await coordinator['update']({
      pendingApproval: proposal,
      approvalValidated: true,
      pausedApprovalId: proposal.id,
      processId: null,
      activeRunExpiresAt: null,
      idleExpiresAt: 5000,
      conversationState: 'waiting_for_approval',
    });
    sandbox.createBackup.mockRejectedValueOnce(new Error('Storage unavailable'));
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(await storage.get('conversation')).toMatchObject({
      activeRunId: 'run',
      pendingApproval: proposal,
      sandboxState: 'ready',
      error: null,
    });
  });

  it('waits for validation and does not extend the idle clock on duplicate validation acknowledgments', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const { coordinator, storage } = fixture('run', 5000);
    const conversationId = '96d65ba0-d536-490b-96ba-7be0df4e62c4';
    const approvalId = 'e62d29c3-f76c-4108-afb0-bad789d9579a';
    await coordinator['update']({
      identity: { userId: '1', courseId: '2', conversationId, sandboxId: 'sandbox' },
      pendingApproval: { ...proposal, id: approvalId },
      pausedApprovalId: approvalId,
      processId: null,
      activeRunExpiresAt: null,
      idleExpiresAt: null,
      conversationState: 'validating_change',
    });
    await coordinator.alarm();
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenLastCalledWith(65000);
    const acknowledge = () =>
      coordinator.fetch(
        new Request('https://coordinator/push-decision', {
          method: 'POST',
          body: JSON.stringify({
            capability: 'internal',
            conversationId,
            sandboxId: 'sandbox',
            approvalId,
            decision: 'pending',
          }),
        }),
      );
    expect((await acknowledge()).ok).toBe(true);
    expect(await storage.get('conversation')).toMatchObject({
      idleExpiresAt: 605000,
      conversationState: 'waiting_for_approval',
    });
    vi.setSystemTime(305000);
    expect((await acknowledge()).ok).toBe(true);
    expect(await storage.get('conversation')).toMatchObject({ idleExpiresAt: 605000 });
    vi.setSystemTime(605000);
    await coordinator.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });

  it.each(['denied', 'completed', 'failed'] as const)(
    'restores the workspace for a %s decision and resumes exactly once',
    async (status) => {
      const { coordinator, storage } = fixture('run', 5000);
      const course = {
        repository: 'https://github.com/PrairieLearn/test.git',
        branch: 'master',
        expectedSha: 'a'.repeat(40),
      };
      const settings = {
        idleTimeoutSeconds: 600,
        sleepAfterSeconds: 21600,
        turnTimeoutSeconds: 21600,
        backupTtlSeconds: 604800,
      };
      const approval = {
        ...proposal,
        status,
        result: { message: 'Decision result', published: status === 'completed' },
      };
      await coordinator['update']({
        course,
        pendingApproval: approval,
        pausedApprovalId: proposal.id,
        processId: null,
        activeRunExpiresAt: null,
        activeExecutionRemainingMs: 120000,
        sandboxState: 'offline',
        workspaceBackup: {
          handle: { id: 'checkpoint', dir: '/workspace', localBucket: true },
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        startRequest: {
          capability: 'unused',
          conversationId: 'conversation',
          sandboxId: 'sandbox',
          runId: 'run',
          prompt: 'Original request',
          course,
          authoringContext: { courseInstance: null },
          runtimeSettings: settings,
          workspaceBackup: null,
        },
      });
      sandbox.getProcess.mockResolvedValue({ status: 'completed', exitCode: 0 });
      sandbox.getProcess.mockResolvedValueOnce(null);
      sandbox.getProcessLogs.mockResolvedValue({
        stdout: [
          JSON.stringify({
            method: 'item/completed',
            params: { item: { id: 'answer', type: 'agentMessage', text: 'Decision received.' } },
          }),
          JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
        ].join('\n'),
        stderr: '',
      });
      await coordinator.alarm();
      expect(sandbox.restoreBackup).toHaveBeenCalledOnce();
      expect(sandbox.startProcess).toHaveBeenCalledOnce();
      expect(sandbox.exec).toHaveBeenCalledWith(
        "git fetch origin 'master' && git merge --no-edit 'origin/master'",
        expect.objectContaining({ cwd: '/workspace/course' }),
      );
      expect(await storage.get('conversation')).toMatchObject({
        response: 'Decision received.',
        activeRunId: null,
        pausedApprovalId: null,
        conversationState: 'waiting_for_user',
      });
      await coordinator['resumeApproval']();
      expect(sandbox.startProcess).toHaveBeenCalledOnce();
      const events = await coordinator['getEvents']();
      expect(events.filter((event) => event.type === 'user.message')).toHaveLength(0);
      expect(events.filter((event) => event.type === 'sync.completed')).toHaveLength(
        status === 'completed' ? 1 : 0,
      );
    },
  );
});
