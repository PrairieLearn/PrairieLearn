import type { UIMessage } from 'ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  type BudgetRequest,
  type BudgetResponse,
  type ConversationState,
  type RequestChangesResult,
  emptyUsage,
} from '@prairielearn/course-agent-types';

import { SandboxTurn } from '../sandbox/turn.js';

import { type BudgetState, Conversation } from './conversation.js';

const sdk = vi.hoisted(() => ({
  finishTurn: () => {},
  completeResponse: (_requestId: string) => Promise.resolve(),
}));

vi.mock('@cloudflare/ai-chat', () => ({
  AIChatAgent: class {
    messages: UIMessage[] = [];
    name = 'test-conversation';
    state: ConversationState = {
      status: 'offline',
      deadlineAt: null,
      sandboxLost: false,
      reviewId: null,
      budget: { balanceMilliDollars: 0 },
    };

    constructor(
      readonly ctx: unknown,
      readonly env: Env,
    ) {
      sdk.completeResponse = (requestId) => this.onChatResponse({ requestId });
    }

    setState(state: ConversationState) {
      this.state = state;
    }

    schedule = vi.fn();
    stash = vi.fn();
    persistMessages = vi.fn(async (messages: UIMessage[]) => {
      this.messages = structuredClone(messages);
    });

    continueLastTurn = vi.fn(async (body?: Record<string, unknown>) => {
      await this.onChatMessage(undefined, { requestId: 'continuation', continuation: true, body });
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
vi.mock('../monitoring.js', () => ({ logEvent: vi.fn(), reportError: vi.fn() }));
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
      ) {
        sdk.finishTurn = () => this.completion.resolve({ phase: 'execution', stopped: false });
      }

      get messageId() {
        return this.options.messageId;
      }

      openStream = vi.fn(() => new ReadableStream());
    },
  ),
}));

