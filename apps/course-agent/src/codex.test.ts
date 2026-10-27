import { describe, expect, it } from 'vitest';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

import type { ThreadStartResponse } from '../generated/types/v2/ThreadStartResponse.js';
import type { Turn } from '../generated/types/v2/Turn.js';

import { CodexAppServerClient } from './codex.js';
import { SandboxTurn } from './sandbox-turn.js';
import type { CourseSandbox } from './sandbox.js';

const turn: Turn = {
  id: 'turn',
  rootTurnId: null,
  items: [],
  itemsView: 'full',
  status: 'inProgress',
  error: null,
  startedAt: null,
  completedAt: null,
  durationMs: null,
};
const threadResult: ThreadStartResponse = {
  model: 'test',
  modelProvider: 'test',
  serviceTier: null,
  cwd: '/workspace/session/course',
  approvalPolicy: 'never',
  approvalsReviewer: 'user',
  sandbox: { type: 'dangerFullAccess' },
  reasoningEffort: null,
  disabledPluginIds: [],
  instructionSources: [],
  runtimeWorkspaceRoots: [],
  activePermissionProfile: null,
  multiAgentMode: 'explicitRequestOnly',
  thread: {
    id: 'thread',
    sessionId: 'session',
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    projectId: null,
    historyMode: 'legacy',
    modelProvider: 'test',
    model: 'test',
    reasoningEffort: null,
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: { type: 'idle' },
    path: null,
    cwd: '/workspace/session/course',
    cliVersion: 'test',
    originator: null,
    source: 'appServer',
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    environments: [],
    extra: null,
    canAcceptDirectInput: true,
    daybreakEnabled: false,
  },
};

function runner({
  loseAcceptance = false,
  savedReview,
  initializeResult = {
    userAgent: 'test',
    codexHome: '/workspace/session/home/.codex',
    platformFamily: 'unix',
    platformOs: 'linux',
  },
}: { loseAcceptance?: boolean; initializeResult?: unknown; savedReview?: ReviewOutcome } = {}) {
  const commands: { id: number; method: string; params: unknown }[] = [];
  const emit = (frame: unknown) =>
    socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
  let interruptFails = false;
  let closed = false;
  const socket = Object.assign(new EventTarget(), {
    accept() {},
    close() {
      if (closed) return;
      closed = true;
      socket.dispatchEvent(new Event('close'));
    },
    send(text: string) {
      const frame = JSON.parse(text) as { id: number; method: string; params: unknown };
      commands.push(frame);
      if (frame.method === 'turn/interrupt' && interruptFails) {
        throw new Error('Lost native connection');
      }
      if (frame.method === 'initialize') {
        emit({
          id: frame.id,
          result: initializeResult,
        });
      }
      if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        emit({ id: frame.id, result: threadResult });
      }
      if (frame.method === 'thread/read') {
        const previousTurn: Turn = {
          ...turn,
          status: 'completed',
          items: savedReview
            ? [
                {
                  type: 'functionCallOutput',
                  id: 'review-output',
                  name: 'push_sync',
                  namespace: null,
                  output: JSON.stringify(savedReview),
                },
              ]
            : [],
        };
        emit({
          id: frame.id,
          result: { thread: { ...threadResult.thread, turns: [previousTurn] } },
        });
      }
      if (frame.method === 'turn/start' && !loseAcceptance) {
        emit({ id: frame.id, result: { turn } });
      }
      if (frame.method === 'turn/interrupt') emit({ id: frame.id, result: {} });
    },
  });
  const sandbox = {
    fetch: async () => ({ status: 101, webSocket: socket }),
  } as unknown as DurableObjectStub<CourseSandbox>;
  return {
    sandbox,
    native: new CodexAppServerClient(sandbox, 'assistant'),
    commands,
    emit,
    disconnect: () => socket.close(),
    failInterrupt: () => {
      interruptFails = true;
    },
  };
}

