import type { UIMessage } from 'ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  type ConversationState,
  type RequestChangesResult,
  type UsageDecision,
  type UsageReport,
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
      title: null,
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

// Title generation calls the provider directly; model requests here are the agent's own.
vi.mock('./title.js', () => ({ generateTitle: vi.fn(async () => null) }));
const { reportError } = await import('../monitoring.js');
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

const expiresAt = '2026-10-27T04:00:00Z';

function decision(value: UsageDecision = { status: 'allowed' }) {
  return Response.json(value);
}

function modelResponse(inputTokens = 10_000, outputTokens = 2_000) {
  return Response.json({ usage: { input_tokens: inputTokens, output_tokens: outputTokens } });
}

/** Route PrairieLearn usage reports and provider requests to separate handlers. */
function stubFetch(handlers: { usage: () => Promise<Response>; model?: () => Promise<Response> }) {
  const fetch = vi.fn(async (url: string | URL, _options: RequestInit) =>
    String(url).endsWith('/usage')
      ? await handlers.usage()
      : await (handlers.model ?? (async () => modelResponse()))(),
  );
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    reports: () =>
      fetch.mock.calls
        .filter(([url]) => String(url).endsWith('/usage'))
        .map(([, options]) => JSON.parse(options.body as string) as UsageReport),
  };
}