const deniedResult = {
  decision: 'denied',
  publication: { status: 'not_attempted' },
  sync: { status: 'not_attempted' },
} satisfies RequestChangesResult;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('scheduler', { wait: async () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture(saved = new Map<string, unknown>()) {
  const ctx = {
    storage: {
      kv: {
        get: (key: string) => structuredClone(saved.get(key)),
        put: (key: string, value: unknown) => saved.set(key, structuredClone(value)),
        delete: (key: string) => saved.delete(key),
      },
    },
  };
  const sandbox = {
    isRunning: vi.fn(async () => true),
    prepare: vi.fn(),
    addCourseFiles: vi.fn(),
    advanceLocalBaseline: vi.fn(),
    stopProcesses: vi.fn(),
    checkpoint: vi.fn(async () => ({ id: 'checkpoint' })),
    destroy: vi.fn(),
    authorizeModel: vi.fn(async (_config: { executionId: string }) => {}),
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
  if (!saved.has('conversation')) {
    conversation.initialize({
      type: 'github',
      repository: 'PrairieLearn/course',
      branch: 'master',
    });
  }
  return { conversation, saved, ctx, env, sandbox };
}

it('Stop ends native work while admitted inference finishes accounting before reuse', async () => {
  const { conversation, saved, sandbox } = fixture();
  let provider!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, options: RequestInit) => {
      if (String(url).endsWith('/usage')) {
        const report = JSON.parse(options.body as string);
        return Response.json({
          usageReportCount: report.usageReportCount,
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
      usageReportCount: 1,
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

it('saves a review result without credit and delivers it once Resume renews credit', async () => {
  freezeTime();
  const fetch = vi.fn().mockResolvedValueOnce(grant(1, '2026-10-27T05:00:00Z'));
  vi.stubGlobal('fetch', fetch);
  const { saved } = fixture();
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    review: {
      id: 'review',
      snapshot: {
        type: 'github',
        repository: 'PrairieLearn/course',
        branch: 'master',
        baseCommit: 'a'.repeat(40),
        additions: [],
        deletions: [{ path: 'question.html' }],
      },
      result: null,
      waitsForResume: false,
    },
  });
  saved.set('budget', {
    balanceMilliDollars: 0,
    creditExpiresAt: null,
    lastAcknowledgedUsageReportCount: 0,
    accounting: { phase: 'idle', usage: emptyUsage() },
    blocked: { reason: 'budget_exhausted', retryAt: expiresAt },
  } satisfies BudgetState);
  const { conversation } = fixture(saved);
  await conversation.onStart();
  expect(conversation.recordReviewResult('review', deniedResult)).toBe(true);
  expect(SandboxTurn).not.toHaveBeenCalled();
  expect(conversation.state).toMatchObject({ status: 'blocked', reviewId: 'review' });
  expect(await conversation.resume()).toBe(false);
  vi.setSystemTime('2026-10-27T04:01:00Z');
  expect(await conversation.resume()).toBe(true);
  const options = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(options.input.text).toContain('The instructor reviewed the changes');
  expect(budget(saved)).toMatchObject({ balanceMilliDollars: 3000, blocked: null });
});

const expiresAt = '2026-10-27T04:00:00Z';

function grant(usageReportCount: number, creditExpiresAt = expiresAt) {
  return Response.json({
    usageReportCount,
    allocation: { status: 'granted', grantedMilliDollars: 3000, expiresAt: creditExpiresAt },
  } satisfies BudgetResponse);
}

function modelResponse(inputTokens = 10_000, outputTokens = 2_000) {
  return Response.json({ usage: { input_tokens: inputTokens, output_tokens: outputTokens } });
}

async function runningConversation(saved?: Map<string, unknown>) {
  const state = fixture(saved);
  const { conversation, sandbox } = state;
  await conversation.onStart();
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: 'initial' });
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  await options.prepare();
  options.onThread('native-thread');
  options.onReady();
  options.onAccepted('native-turn');
  const { executionId } = sandbox.authorizeModel.mock.calls.at(-1)![0];
  return {
    ...state,
    request: () => conversation.proxyModelRequest('{}', executionId),
    finish: async () => {
      sdk.finishTurn();
      await sdk.completeResponse('initial');
      await vi.waitFor(() =>
        expect(['waiting_for_user', 'blocked']).toContain(conversation.state.status),
      );
    },
  };
}

function budget(saved: Map<string, unknown>) {
  return saved.get('budget') as BudgetState;
}

function freezeTime() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-27T03:10:00Z');
}

it('buffers funded request usage across turns and restarts, including debt at refill', async () => {
  freezeTime();
  const reports: BudgetRequest[] = [];
  let expensive = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, options: RequestInit) => {
      if (String(url).endsWith('/usage')) {
        const report: BudgetRequest = JSON.parse(options.body as string);
        reports.push(report);
        return grant(report.usageReportCount);
      }
      return expensive ? modelResponse(0, 2_400_000) : modelResponse(200_000, 0);
    }),
  );
  let state = await runningConversation();
  for (let i = 0; i < 100; i++) {
    expect((await state.request()).status).toBe(200);
    if (i === 49) {
      await state.finish();
      state = await runningConversation(state.saved);
    }
  }
  expect(reports).toHaveLength(1);
  expect(budget(state.saved)).toMatchObject({
    balanceMilliDollars: 1000,
    accounting: { phase: 'idle', usage: { inputTokens: 20_000_000, costMilliDollars: 2000 } },
  });
  expensive = true;
  await state.request();
  expect(budget(state.saved).balanceMilliDollars).toBe(-200);
  expensive = false;
  await state.request();
  expect(reports[1]).toEqual({
    usageReportCount: 2,
    usageDelta: {
      ...emptyUsage(),
      inputTokens: 20_000_000,
      outputTokens: 2_400_000,
      costMilliDollars: 3200,
    },
    requestCredit: true,
  });
  expect(budget(state.saved).balanceMilliDollars).toBe(2780);
  await state.finish();
});

it.each([
  { failure: 'network error', response: () => Promise.reject(new Error('PL unavailable')) },
  {
    failure: 'timeout',
    response: () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
  },
  {
    failure: '5xx response',
    response: () => Promise.resolve(new Response('Unavailable', { status: 503 })),
  },
])(
  'retries the persisted report when the user clicks Resume after a $failure',
  async ({ response }) => {
    freezeTime();
    const fetch = vi.fn().mockImplementationOnce(response).mockResolvedValueOnce(grant(1));
    vi.stubGlobal('fetch', fetch);
    const state = await runningConversation();
    expect((await state.request()).status).toBe(429);
    expect((await state.request()).status).toBe(429);
    expect(fetch).toHaveBeenCalledOnce();
    await state.finish();
    const restored = fixture(state.saved).conversation;
    await restored.onStart();
    expect(await restored.resume()).toBe(true);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(budget(state.saved)).toMatchObject({
      balanceMilliDollars: 3000,
      lastAcknowledgedUsageReportCount: 1,
      accounting: { phase: 'idle', usage: emptyUsage() },
      blocked: null,
    });
  },
);

