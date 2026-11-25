import type { UIMessage } from 'ai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  type ConversationState,
  type CourseActionResult,
  type CourseDataReadResult,
  type RequestChangesResult,
  type UsageDecision,
  type UsageReport,
  emptyUsage,
} from '@prairielearn/course-agent-types';

import {
  CodexAppServerClient,
  type CourseActionTools,
  type CourseDataTools,
} from '../sandbox/codex.js';
import { SandboxTurn } from '../sandbox/turn.js';

import { Conversation, CourseContextSchema, type MeteringState } from './conversation.js';

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
      approvalMode: 'approval_required',
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

    saveMessages = vi.fn(async (update: (messages: UIMessage[]) => UIMessage[]) => {
      await this.persistMessages(update(this.messages));
      await this.onChatMessage(undefined, { requestId: 'saved' });
      return { status: 'completed' };
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
    writeCourseData: vi.fn(async (_dataset: string, contents: ReadableStream<Uint8Array>) => {
      // Rows are counted as the sandbox reads them.
      await new Response(contents).arrayBuffer();
      return '/workspace/session/course-data/students-1.jsonl';
    }),
    stopProcesses: vi.fn(),
    checkpoint: vi.fn(async () => ({ id: 'checkpoint' })),
    destroy: vi.fn(),
    authorizeModel: vi.fn(async (_config: { executionId: string }) => {}),
    captureReview: vi.fn(async () => ({
      type: 'github',
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit: 'a'.repeat(40),
      additions: [],
      deletions: [{ path: 'question.html' }],
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
  approve?: () => Promise<Response>;
  model?: (options: RequestInit) => Promise<Response>;
}) {
  const fetch = vi.fn(async (url: string | URL, options: RequestInit) => {
    if (String(url).endsWith('/usage')) return await handlers.usage();
    if (String(url).endsWith('/approve')) {
      return await (handlers.approve ?? (async () => new Response('{}')))();
    }
    return await (handlers.model ?? (async () => modelResponse()))(options);
  });
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
      const unreported = JSON.stringify(metering(state.saved)?.unreported ?? emptyUsage());
      const response = await conversation.proxyModelRequest('{}', executionId);
      if (!response.ok) return response;
      const text = await response.text();
      await vi.waitFor(() => {
        if (JSON.stringify(metering(state.saved).unreported) === unreported) {
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

function metering(saved: Map<string, unknown>) {
  return saved.get('metering') as MeteringState;
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
  expect(metering(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});

it.each([
  { failure: 'network error', response: () => Promise.reject(new Error('PL unavailable')) },
  { failure: '5xx response', response: async () => new Response('Down', { status: 503 }) },
  // A configuration fault such as a rotated token, which recovers once it is fixed.
  { failure: 'rejection', response: async () => new Response('Unauthorized', { status: 401 }) },
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
  expect(metering(state.saved)).toMatchObject({ pending: null, limitedUntil: null });
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
  expect(metering(state.saved).unreported).toEqual({ ...emptyUsage(), webSearchCalls: 3 });
  vi.setSystemTime('2026-10-27T03:11:01Z');
  // A failed web request would end the turn, so a refusal is a result the agent can read.
  const refused = await state.search(1);
  expect(refused.status).toBe(200);
  expect(await refused.json()).toEqual({ output: expect.stringContaining('usage limit') });
  expect(reports()[1].usage).toEqual({ ...emptyUsage(), webSearchCalls: 3 });
  expect(metering(state.saved).unreported).toEqual(emptyUsage());
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

it('refuses messages while limited, and Resume after the reset sends them', async () => {
  freezeTime();
  const usage = vi
    .fn()
    .mockResolvedValueOnce(decision({ status: 'limited', retryAt: expiresAt }))
    .mockImplementation(async () => decision());
  stubFetch({ usage });
  const { conversation, sandbox } = fixture();
  await conversation.onStart();
  for (const [id, text] of [
    ['first', 'Edit this question'],
    ['second', 'Use SI units'],
  ]) {
    await conversation.persistMessages([
      ...conversation.messages,
      { id, role: 'user', parts: [{ type: 'text', text }] },
    ]);
    await conversation.onChatMessage(undefined, { requestId: id });
  }
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
  await vi.waitFor(() => expect(SandboxTurn).toHaveBeenCalledOnce());
  const { input } = vi.mocked(SandboxTurn).mock.calls[0][2];
  expect(input.text).toBe('Edit this question\n\nUse SI units');
  expect(input.catchUp).toBeUndefined();
  expect(generateTitle).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Edit this question' }),
  );
});

it('marks reviews for automatic approval from the latest message that chose a mode', async () => {
  stubFetch({ usage: async () => decision() });
  vi.spyOn(CodexAppServerClient.prototype, 'streaming', 'get').mockReturnValue(true);
  const emit = vi.spyOn(CodexAppServerClient.prototype, 'emit').mockImplementation(() => {});
  const startTurn = async (conversation: Conversation, metadata?: Record<string, unknown>) => {
    await conversation.persistMessages([
      ...conversation.messages,
      { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Edit' }], metadata },
    ]);
    const requestId = crypto.randomUUID();
    await conversation.onChatMessage(undefined, { requestId });
    const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
    await options.prepare();
    options.onReady();
    return { options, requestId };
  };
  const submitReview = async (options: ConstructorParameters<typeof SandboxTurn>[2]) => {
    const reply = await options.onReview!({
      threadId: 'native-thread',
      turnId: 'native-turn',
      callId: 'call',
      namespace: null,
      tool: 'request_changes',
      arguments: {},
    });
    const part = emit.mock.calls.map(([chunk]) => chunk).find((c) => c.type === 'data-review');
    return { reply, part };
  };

  const required = fixture().conversation;
  await required.onStart();
  // A conversation that has not been given a mode asks.
  expect(required.state.approvalMode).toBe('approval_required');
  const unmarked = await submitReview((await startTurn(required)).options);
  expect(unmarked.part).toMatchObject({ data: { reviewId: expect.any(String) } });
  expect(unmarked.part).not.toHaveProperty('data.autoApprove');
  expect(unmarked.reply.text).toContain('for instructor review');

  emit.mockClear();
  const always = fixture().conversation;
  await always.onStart();
  const first = await startTurn(always, { approvalMode: 'always_approve' });
  sdk.finishTurn();
  await sdk.completeResponse(first.requestId);
  await vi.waitFor(() => expect(always.state.status).toBe('waiting_for_user'));
  // A message that carries no mode, such as one from an older page, keeps the last choice.
  const marked = await submitReview((await startTurn(always, {})).options);
  expect(marked.part).toHaveProperty('data.autoApprove', true);
  expect(marked.reply.text).toContain('they are being saved now');
  const reviewId = always.state.reviewId!;
  expect(always.schedule).toHaveBeenCalledWith(0, 'approveReview', { reviewId, attempt: 0 });

  // The instructor can also change the mode between messages.
  emit.mockClear();
  const switched = fixture().conversation;
  await switched.onStart();
  const turn = await startTurn(switched);
  switched.setApprovalMode('always_approve');
  expect(switched.state.approvalMode).toBe('always_approve');
  expect((await submitReview(turn.options)).part).toHaveProperty('data.autoApprove', true);
});

it('holds a requested course action in the review slot and delivers its result', async () => {
  const fetch = vi.fn(async (url: string | URL, _options?: RequestInit) => {
    if (String(url).endsWith('/usage')) return decision();
    if (String(url).includes('/course_agent/actions/')) {
      return Response.json({ title: 'Close 2 issues' });
    }
    return modelResponse();
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(CodexAppServerClient.prototype, 'streaming', 'get').mockReturnValue(true);
  const emit = vi.spyOn(CodexAppServerClient.prototype, 'emit').mockImplementation(() => {});
  const { saved } = fixture();
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    courseContext: { courseId: '7', courseTitle: 'Test course', courseShortName: 'TEST 101' },
  });
  const { conversation } = fixture(saved);
  await conversation.onStart();
  await conversation.persistMessages([
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Close them' }] },
  ]);
  const requestId = crypto.randomUUID();
  await conversation.onChatMessage(undefined, { requestId });
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  await options.prepare();
  options.onReady();

  // The Codex client is given the handlers when the turn starts.
  const { courseActions } = (
    conversation as unknown as { native: { courseActions: CourseActionTools } }
  ).native;
  const request = { action: 'issues_close', input: { issue_ids: ['3', '4'] } };
  const reply = await courseActions.requestCourseAction(request);
  expect(reply).toMatchObject({ success: true });
  expect(reply.text).toContain('Requested: Close 2 issues.');
  const [url, init] = fetch.mock.calls.find(([called]) => String(called).includes('/actions/'))!;
  expect(String(url)).toBe('https://pl.test/pl/course/7/course_agent/actions/issues_close');
  const body = JSON.parse(init!.body as string) as { id: string; input: unknown };
  expect(body).toEqual({ id: expect.any(String), input: request.input });
  const part = emit.mock.calls.map(([chunk]) => chunk).find((c) => c.type === 'data-action');
  expect(part).toMatchObject({ data: { actionId: body.id } });
  expect(part).not.toHaveProperty('data.autoApprove');
  // The request waits where a file review would, so a second one is refused, and PrairieLearn,
  // which holds the request itself, is given no snapshot.
  expect(conversation.state.reviewId).toBe(body.id);
  expect(await courseActions.requestCourseAction(request)).toMatchObject({ success: false });
  expect(conversation.getReview(body.id)).toBeNull();

  sdk.finishTurn();
  await sdk.completeResponse(requestId);
  await vi.waitFor(() => expect(conversation.state.status).toBe('waiting_for_user'));
  const result = {
    decision: 'approved',
    action: { name: 'issues_close', title: 'Close 2 issues' },
    outcome: { status: 'succeeded', summary: 'Closed 2 issues.' },
  } satisfies CourseActionResult;
  expect(conversation.recordReviewResult(body.id, result)).toBe(true);
  // A repeat is acknowledged; a different result for the same request is refused.
  expect(conversation.recordReviewResult(body.id, result)).toBe(true);
  expect(
    conversation.recordReviewResult(body.id, {
      ...result,
      outcome: { status: 'failed', error: 'x' },
    }),
  ).toBe(false);
  await conversation.deliverWaitingResult();
  await vi.waitFor(() => expect(SandboxTurn).toHaveBeenCalledTimes(2));
  const delivery = vi.mocked(SandboxTurn).mock.calls[1][2].input;
  expect(delivery.tag).toBe(`review:${body.id}`);
  expect(delivery.text).toContain('approved the requested action "Close 2 issues"');
  expect(delivery.text).toContain('Closed 2 issues.');
});

it('asks PrairieLearn to approve a course action requested under "Always approve"', async () => {
  stubFetch({
    usage: async () => decision(),
    model: async () => Response.json({ title: 'Close 2 issues' }),
  });
  vi.spyOn(CodexAppServerClient.prototype, 'streaming', 'get').mockReturnValue(true);
  const emit = vi.spyOn(CodexAppServerClient.prototype, 'emit').mockImplementation(() => {});
  const { saved } = fixture();
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    courseContext: { courseId: '7', courseTitle: 'Test course', courseShortName: 'TEST 101' },
  });
  const { conversation } = fixture(saved);
  await conversation.onStart();
  conversation.setApprovalMode('always_approve');
  await conversation.persistMessages([
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Close them' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: crypto.randomUUID() });
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  await options.prepare();
  options.onReady();
  const { courseActions } = (
    conversation as unknown as { native: { courseActions: CourseActionTools } }
  ).native;
  const reply = await courseActions.requestCourseAction({
    action: 'issues_close',
    input: { issue_ids: ['3'] },
  });
  expect(reply).toMatchObject({ success: true });
  const reviewId = conversation.state.reviewId!;
  const part = emit.mock.calls.map(([chunk]) => chunk).find((c) => c.type === 'data-action');
  expect(part).toHaveProperty('data.autoApprove', true);
  expect(conversation.schedule).toHaveBeenCalledWith(0, 'approveReview', { reviewId, attempt: 0 });
});

it('asks PrairieLearn to approve, retrying only while it is unreachable', async () => {
  const approvals: number[] = [];
  const { fetch } = stubFetch({
    usage: async () => decision(),
    approve: async () => new Response(null, { status: approvals.shift() ?? 200 }),
  });
  vi.spyOn(CodexAppServerClient.prototype, 'streaming', 'get').mockReturnValue(true);
  vi.spyOn(CodexAppServerClient.prototype, 'emit').mockImplementation(() => {});
  const { conversation } = await runningConversation();
  await vi.mocked(SandboxTurn).mock.calls.at(-1)![2].onReview!({
    threadId: 'native-thread',
    turnId: 'native-turn',
    callId: 'call',
    namespace: null,
    tool: 'request_changes',
    arguments: {},
  });
  const reviewId = conversation.state.reviewId!;
  const approve = async (attempt: number, status: number) => {
    approvals.push(status);
    vi.mocked(conversation.schedule).mockClear();
    await conversation.approveReview({ reviewId, attempt });
  };

  await approve(0, 503);
  expect(fetch).toHaveBeenLastCalledWith(
    new URL(
      `https://pl.test/pl/api/course-agent/conversations/test-conversation/reviews/${reviewId}/approve`,
    ),
    expect.objectContaining({ method: 'POST' }),
  );
  expect(conversation.schedule).toHaveBeenCalledWith(15, 'approveReview', { reviewId, attempt: 1 });
  // PrairieLearn refused, for example because the instructor can no longer edit the course.
  await approve(1, 403);
  expect(conversation.schedule).not.toHaveBeenCalled();
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
  saved.set('metering', {
    unreported: emptyUsage(),
    pending: null,
    limitedUntil: expiresAt,
  } satisfies MeteringState);
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
  expect(metering(saved)).toMatchObject({ pending: null, limitedUntil: null });
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
  saved.set('metering', {
    unreported: reportedUsage,
    pending: null,
    limitedUntil: null,
  } satisfies MeteringState);
  const { conversation, sandbox } = fixture(saved);
  await conversation.onStart();
  expect(conversation.recordReviewResult('review', deniedResult)).toBe(true);
  // The delivery claims the conversation, then a report comes back limited before the SDK calls
  // back with the continuation.
  const callback = Promise.withResolvers<undefined>();
  sdk.continuationCallback = () => callback.promise;
  await conversation.deliverWaitingResult();
  await conversation.flushUsage();
  expect(metering(saved).limitedUntil).toBe(expiresAt);
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
  expect(metering(state.saved)).toMatchObject({
    limitedUntil: null,
    unreported: { inputTokens: 1, outputTokens: 16_000 },
  });
  // A restarted object schedules the unsent usage to be reported.
  const restored = fixture(state.saved).conversation;
  await restored.onStart();
  expect(restored.schedule).toHaveBeenCalledWith(0, 'flushUsage', undefined, { idempotent: true });
});

it('reports usage recorded while a flush is in flight, even once that flush limits the turn', async () => {
  freezeTime();
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
  gate.resolve(decision({ status: 'limited', retryAt: expiresAt }));
  await flushed;
  await state.finish();
  await vi.waitFor(() => expect(reports()).toHaveLength(3));
  expect(reports().map((report) => report.usage)).toEqual([
    emptyUsage(),
    reportedUsage,
    reportedUsage,
  ]);
  expect(metering(state.saved)).toMatchObject({
    pending: null,
    unreported: emptyUsage(),
    limitedUntil: expiresAt,
  });
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
  expect(metering(state.saved)).toMatchObject({ pending: null, unreported: emptyUsage() });
});

it('keeps the course context when its timezone is not a zone name', () => {
  const course = { courseTitle: 'Calculus', courseShortName: 'MATH 101' };
  expect(CourseContextSchema.parse({ ...course, timezone: 'America/Chicago' })).toEqual({
    ...course,
    timezone: 'America/Chicago',
  });
  expect(CourseContextSchema.parse({ ...course, timezone: '../../etc/passwd' })).toEqual(course);
});

it('asks the instructor before reading course data, then reads once it is approved', async () => {
  const schema = {
    version: 1,
    datasets: {
      students: {
        label: 'students',
        icon: 'people',
        description: 'Students in each course instance.',
        schema: { properties: { uid: { type: 'string' }, status: { type: 'string' } } },
      },
    },
  };
  let failNextDownload = false;
  const fetch = vi.fn(async (url: string | URL, options?: RequestInit) => {
    if (String(url).endsWith('/usage')) return decision();
    if (String(url).endsWith('/course_agent/data')) return Response.json(schema);
    if (String(url).endsWith('/course_agent/data/students') && options?.method === 'POST') {
      if (failNextDownload) {
        failNextDownload = false;
        return Response.json({ message: 'The query timed out.' }, { status: 500 });
      }
      return new Response('{"uid":"a@example.com","status":"joined"}\n');
    }
    return modelResponse();
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(CodexAppServerClient.prototype, 'streaming', 'get').mockReturnValue(true);
  const emit = vi.spyOn(CodexAppServerClient.prototype, 'emit').mockImplementation(() => {});
  const { saved } = fixture();
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    courseContext: { courseId: '7', courseTitle: 'Test course', courseShortName: 'TEST 101' },
  });
  const { conversation } = fixture(saved);
  await conversation.onStart();
  await conversation.persistMessages([
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Who is enrolled?' }] },
  ]);
  const requestId = crypto.randomUUID();
  await conversation.onChatMessage(undefined, { requestId });
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  await options.prepare();
  options.onReady();
  const downloads = () =>
    fetch.mock.calls.filter(([url]) => String(url).endsWith('/course_agent/data/students')).length;

  // The Codex client is given the handlers when the turn starts.
  const { courseData } = (conversation as unknown as { native: { courseData: CourseDataTools } })
    .native;
  const request = {
    dataset: 'students',
    select: ['uid', 'status'],
    filters: [{ column: 'status', op: 'eq' as const, value: 'joined' }],
  };
  expect(await courseData.getCourseData({ ...request, select: ['nope'] })).toMatchObject({
    success: false,
    text: expect.stringContaining('no column named nope'),
  });
  const asked = await courseData.getCourseData(request);
  expect(asked).toMatchObject({ success: true });
  expect(asked.text).toContain('nothing was downloaded yet');
  expect(downloads()).toBe(0);
  const part = emit.mock.calls.map(([chunk]) => chunk).find((c) => c.type === 'data-review');
  const reviewId = conversation.state.reviewId!;
  expect(part).toMatchObject({ data: { reviewId } });
  // The card names the dataset and the rows in plain words, and no columns.
  const card = { icon: 'people', title: 'View students', subtitle: 'Where status is joined' };
  expect(conversation.getReview(reviewId)).toEqual({
    id: reviewId,
    snapshot: { type: 'local', additions: [], deletions: [] },
    dataRead: card,
  });
  // Only one request waits at a time.
  expect(await courseData.getCourseData(request)).toMatchObject({ success: false });

  sdk.finishTurn();
  await sdk.completeResponse(requestId);
  await vi.waitFor(() => expect(conversation.state.status).toBe('waiting_for_user'));
  // A file review's result cannot answer a data read.
  expect(
    conversation.recordReviewResult(reviewId, {
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    }),
  ).toBe(false);
  const result = { decision: 'approved', dataRead: card } satisfies CourseDataReadResult;
  expect(conversation.recordReviewResult(reviewId, result)).toBe(true);
  await conversation.deliverWaitingResult();
  await vi.waitFor(() => expect(SandboxTurn).toHaveBeenCalledTimes(2));
  const delivery = vi.mocked(SandboxTurn).mock.calls[1][2];
  expect(delivery.input.text).toContain('approved the request "View students"');
  expect(delivery.input.text).toContain(JSON.stringify(request));
  await delivery.prepare();
  delivery.onReady();
  // Codex accepting the delivery is what frees the review slot.
  delivery.onAccepted('native-turn');

  // A read that fails keeps its approval, so the agent can try again without asking again.
  failNextDownload = true;
  expect(await courseData.getCourseData(request)).toMatchObject({ success: false });
  // The approval covers that read once, whatever order the columns are named in.
  const read = await courseData.getCourseData({ ...request, select: ['status', 'uid'] });
  expect(read).toMatchObject({ success: true, text: expect.stringContaining('Wrote 1 rows') });
  expect(downloads()).toBe(2);
  expect((await courseData.getCourseData(request)).text).toContain('nothing was downloaded yet');
  expect(downloads()).toBe(2);
});

it('reads course data without asking when the instructor chose to always approve', async () => {
  const fetch = vi.fn(async (url: string | URL) => {
    if (String(url).endsWith('/usage')) return decision();
    if (String(url).endsWith('/course_agent/data/students')) return new Response('{"uid":"a"}\n');
    return modelResponse();
  });
  vi.stubGlobal('fetch', fetch);
  const { saved } = fixture();
  saved.set('conversation', {
    ...(saved.get('conversation') as object),
    approvalMode: 'always_approve',
    courseContext: { courseId: '7', courseTitle: 'Test course', courseShortName: 'TEST 101' },
  });
  const { conversation } = fixture(saved);
  await conversation.onStart();
  await conversation.persistMessages([
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Who is enrolled?' }] },
  ]);
  await conversation.onChatMessage(undefined, { requestId: crypto.randomUUID() });
  const options = vi.mocked(SandboxTurn).mock.calls.at(-1)![2];
  await options.prepare();
  options.onReady();
  const { courseData } = (conversation as unknown as { native: { courseData: CourseDataTools } })
    .native;
  expect(await courseData.getCourseData({ dataset: 'students', select: ['uid'] })).toMatchObject({
    success: true,
    text: expect.stringContaining('Wrote 1 rows'),
  });
  expect(conversation.state.reviewId).toBeNull();
});
