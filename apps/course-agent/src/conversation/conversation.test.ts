import { type UIMessage, type UIMessageChunk, streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatContext } from '../http/chat-request.js';

import { Conversation } from './conversation.js';

interface State {
  courseContext: ChatContext | null;
}
const historyConsumer = vi.hoisted(() => ({ replies: [] as string[] }));

const generateReply = vi.hoisted(() =>
  vi.fn<(options: { abortSignal?: AbortSignal }) => { stream: ReadableStream<UIMessageChunk> }>(),
);

vi.mock('@cloudflare/ai-chat', () => ({
  AIChatAgent: class {
    initialState: State = { courseContext: null };
    messages: UIMessage[] = [];
    private savedState?: State;
    constructor(
      _ctx: DurableObjectState,
      readonly env: Env,
    ) {}

    get state() {
      return this.savedState ?? this.initialState;
    }

    setState(state: State) {
      this.savedState = state;
    }

    async saveMessages(
      update: (messages: UIMessage[]) => UIMessage[],
      options: { signal: AbortSignal },
    ) {
      this.messages = update(this.messages);
      const response = await this.onChatMessage(() => {}, { abortSignal: options.signal });
      historyConsumer.replies.push(await response.text());
    }

    async onChatMessage(
      _onFinish: () => void,
      _options?: { abortSignal: AbortSignal },
    ): Promise<Response> {
      throw new Error('The conversation must implement onChatMessage');
    }
  },
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => () => 'test-model' }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  streamText: generateReply,
  toUIMessageStream: ({ stream }: { stream: ReadableStream<UIMessageChunk> }) => stream,
}));

const context = { courseTitle: 'Intro to Programming', courseShortName: 'CS 101' };
const env = {
  OPENAI_API_KEY: 'test',
  OPENAI_MODEL: 'test-model',
  PL_SERVICE_TOKEN: 'test',
} as Env;

function createConversation() {
  // The mocked SDK consumes the history stream; no Cloudflare runtime is used here.
  return new Conversation({} as DurableObjectState, env);
}

function chat(courseContext?: ChatContext) {
  return new Request('https://agent.test/conversations/test/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      context: courseContext,
    }),
  });
}

beforeEach(() => {
  historyConsumer.replies = [];
  vi.clearAllMocks();
  generateReply.mockReset().mockImplementation(() => ({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'finish' });
        controller.close();
      },
    }),
  }));
});

describe('conversation prompt context', () => {
  it('reuses context when omitted and refreshes it when supplied', async () => {
    const conversation = createConversation();
    await (await conversation.onRequest(chat(context))).text();
    await (await conversation.onRequest(chat())).text();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('CS 101: Intro to Programming'),
      }),
    );

    await (await conversation.onRequest(chat({ ...context, courseTitle: 'Renamed' }))).text();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({ instructions: expect.stringContaining('CS 101: Renamed') }),
    );
  });
});

describe('HTTP reply handoff', () => {
  it('streams to HTTP before generation finishes and gives the SDK the same reply', async () => {
    const source = Promise.withResolvers<ReadableStreamDefaultController<UIMessageChunk>>();
    generateReply.mockImplementationOnce(() => ({
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          source.resolve(controller);
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'text-start', id: 'text' });
          controller.enqueue({ type: 'text-delta', id: 'text', delta: 'Hello' });
        },
      }),
    }));
    const conversation = createConversation();
    const response = await conversation.onRequest(chat());
    const reader = response.body!.getReader();
    let httpReply = '';
    while (!httpReply.includes('Hello')) {
      const { done, value } = await reader.read();
      expect(done).toBe(false);
      httpReply += new TextDecoder().decode(value);
    }
    expect(historyConsumer.replies).toEqual([]);
    expect((await conversation.onRequest(chat())).status).toBe(409);

    const controller = await source.promise;
    controller.enqueue({ type: 'text-end', id: 'text' });
    controller.enqueue({ type: 'finish' });
    controller.close();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      httpReply += new TextDecoder().decode(value);
    }
    await vi.waitFor(() => expect(historyConsumer.replies).toEqual([httpReply]));
  });

  it('returns 502 when generation fails to start and allows another request', async () => {
    generateReply.mockImplementationOnce(() => {
      throw new Error('provider unavailable');
    });
    const conversation = createConversation();
    const response = await conversation.onRequest(chat());
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('The agent could not start a reply');
    const next = await conversation.onRequest(chat());
    expect(next.status).toBe(200);
    await next.text();
  });

  it('aborts on response cancellation while the history consumer receives the partial reply', async () => {
    generateReply.mockImplementationOnce((options) => ({
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'text-start', id: 'text' });
          controller.enqueue({ type: 'text-delta', id: 'text', delta: 'Partial reply' });
          options.abortSignal!.addEventListener('abort', () => controller.close());
        },
      }),
    }));
    const conversation = createConversation();
    const response = await conversation.onRequest(chat());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel('Stop');
    await vi.waitFor(() => expect(generateReply.mock.lastCall![0].abortSignal!.aborted).toBe(true));
    await vi.waitFor(() => expect(historyConsumer.replies).toHaveLength(1));
    expect(historyConsumer.replies[0]).toContain('Partial reply');
  });
});
