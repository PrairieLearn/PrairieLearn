import type { UIMessage } from 'ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  type ConversationState,
  type PushSyncResult,
  emptyUsage,
} from '@prairielearn/course-agent-types';

import { SandboxTurn } from '../sandbox/turn.js';

import type { BudgetState } from './budget.js';
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
vi.mock('../monitoring.js', () => ({ reportError: vi.fn() }));
vi.mock('../sandbox/turn.js', () => ({
  SandboxTurn: vi.fn(
    class {
      stream = new ReadableStream();
      private completion = Promise.withResolvers<Awaited<SandboxTurn['finished']>>();
      finished = this.completion.promise;
      stop = vi.fn(async () => {
        this.completion.resolve({ phase: 'execution', stopped: true });
      });

      constructor(
        _sandbox: unknown,
        _native: unknown,
        readonly options: ConstructorParameters<typeof SandboxTurn>[2],
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

afterEach(() => vi.unstubAllGlobals());

function fixture() {
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
  const sandbox = {
    prepare: vi.fn(),
    stopProcesses: vi.fn(),
    authorizeModel: vi.fn(async (_config: { executionId: string }) => {}),
    captureReview: vi.fn(async () => ({
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit: 'a'.repeat(40),
      additions: [],
      deletions: [],
    })),
  };
  const env = {
    OPENAI_MODEL: 'test',
    PL_SERVICE_URL: 'https://pl.test',
    PL_SERVICE_TOKEN: 'test-token',
    AGENT_TURN_SECONDS: '600',
    USER_IDLE_SECONDS: '60',
    CourseSandbox: {
      getByName: () => sandbox,
    },
  } as unknown as Env;
  const conversation = new Conversation(ctx as unknown as DurableObjectState, env);
  conversation.initialize({ type: 'github', repository: 'PrairieLearn/course', branch: 'master' });
  return { conversation, saved, ctx, env, sandbox };
}

async function pendingReview(live: boolean, budget?: BudgetState) {
  const { conversation, saved, ctx, env, sandbox } = fixture();
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: 'initial' });
  const [, , options] = vi.mocked(SandboxTurn).mock.calls[0];
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
  if (live) return { conversation, nativeResult, saved, sandbox };

  // A delayed decision sees saved state/history, with no in-memory native execution.
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    sandboxId: null,
    lifecycle: { status: 'offline' },
    deadline: null,
  });
  if (budget) saved.set('budget', budget);
  const restored = new Conversation(ctx as unknown as DurableObjectState, env);
  await restored.persistMessages(conversation.messages);
  await restored.onStart();
  vi.mocked(SandboxTurn).mockClear();
  return { conversation: restored, nativeResult, saved, sandbox };
}

it('denial after restart continues the saved thread with only its result', async () => {
  const { conversation } = await pendingReview(false);
  conversation.recordReviewDecision({ callId: 'review', decision: 'denied' });
  await conversation.recordReviewOutcome({ callId: 'review', result: results.denied });
  expect(SandboxTurn).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({
      text: { callId: 'review', result: results.denied },
      thread: expect.objectContaining({ threadId: 'native-thread' }),
    }),
  );
});

it('approval answers the waiting call once despite duplicate or conflicting outcomes', async () => {
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
  expect(SandboxTurn).toHaveBeenCalledOnce();
});

it('Stop ends native work while admitted inference finishes accounting before reuse', async () => {
  const { conversation, saved, sandbox } = fixture();
  let provider!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, options: RequestInit) => {
      if (String(url).endsWith('/usage')) {
        const report = JSON.parse(options.body as string);
        return Response.json({
          sequence: report.sequence,
          allocation: report.requestCredit
            ? {
                status: 'granted',
                grantedMilliDollars: 3000,
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              }
            : { status: 'not_requested' },
        });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            provider = controller;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }),
  );
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  const stop = new AbortController();
  await conversation.onChatMessage(undefined, { requestId: 'initial', abortSignal: stop.signal });
  const [, , options] = vi.mocked(SandboxTurn).mock.calls[0];
  await options.prepare();
  options.onReady();
  const { executionId } = sandbox.authorizeModel.mock.calls[0][0];
  const request = () => '{}';
  const response = await conversation.proxyModelRequest(request(), executionId);
  stop.abort();
  await sdk.completeResponse('initial');
  expect(vi.mocked(SandboxTurn).mock.results[0].value.stop).toHaveBeenCalledOnce();
  await response.body!.cancel();
  expect((await conversation.proxyModelRequest(request(), executionId)).status).toBe(409);
  expect((saved.get('conversation') as { lifecycle: ConversationState }).lifecycle.status).toBe(
    'stopping',
  );
  provider.enqueue(
    new TextEncoder().encode(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { usage: { input_tokens: 10000, output_tokens: 2000 } },
        }) +
        '\n\n',
    ),
  );
  provider.close();
  await vi.waitFor(() => {
    expect((saved.get('conversation') as { lifecycle: ConversationState }).lifecycle.status).toBe(
      'waiting_for_user',
    );
  });
  expect(saved.get('budget') as BudgetState).toMatchObject({
    balanceMilliDollars: 2998,
    blocked: null,
    accounting: { phase: 'idle', usage: { costMilliDollars: 2 } },
  });
});

it('Stop during a refill never forwards inference after the credit reply arrives', async () => {
  const { conversation, saved, sandbox } = fixture();
  const grant = Promise.withResolvers<Response>();
  const fetch = vi.fn(() => grant.promise);
  vi.stubGlobal('fetch', fetch);
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  const stop = new AbortController();
  await conversation.onChatMessage(undefined, { requestId: 'initial', abortSignal: stop.signal });
  await vi.mocked(SandboxTurn).mock.calls[0][2].prepare();
  const { executionId } = sandbox.authorizeModel.mock.calls[0][0];
  const response = conversation.proxyModelRequest('{}', executionId);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  stop.abort();
  await sdk.completeResponse('initial');
  grant.resolve(
    Response.json({
      sequence: 1,
      allocation: {
        status: 'granted',
        grantedMilliDollars: 3000,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    }),
  );
  expect((await response).status).toBe(409);
  await vi.waitFor(() =>
    expect((saved.get('budget') as BudgetState).accounting.phase).toBe('idle'),
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(saved.get('budget')).toMatchObject({ balanceMilliDollars: 3000, blocked: null });
});

it('a restored review saves its outcome without credit and gates subsequent inference', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('scheduler', { wait: async () => {} });
  const { conversation, saved, sandbox } = await pendingReview(false, {
    balanceMilliDollars: 0,
    creditExpiresAt: null,
    lastAcknowledgedSequence: 0,
    accounting: { phase: 'idle', usage: emptyUsage() },
    blocked: {
      reason: 'budget_exhausted',
      retryAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  conversation.recordReviewDecision({ callId: 'review', decision: 'denied' });
  await expect(
    conversation.recordReviewOutcome({ callId: 'review', result: results.denied }),
  ).resolves.toBe(true);
  const options = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(options.text).toEqual({ callId: 'review', result: results.denied });
  await options.prepare();
  const { executionId } = sandbox.authorizeModel.mock.calls[0][0];
  expect((await conversation.proxyModelRequest('{}', executionId)).status).toBe(429);
  expect((saved.get('budget') as BudgetState).blocked?.reason).toBe('budget_exhausted');
  expect(fetch).not.toHaveBeenCalled();
  await sdk.completeResponse('continuation');
});
