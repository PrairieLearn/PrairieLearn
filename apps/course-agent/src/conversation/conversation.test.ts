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
  /** The SDK's own gap before it calls back with a continuation. */
  continuationCallback: () => Promise.resolve(),
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

    schedule = vi.fn(async () => ({}));
    stash = vi.fn();
    persistMessages = vi.fn(async (messages: UIMessage[]) => {
      this.messages = structuredClone(messages);
    });

    continueLastTurn = vi.fn(async (body?: Record<string, unknown>) => {
      await sdk.continuationCallback();
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
const { generateTitle } = await import('./title.js');
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
  sdk.continuationCallback = () => Promise.resolve();
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
function stubFetch(handlers: {
  usage: () => Promise<Response>;
  model?: (options: RequestInit) => Promise<Response>;
}) {
  const fetch = vi.fn(async (url: string | URL, options: RequestInit) =>
    String(url).endsWith('/usage')
      ? await handlers.usage()
      : await (handlers.model ?? (async () => modelResponse()))(options),
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
    /** Waits until the response is read and its usage recorded, as Codex's next request would. */
    request: async () => {
      const unreported = JSON.stringify(budget(state.saved)?.unreported ?? emptyUsage());
      const response = await conversation.proxyModelRequest('{}', executionId);
      if (!response.ok) return response;
      const text = await response.text();
      await vi.waitFor(() => {
        if (JSON.stringify(budget(state.saved).unreported) === unreported) {
          throw new Error('Usage is not recorded yet');
        }
      });
      return new Response(text, { status: response.status, headers: response.headers });
    },
    startRequest: () => conversation.proxyModelRequest('{}', executionId),
    search: (operations: number) => conversation.proxySearchRequest('{}', operations, executionId),
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
  // Recorded usage schedules a flush, which also refreshes the decision.
  expect(state.conversation.schedule).toHaveBeenCalledWith(30, 'flushUsage', undefined, {
    idempotent: true,
  });
  vi.setSystemTime('2026-10-27T03:10:30Z');
  await state.conversation.flushUsage();
  vi.setSystemTime('2026-10-27T03:11:01Z');
  expect((await state.request()).status).toBe(200);
  await state.finish();
  expect(reports().map(({ usage }) => usage)).toEqual([
    emptyUsage(),
    { ...emptyUsage(), inputTokens: 20_000, outputTokens: 4_000 },
    reportedUsage,
  ]);
  expect(budget(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});

it.each([
  { failure: 'network error', response: () => Promise.reject(new Error('PL unavailable')) },
  { failure: '5xx response', response: async () => new Response('Down', { status: 503 }) },
])('resends the same report after a $failure', async ({ response }) => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockImplementationOnce(response)
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  vi.setSystemTime('2026-10-27T03:11:01Z');
  // Codex retries the 503, and the retry resends the pending report unchanged.
  expect((await state.request()).status).toBe(503);
  expect((await state.request()).status).toBe(200);
  expect(reports()[1]).toEqual(reports()[2]);
  expect(budget(state.saved)).toMatchObject({ pending: null, limitedUntil: null });
  await state.finish();
});

it('passes the provider stream through unchanged and records its final usage', async () => {
  const body = [
    'data: {"type":"response.output_text.delta","delta":"Hi"}',
    'data: not json',
    'data: ' +
      JSON.stringify({
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 10_000,
            input_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 },
            output_tokens: 2_000,
            output_tokens_details: { reasoning_tokens: 500 },
          },
        },
      }),
    '',
  ].join('\n\n');
  const { reports } = stubFetch({
    usage: async () => decision(),
    model: async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  const state = await runningConversation();
  expect(await (await state.request()).text()).toBe(body);
  await state.finish();
  expect(reports().at(-1)?.usage).toEqual({
    ...emptyUsage(),
    inputTokens: 10_000,
    cachedInputTokens: 6_000,
    cacheWriteInputTokens: 3_000,
    outputTokens: 2_000,
    reasoningTokens: 500,
  });
});

it('charges web search commands and refuses them as text once limited', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(decision({ status: 'limited', retryAt: expiresAt }));
  const { reports } = stubFetch({
    usage,
    model: async () => Response.json({ output: 'Results' }),
  });
  const state = await runningConversation();
  expect(await (await state.search(3)).json()).toEqual({ output: 'Results' });
  expect(budget(state.saved).unreported).toEqual({ ...emptyUsage(), webSearchCalls: 3 });
  vi.setSystemTime('2026-10-27T03:11:01Z');
  // A failed web request would end the turn, so a refusal is a result the agent can read.
  const refused = await state.search(1);
  expect(refused.status).toBe(200);
  expect(await refused.json()).toEqual({ output: expect.stringContaining('usage limit') });
  expect(reports()[1].usage).toEqual({ ...emptyUsage(), webSearchCalls: 3 });
  expect(budget(state.saved).unreported).toEqual(emptyUsage());
});

it('Stop aborts the running request and charges its estimate', async () => {
  const { conversation, saved, sandbox } = fixture();
  const { reports } = stubFetch({
    usage: async () => decision(),
    model: async ({ signal }) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            signal!.addEventListener('abort', () => controller.error(signal!.reason));
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
  await conversation.proxyModelRequest('{}', executionId);
  stop.abort();
  await sdk.completeResponse('initial');
  expect(vi.mocked(SandboxTurn).mock.results[0].value.stop).toHaveBeenCalledOnce();
  await vi.waitFor(() => {
    expect((saved.get('conversation') as { lifecycle: ConversationState }).lifecycle.status).toBe(
      'waiting_for_user',
    );
  });
  await vi.waitFor(() => expect(reports()).toHaveLength(2));
  expect(reports()[1].usage).toEqual({ ...emptyUsage(), inputTokens: 1, outputTokens: 16_000 });
  expect(reportError).not.toHaveBeenCalled();
});

it('stops at the hourly limit, and Resume after the reset clears it without continuing', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(decision({ status: 'limited', retryAt: expiresAt }))
    .mockImplementation(async () => decision());
  stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  // Past the decision window, the next request checks again and is limited.
  vi.setSystemTime('2026-10-27T03:11:01Z');
  expect((await state.request()).status).toBe(429);
  expect(vi.mocked(SandboxTurn).mock.results.at(-1)!.value.stop).toHaveBeenCalledOnce();
  await state.finish();
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  expect(restored.state).toMatchObject({
    status: 'blocked',
    reason: 'usage_limit',
    retryAt: expiresAt,
  });
  // New messages wait for the limit to be cleared.
  await restored.persistMessages([
    { id: 'early', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
  ]);
  await restored.onChatMessage(undefined, { requestId: 'early' });
  expect(await restored.resume()).toBe(false);
  vi.setSystemTime('2026-10-27T04:01:00Z');
  const turns = vi.mocked(SandboxTurn).mock.calls.length;
  expect(await restored.resume()).toBe(true);
  expect(vi.mocked(SandboxTurn).mock.calls).toHaveLength(turns);
  expect(restored.state.status).toBe('waiting_for_user');
  await restored.persistMessages([
    ...restored.messages,
    { id: 'continue', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
  ]);
  await restored.onChatMessage(undefined, { requestId: 'continue' });
  expect(vi.mocked(SandboxTurn).mock.calls).toHaveLength(turns + 1);
});

it('refuses a message while limited and sends it with the next message after Resume', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision({ status: 'limited', retryAt: expiresAt }))
    .mockImplementation(async () => decision());
  stubFetch({ usage });
  const { conversation, sandbox } = fixture();
  await conversation.onStart();
  await conversation.persistMessages([
    { id: 'first', role: 'user', parts: [{ type: 'text', text: 'Edit this question' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: 'first' });
  expect(SandboxTurn).not.toHaveBeenCalled();
  expect(sandbox.prepare).not.toHaveBeenCalled();
  expect(generateTitle).not.toHaveBeenCalled();
  expect(conversation.state).toMatchObject({
    status: 'blocked',
    reason: 'usage_limit',
    retryAt: expiresAt,
  });
  vi.setSystemTime('2026-10-27T04:01:00Z');
  expect(await conversation.resume()).toBe(true);
  await conversation.persistMessages([
    ...conversation.messages,
    { id: 'second', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: 'second' });
  const { input } = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(input.text).toBe('Edit this question\n\nContinue');
  expect(input.catchUp).toBeUndefined();
  expect(generateTitle).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Edit this question' }),
  );
});

it('saves a review result while limited and delivers it once Resume clears the limit', async () => {
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
    limitedUntil: expiresAt,
  } satisfies BudgetState);
  const { conversation } = fixture(saved);
  await conversation.onStart();
  expect(conversation.recordReviewResult('review', deniedResult)).toBe(true);
  // Delivery runs as a scheduled callback; while limited it starts no turn.
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
  await vi.waitFor(() => expect(SandboxTurn).toHaveBeenCalledOnce());
  const options = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(options.input.text).toContain('The instructor denied the submitted changes.');
  expect(budget(saved)).toMatchObject({ pending: null, limitedUntil: null });
});

it('runs a review delivery that races a new limit, and stops it at its first model request', async () => {
  freezeTime();
  stubFetch({ usage: async () => decision({ status: 'limited', retryAt: expiresAt }) });
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
    unreported: reportedUsage,
    pending: null,
    limitedUntil: null,
  } satisfies BudgetState);
  const { conversation, sandbox } = fixture(saved);
  await conversation.onStart();
  expect(conversation.recordReviewResult('review', deniedResult)).toBe(true);
  // The delivery claims the conversation, then a report comes back limited before the SDK calls
  // back with the continuation.
  const callback = Promise.withResolvers<undefined>();
  sdk.continuationCallback = () => callback.promise;
  await conversation.deliverWaitingResult();
  await conversation.flushUsage();
  expect(budget(saved).limitedUntil).toBe(expiresAt);
  callback.resolve(undefined);
  await vi.waitFor(() => expect(SandboxTurn).toHaveBeenCalledOnce());
  const options = vi.mocked(SandboxTurn).mock.calls[0][2];
  await options.prepare();
  options.onThread('native-thread');
  options.onReady();
  options.onAccepted('native-turn');
  const { executionId } = sandbox.authorizeModel.mock.calls.at(-1)![0];
  expect((await conversation.proxyModelRequest('{}', executionId)).status).toBe(429);
  await sdk.completeResponse('continuation');
  await vi.waitFor(() =>
    expect(conversation.state).toMatchObject({ status: 'blocked', reason: 'usage_limit' }),
  );
});

it('charges the estimate when final usage never arrives', async () => {
  stubFetch({
    usage: async () => decision(),
    model: async () =>
      new Response('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  });
  const state = await runningConversation();
  await state.request();
  expect(budget(state.saved)).toMatchObject({
    limitedUntil: null,
    unreported: { inputTokens: 1, outputTokens: 16_000 },
  });
  // A restarted object schedules the unsent usage to be reported.
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  expect(restored.schedule).toHaveBeenCalledWith(0, 'flushUsage', undefined, { idempotent: true });
});

it('refuses more provider requests than Codex runs at once', async () => {
  stubFetch({
    usage: async () => decision(),
    model: async () =>
      new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  const state = await runningConversation();
  for (let i = 0; i < 4; i++) expect((await state.startRequest()).status).toBe(200);
  expect((await state.startRequest()).status).toBe(429);
  expect(await (await state.search(1)).json()).toEqual({
    output: expect.stringContaining('Too many requests'),
  });
});

it('retries a rejected report without blocking, reporting the rejection once', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  vi.setSystemTime('2026-10-27T03:11:01Z');
  // A configuration fault such as a rotated token fails the request so Codex retries it.
  expect((await state.request()).status).toBe(503);
  expect((await state.request()).status).toBe(503);
  expect(reportError).toHaveBeenCalledOnce();
  expect(budget(state.saved).limitedUntil).toBeNull();
  // Once the fault is fixed, the same report is accepted and inference continues.
  expect((await state.request()).status).toBe(200);
  expect(
    new Set(
      reports()
        .slice(1)
        .map(({ reportId }) => reportId),
    ).size,
  ).toBe(1);
  await state.finish();
});

it('records a request that finishes after the decision that limited the turn', async () => {
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
  const flushed = state.conversation.flushUsage();
  // The next request starts while that flush is still waiting for PrairieLearn.
  expect((await state.request()).status).toBe(200);
  refresh.resolve(decision({ status: 'limited', retryAt: expiresAt }));
  await flushed;
  expect(budget(state.saved).limitedUntil).toBe(expiresAt);
  await state.finish();
  await vi.waitFor(() => expect(reports()).toHaveLength(3));
  expect(reports()[2].usage).toEqual(reportedUsage);
  expect(budget(state.saved)).toMatchObject({ unreported: emptyUsage(), limitedUntil: expiresAt });
});

it('reports usage recorded while a flush is in flight before the flush ends', async () => {
  const gate = Promise.withResolvers<Response>();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockReturnValueOnce(gate.promise)
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  const flushed = state.conversation.flushUsage();
  expect((await state.request()).status).toBe(200);
  await state.finish();
  gate.resolve(decision());
  await flushed;
  expect(reports().map((report) => report.usage)).toEqual([
    emptyUsage(),
    reportedUsage,
    reportedUsage,
  ]);
  expect(budget(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});

it('retries the turn-end report with backoff when PrairieLearn is unreachable', async () => {
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision())
    .mockRejectedValueOnce(new Error('PL unavailable'))
    .mockImplementation(async () => decision());
  const { reports } = stubFetch({ usage });
  const state = await runningConversation();
  expect((await state.request()).status).toBe(200);
  await state.finish();
  await vi.waitFor(() =>
    expect(state.conversation.schedule).toHaveBeenCalledWith(
      60,
      'flushUsage',
      { attempt: 1 },
      { idempotent: true },
    ),
  );
  await state.conversation.flushUsage({ attempt: 1 });
  expect(reports()[2]).toEqual(reports()[1]);
  expect(budget(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});