it('waits for report acknowledgement before forwarding inference and rejects concurrent requests', async () => {
  freezeTime();
  const acknowledgement = Promise.withResolvers<Response>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(acknowledgement.promise)
    .mockResolvedValueOnce(modelResponse());
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  const first = state.request();
  expect((await state.request()).status).toBe(409);
  expect(fetch).toHaveBeenCalledOnce();
  expect(budget(state.saved).accounting).toMatchObject({
    phase: 'reporting',
    request: { usageReportCount: 1 },
  });
  acknowledgement.resolve(grant(1));
  expect((await first).status).toBe(200);
  expect(state.conversation.state.budget).toEqual({
    balanceMilliDollars: 2998,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(budget(state.saved).accounting.phase).toBe('idle');
  await state.finish();
});

it('blocks on a lost committed acknowledgement rather than replaying paid inference', async () => {
  freezeTime();
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('Reply lost'))
    .mockResolvedValueOnce(
      Response.json({ message: 'The usage report is out of order.' }, { status: 409 }),
    );
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  expect((await state.request()).status).toBe(429);
  await state.finish();
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  expect(await restored.resume()).toBe(false);
  expect(await restored.resume()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(budget(state.saved).blocked).toEqual({ reason: 'usage_unavailable' });
});

it('preserves debt through denial and Resume continues the existing task after reset', async () => {
  freezeTime();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(grant(1))
    .mockResolvedValueOnce(modelResponse(0, 6_800_000))
    .mockResolvedValueOnce(
      Response.json(
        {
          usageReportCount: 2,
          allocation: { status: 'denied', reason: 'hourly_limit', retryAt: expiresAt },
        } satisfies BudgetResponse,
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(grant(3, '2026-10-27T05:00:00Z'));
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  await state.request();
  expect((await state.request()).status).toBe(429);
  expect(budget(state.saved).balanceMilliDollars).toBe(-400);
  await state.finish();
  const restored = fixture(state.saved).conversation;
  await restored.persistMessages([
    ...state.conversation.messages,
    { id: 'partial', role: 'assistant', parts: [{ type: 'text', text: 'Question 1 is done.' }] },
  ]);
  await restored.onStart();
  expect(await restored.resume()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
  vi.setSystemTime('2026-10-27T04:01:00Z');
  expect(await restored.resume()).toBe(true);
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  expect(options.startup).toBe(false);
  expect(options.thread.threadId).toBe('native-thread');
  expect(options.input.text).toContain('Continue the interrupted task');
  expect(restored.messages.at(-1)?.id).toBe('partial');
  expect(restored.state.status).toBe('waiting_for_agent');
  expect(budget(state.saved)).toMatchObject({ balanceMilliDollars: 2600, blocked: null });
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
    usageReportCount: 3,
    usageDelta: emptyUsage(),
    requestCredit: true,
  });
});

it('expires unused credit after restart without discarding unreported usage', async () => {
  freezeTime();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(grant(1))
    .mockResolvedValueOnce(modelResponse(0, 2_000_000))
    .mockResolvedValueOnce(grant(2, '2026-10-27T05:00:00Z'))
    .mockResolvedValueOnce(modelResponse());
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  await state.request();
  await state.finish();
  vi.setSystemTime('2026-10-27T04:00:00Z');
  const restored = await runningConversation(state.saved);
  await restored.request();
  expect(JSON.parse(fetch.mock.calls[2][1].body).usageDelta.costMilliDollars).toBe(1000);
  expect(budget(state.saved).balanceMilliDollars).toBe(2998);
  await restored.finish();
});

it('records final stream usage before forwarding completion and blocks on missing usage', async () => {
  freezeTime();
  const completion = {
    type: 'response.completed',
    response: {
      usage: {
        input_tokens: 10_000,
        output_tokens: 2000,
        input_tokens_details: { cached_tokens: 8000 },
        output_tokens_details: { reasoning_tokens: 500 },
      },
    },
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(grant(1))
    .mockResolvedValueOnce(
      new Response(`data: ${JSON.stringify(completion)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    .mockResolvedValueOnce(
      new Response('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  const response = await state.request();
  const { value } = await response.body!.getReader().read();
  expect(new TextDecoder().decode(value)).toContain('response.completed');
  expect(budget(state.saved)).toMatchObject({
    balanceMilliDollars: 2998,
    accounting: {
      phase: 'idle',
      usage: {
        inputTokens: 10_000,
        cachedInputTokens: 8000,
        outputTokens: 2000,
        reasoningTokens: 500,
        costMilliDollars: 2,
      },
    },
  });
  await (await state.request()).text();
  expect(budget(state.saved).blocked).toEqual({ reason: 'usage_unavailable' });
  await state.finish();
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  expect(await restored.resume()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('blocks a restart with an unresolved provider request without replaying inference', async () => {
  freezeTime();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(grant(1))
    .mockResolvedValueOnce(
      new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  vi.stubGlobal('fetch', fetch);
  const state = await runningConversation();
  await state.request();
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  // The interrupted turn is repaired first; the unknown usage still blocks further inference.
  expect(restored.state).toMatchObject({ status: 'blocked', reason: 'runtime_failed' });
  expect(await restored.resume()).toBe(false);
  expect(restored.state).toMatchObject({ status: 'blocked', reason: 'usage_unavailable' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