describe('Codex native stream', () => {
  it.each([
    {
      name: 'restored review supplies only its result without replaying the prompt',
      incorporated: false,
    },
    { name: 'already-incorporated review does not start another native turn', incorporated: true },
  ])('$name', async ({ incorporated }) => {
    const outcome: ReviewOutcome = {
      callId: 'pending-review',
      result: {
        decision: 'denied',
        publication: { status: 'not_attempted' },
        sync: { status: 'not_attempted' },
      },
    };
    const { native, commands, disconnect } = runner({
      savedReview: incorporated ? outcome : undefined,
    });
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: 'thread' });
    await native.run(outcome, () => {});
    const submissions = commands.filter((command) => command.method === 'turn/start');
    expect(submissions.map((command) => command.params)).toEqual(
      incorporated
        ? []
        : [
            {
              threadId: 'thread',
              input: [],
              toolOutput: {
                name: 'push_sync',
                namespace: null,
                output: JSON.stringify(outcome),
                retain: true,
              },
            },
          ],
    );
    native.closeStream();
    disconnect();
  });

  it('rejects invalid native results before continuing setup', async () => {
    const { native, commands } = runner({ initializeResult: {} });
    await expect(native.connect()).rejects.toThrow('Invalid result for initialize');
    await expect(native.finished).rejects.toThrow('Invalid result for initialize');
    expect(commands.map((command) => command.method)).toEqual(['initialize']);
  });

  it('waits for terminal confirmation after SDK cancellation and interrupt acknowledgement', async () => {
    const { native, commands, emit, disconnect } = runner();
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const accepted: string[] = [];
    await native.run('New input only', (id) => accepted.push(id));
    expect(accepted).toEqual(['turn']);
    let interrupted = false;
    const stop = native.interrupt().then(() => {
      interrupted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commands.at(-1)?.method).toBe('turn/interrupt');
    expect(interrupted).toBe(false);
    await native.stream.cancel();
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { ...turn, status: 'interrupted' } },
    });
    await stop;
    native.closeStream();
    disconnect();
  });

  it('does not repeat submission when the acceptance response is lost', async () => {
    const { native, commands, disconnect } = runner({ loseAcceptance: true });
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const submission = native.run('Edit', () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    disconnect();
    await expect(submission).rejects.toThrow();
    await expect(native.finished).rejects.toThrow('disconnected');
    expect(commands.filter((command) => command.method === 'turn/start')).toHaveLength(1);
  });
});

describe('Sandbox turn cancellation', () => {
  it('does not submit after Stop during preparation and waits for process cleanup', async () => {
    const { sandbox, commands } = runner();
    const prepared = Promise.withResolvers<undefined>();
    const cleaned = Promise.withResolvers<undefined>();
    const cleaning = Promise.withResolvers<undefined>();
    sandbox.stopProcesses = async () => {
      cleaning.resolve(undefined);
      await cleaned.promise;
    };
    const turn = new SandboxTurn(sandbox, {
      messageId: 'assistant',
      text: 'Do not submit',
      startup: true,
      prepare: () => prepared.promise,
      thread: { model: 'test', instructions: 'Edit course', threadId: null },
      onThread: () => {},
      onReady: () => {},
      onAccepted: () => {},
    });
    let stopped = false;
    const stop = turn.stop().then(() => {
      stopped = true;
    });
    await turn.stream.cancel();
    prepared.resolve(undefined);
    await cleaning.promise;
    expect(commands).toEqual([]);
    expect(stopped).toBe(false);
    cleaned.resolve(undefined);
    await stop;
    expect(await turn.finished).toEqual({ phase: 'startup', stopped: true });
  });

  it('settles the response when interruption and process cleanup both fail', async () => {
    const { sandbox, failInterrupt } = runner();
    failInterrupt();
    sandbox.stopProcesses = async () => {
      throw new Error('Could not stop processes');
    };
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(sandbox, {
      messageId: 'assistant',
      text: 'Edit',
      startup: false,
      prepare: async () => {},
      thread: { model: 'test', instructions: 'Edit course', threadId: null },
      onThread: () => {},
      onReady: () => {},
      onAccepted: () => accepted.resolve(undefined),
    });
    await accepted.promise;
    await expect(turn.stop()).rejects.toThrow('Could not stop processes');
    expect(await turn.finished).toMatchObject({
      phase: 'execution',
      stopped: true,
      error: new Error('Could not stop processes'),
    });
  });
});