async function runningConversation(saved?: Map<string, unknown>) {
  const state = fixture(saved);
  const { conversation, sandbox } = state;
  await conversation.onStart();
  // Each turn submits a new message; a message already submitted is never sent again.
  await conversation.persistMessages([
    {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: 'Edit this question' }],
    },
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

const reportedUsage = { ...emptyUsage(), inputTokens: 10_000, outputTokens: 2_000 };

it('checks with PrairieLearn once per decision window rather than before every request', async () => {
  freezeTime();
  const { reports } = stubFetch({ usage: async () => decision() });
  const state = await runningConversation();
  // The first request waits for a decision; later ones while it is recent do not.
  expect((await state.request()).status).toBe(200);
  expect((await state.request()).status).toBe(200);
  expect(reports()).toHaveLength(1);
  // Once the decision is 30 s old, a finished request refreshes it in the background.
  vi.setSystemTime('2026-10-27T03:10:31Z');
  expect((await state.request()).status).toBe(200);
  await vi.waitFor(() => expect(reports()).toHaveLength(2));
  await state.finish();
  expect(reports()).toEqual([
    { reportId: expect.any(String), model: 'test', usage: emptyUsage() },
    {
      reportId: expect.any(String),
      model: 'test',
      usage: { ...emptyUsage(), inputTokens: 30_000, outputTokens: 6_000 },
    },
  ]);
  expect(budget(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});

it.each([
  { failure: 'network error', response: () => Promise.reject(new Error('PL unavailable')) },
  { failure: '5xx response', response: async () => new Response('Down', { status: 503 }) },
])('resends the same report after a $failure', async ({ response }) => {
  const usage = vi
    .fn()
    .mockImplementationOnce(response)
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  // Codex retries the 503, and the retry resends the pending report unchanged.
  expect((await state.request()).status).toBe(503);
  expect((await state.request()).status).toBe(200);
  expect(reports()[0]).toEqual(reports()[1]);
  expect(budget(state.saved)).toMatchObject({ pending: null, blocked: null });
  await state.finish();
});

it('Stop waits for the running request to finish accounting before reuse', async () => {
  const { conversation, saved, sandbox } = fixture();
  let provider!: ReadableStreamDefaultController<Uint8Array>;
  const { reports } = stubFetch({
    usage: async () => decision(),
    model: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            provider = controller;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  });
  await conversation.persistMessages([
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  const stop = new AbortController();
  await conversation.onChatMessage(undefined, { requestId: 'initial', abortSignal: stop.signal });
  const [, , options] = vi.mocked(SandboxTurn).mock.calls[0];
  await options.prepare();
  options.onReady();
  const { executionId } = sandbox.authorizeModel.mock.calls[0][0];
  const response = await conversation.proxyModelRequest('{}', executionId);
  stop.abort();
  await sdk.completeResponse('initial');
  expect(vi.mocked(SandboxTurn).mock.results[0].value.stop).toHaveBeenCalledOnce();
  await response.body!.cancel();
  expect((await conversation.proxyModelRequest('{}', executionId)).status).toBe(409);
  expect((saved.get('conversation') as { lifecycle: ConversationState }).lifecycle.status).toBe(
    'stopping',
  );
  provider.enqueue(
    new TextEncoder().encode(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { usage: { input_tokens: 10_000, output_tokens: 2_000 } },
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
  await vi.waitFor(() => expect(reports()).toHaveLength(2));
  expect(reports()[1].usage).toEqual(reportedUsage);
});

it('pauses at the hourly limit, and Resume after the reset continues the task', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(
      decision({ status: 'denied', reason: 'hourly_limit', retryAt: expiresAt }),
    )
    .mockImplementation(async () => decision());
  stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  // Past the decision window, the next request checks again and is denied.
  vi.setSystemTime('2026-10-27T03:11:01Z');
  expect((await state.request()).status).toBe(429);
  await state.finish();
  const restored = fixture(state.saved).conversation;
  await restored.persistMessages([
    ...state.conversation.messages,
    { id: 'partial', role: 'assistant', parts: [{ type: 'text', text: 'Question 1 is done.' }] },
  ]);
  await restored.onStart();
  expect(restored.state).toMatchObject({
    status: 'blocked',
    reason: 'budget_exhausted',
    retryAt: expiresAt,
  });
  expect(await restored.resume()).toBe(false);
  expect(usage).toHaveBeenCalledTimes(2);
  vi.setSystemTime('2026-10-27T04:01:00Z');
  expect(await restored.resume()).toBe(true);
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  expect(options.startup).toBe(false);
  expect(options.thread.threadId).toBe('native-thread');
  expect(options.input.text).toContain('Continue the interrupted task');
  expect(restored.messages.at(-1)?.id).toBe('partial');
  expect(restored.state.status).toBe('waiting_for_agent');
  expect(budget(state.saved)).toMatchObject({ pending: null, blocked: null });
});

it('saves a review result without credit and delivers it once Resume renews credit', async () => {
  freezeTime();
  stubFetch({ usage: async () => decision() });
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
    unreported: emptyUsage(),
    pending: null,
    running: null,
    blocked: { reason: 'budget_exhausted', retryAt: expiresAt },
  } satisfies BudgetState);
  const { conversation } = fixture(saved);
  await conversation.onStart();
  expect(conversation.recordReviewResult('review', deniedResult)).toBe(true);
  // Delivery runs as a scheduled callback; while credit is blocked it starts no turn.
  await conversation.deliverWaitingResult();
  expect(SandboxTurn).not.toHaveBeenCalled();
  expect(conversation.state).toMatchObject({ status: 'blocked', reviewId: 'review' });
  expect(await conversation.resume()).toBe(false);
  vi.setSystemTime('2026-10-27T04:01:00Z');
  expect(await conversation.resume()).toBe(true);
  expect(conversation.schedule).toHaveBeenLastCalledWith(
    0,
    'deliverWaitingResult',
    undefined,
    expect.anything(),
  );
  await conversation.deliverWaitingResult();
  const options = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(options.input.text).toContain('The instructor denied the submitted changes.');
  expect(budget(saved)).toMatchObject({ pending: null, blocked: null });
});

it('charges the estimate when final usage never arrives instead of blocking', async () => {
  const model = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  const { reports } = stubFetch({ usage: async () => decision(), model });
  const state = await runningConversation();
  await (await state.request()).text();
  expect(budget(state.saved)).toMatchObject({
    blocked: null,
    unreported: { inputTokens: 1, outputTokens: 16_000 },
  });
  // The object restarts while the next request's stream is still open; the restarted object
  // charges that request's estimate too and reports both, having no recent decision.
  await state.request();
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  await vi.waitFor(() => expect(reports()).toHaveLength(2));
  expect(reports()[1].usage).toMatchObject({ inputTokens: 2, outputTokens: 32_000 });
  await vi.waitFor(() =>
    expect(budget(state.saved)).toMatchObject({ running: null, blocked: null, pending: null }),
  );
});

it('retries a rejected report without blocking, reporting the rejection once', async () => {
  const usage = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  // A configuration fault such as a rotated token fails the request so Codex retries it.
  expect((await state.request()).status).toBe(503);
  expect((await state.request()).status).toBe(503);
  expect(reportError).toHaveBeenCalledOnce();
  expect(budget(state.saved).blocked).toBeNull();
  // Once the fault is fixed, the same report is accepted and inference continues.
  expect((await state.request()).status).toBe(200);
  expect(new Set(reports().map(({ reportId }) => reportId)).size).toBe(1);
  await state.finish();
});

it('records a request that finishes after the decision that blocked the turn', async () => {
  freezeTime();
  const refresh = Promise.withResolvers<Response>();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockReturnValueOnce(refresh.promise)
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  // The decision is old enough that this request's completion refreshes it in the background.
  vi.setSystemTime('2026-10-27T03:10:31Z');
  expect((await state.request()).status).toBe(200);
  // The next request starts while that refresh is still waiting for PrairieLearn.
  expect((await state.request()).status).toBe(200);
  refresh.resolve(decision({ status: 'denied', reason: 'hourly_limit', retryAt: expiresAt }));
  await vi.waitFor(() => expect(budget(state.saved).blocked).not.toBeNull());
  await state.finish();
  await vi.waitFor(() => expect(reports()).toHaveLength(3));
  expect(reports()[2].usage).toEqual(reportedUsage);
  expect(budget(state.saved)).toMatchObject({
    unreported: emptyUsage(),
    blocked: { reason: 'budget_exhausted' },
  });
});

it('does not continue a finished turn when the limit is reached at its end', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(
      decision({ status: 'denied', reason: 'hourly_limit', retryAt: expiresAt }),
    )
    .mockImplementation(async () => decision());
  stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  // The turn-end report is the one that crosses the limit.
  await state.finish();
  await vi.waitFor(() =>
    expect(state.conversation.state).toMatchObject({
      status: 'blocked',
      reason: 'budget_exhausted',
    }),
  );
  vi.setSystemTime('2026-10-27T04:01:00Z');
  const turns = vi.mocked(SandboxTurn).mock.calls.length;
  expect(await state.conversation.resume()).toBe(true);
  expect(vi.mocked(SandboxTurn).mock.calls).toHaveLength(turns);
  expect(state.conversation.state.status).toBe('waiting_for_user');
});
