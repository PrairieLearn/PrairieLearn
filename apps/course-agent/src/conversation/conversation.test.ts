import type { UIMessage } from 'ai';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ConversationState, PushSyncResult } from '@prairielearn/course-agent-types';

import { SandboxTurn } from '../sandbox-turn.js';

import { Conversation } from './conversation.js';

const sdk = vi.hoisted(() => ({
  reviewReady: Promise.withResolvers<undefined>(),
  continued: vi.fn(),
  completeResponse: (_requestId: string) => Promise.resolve(),
}));

vi.mock('@cloudflare/ai-chat', () => ({
  AIChatAgent: class {
    messages: UIMessage[] = [];
    constructor(
      readonly ctx: unknown,
      readonly env: Env,
    ) {
      sdk.completeResponse = (requestId) => this.onChatResponse({ requestId });
    }

    setState(state: ConversationState) {
      if (state.status === 'waiting_for_user') sdk.reviewReady.resolve(undefined);
    }

    schedule = vi.fn();
    stash = vi.fn();
    persistMessages = vi.fn(async (messages: UIMessage[]) => {
      this.messages = structuredClone(messages);
    });

    continueLastTurn = vi.fn(async () => {
      sdk.continued();
      await this.onChatMessage(undefined, { requestId: 'continuation', continuation: true });
      return { status: 'completed' };
    });

    async keepAliveWhile(fn: () => Promise<void>) {
      await fn();
    }

    async onChatResponse(_result: { requestId: string }) {
      return undefined;
    }

    async onChatMessage(_finish: unknown, _options: unknown): Promise<unknown> {
      throw new Error('The Conversation implementation supplies this hook');
    }
  },
}));
vi.mock('../sandbox-turn.js', () => ({
  SandboxTurn: vi.fn(
    class {
      stream = new ReadableStream();
      finished = new Promise<never>(() => {});
      constructor(
        _sandbox: unknown,
        readonly options: ConstructorParameters<typeof SandboxTurn>[1],
      ) {}

      get messageId() {
        return this.options.messageId;
      }

      openStream = vi.fn(() => new ReadableStream());
    },
  ),
}));

const results = {
  approved: {
    decision: 'approved',
    publication: { status: 'published', commitSha: 'a'.repeat(40) },
    sync: { status: 'succeeded' },
  },
  denied: {
    decision: 'denied',
    publication: { status: 'not_attempted' },
    sync: { status: 'not_attempted' },
  },
} satisfies Record<string, PushSyncResult>;

beforeEach(() => {
  vi.clearAllMocks();
  sdk.reviewReady = Promise.withResolvers<undefined>();
});

async function pendingReview(live: boolean) {
  const saved = new Map<string, unknown>();
  const ctx = {
    storage: {
      kv: {
        get: (key: string) => saved.get(key),
        put: (key: string, value: unknown) => saved.set(key, structuredClone(value)),
        delete: (key: string) => saved.delete(key),
      },
    },
  };
  const env = {
    OPENAI_MODEL: 'test',
    AGENT_TURN_SECONDS: '600',
    USER_IDLE_SECONDS: '60',
    CourseSandbox: {
      getByName: () => ({
        captureReview: vi.fn(async () => ({
          repository: 'PrairieLearn/course',
          branch: 'master',
          baseCommit: 'a'.repeat(40),
          additions: [],
          deletions: [],
        })),
      }),
    },
  } as unknown as Env;
  const conversation = new Conversation(ctx as unknown as DurableObjectState, env);
  conversation.initialize({ repository: 'PrairieLearn/course', branch: 'master' });
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: 'initial' });
  const [, options] = vi.mocked(SandboxTurn).mock.calls[0];
  options.onThread('native-thread');
  const nativeResult = options.onReview!(
    {
      callId: 'review',
      threadId: 'native-thread',
      turnId: 'turn',
      namespace: null,
      tool: 'push_sync',
      arguments: {},
    },
    () => {
      void conversation.persistMessages([
        ...conversation.messages,
        {
          id: options.messageId,
          role: 'assistant',
          parts: [
            { type: 'tool-push_sync', toolCallId: 'review', state: 'input-available', input: {} },
          ],
        },
      ]);
      void sdk.completeResponse('initial');
    },
  );
  await sdk.reviewReady.promise;
  if (live) return { conversation, nativeResult };

  // A delayed decision sees saved state/history, with no in-memory native execution.
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    sandboxId: null,
    lifecycle: { status: 'offline' },
    deadline: null,
  });
  const restored = new Conversation(ctx as unknown as DurableObjectState, env);
  await restored.persistMessages(conversation.messages);
  await restored.onStart();
  vi.mocked(SandboxTurn).mockClear();
  return { conversation: restored, nativeResult };
}

it.each(['approved', 'denied'] as const)(
  'live %s decision answers the waiting native call',
  async (decision) => {
    const { conversation, nativeResult } = await pendingReview(true);
    expect(
      conversation.recordReviewDecision(
        decision === 'approved'
          ? { callId: 'review', decision, jobSequenceId: 'job' }
          : { callId: 'review', decision },
      ),
    ).toBe(true);
    await expect(
      conversation.recordReviewOutcome({ callId: 'review', result: results[decision] }),
    ).resolves.toBe(true);
    await expect(nativeResult).resolves.toEqual(results[decision]);
    expect(SandboxTurn).toHaveBeenCalledOnce();
  },
);

it.each(['approved', 'denied'] as const)(
  'delayed %s decision continues the saved thread with only its result',
  async (decision) => {
    const { conversation } = await pendingReview(false);
    expect(
      conversation.recordReviewDecision(
        decision === 'approved'
          ? { callId: 'review', decision, jobSequenceId: 'job' }
          : { callId: 'review', decision },
      ),
    ).toBe(true);
    await expect(
      conversation.recordReviewOutcome({ callId: 'review', result: results[decision] }),
    ).resolves.toBe(true);
    expect(SandboxTurn).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({
        text: { callId: 'review', result: results[decision] },
        thread: expect.objectContaining({ threadId: 'native-thread' }),
      }),
    );
  },
);

it('duplicate outcomes share delivery and a conflicting outcome cannot answer the call', async () => {
  const { conversation, nativeResult } = await pendingReview(true);
  conversation.recordReviewDecision({
    callId: 'review',
    decision: 'approved',
    jobSequenceId: 'job',
  });
  const saved = Promise.withResolvers<undefined>();
  const persist = conversation.persistMessages.bind(conversation);
  vi.spyOn(conversation, 'persistMessages').mockImplementationOnce(async (messages) => {
    await saved.promise;
    await persist(messages);
  });
  const outcome = { callId: 'review', result: results.approved };
  const first = conversation.recordReviewOutcome(outcome);
  const duplicate = conversation.recordReviewOutcome(outcome);
  await expect(
    conversation.recordReviewOutcome({ callId: 'review', result: results.denied }),
  ).resolves.toBe(false);
  saved.resolve(undefined);
  await expect(Promise.all([first, duplicate])).resolves.toEqual([true, true]);
  await expect(nativeResult).resolves.toEqual(results.approved);
  await expect(conversation.recordReviewOutcome(outcome)).resolves.toBe(true);
  expect(sdk.continued).toHaveBeenCalledOnce();
});
