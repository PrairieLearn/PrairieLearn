import { type UIMessage, type UIMessageChunk, streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../env.js';
import type { ChatContext } from '../http/chat-request.js';

import { Conversation } from './conversation.js';

interface State {
  courseContext: ChatContext | null;
}
const storage = vi.hoisted(() => ({
  state: undefined as State | undefined,
  savedReplies: [] as string[],
}));

const generateReply = vi.hoisted(() =>
  vi.fn<(options: { abortSignal?: AbortSignal }) => { stream: ReadableStream<UIMessageChunk> }>(),
);

vi.mock('@cloudflare/ai-chat', () => ({
  AIChatAgent: class {
    initialState: State = { courseContext: null };
    messages: UIMessage[] = [];
    constructor(
      _ctx: DurableObjectState,
      readonly env: Env,
    ) {}

    get state() {
      return storage.state ?? this.initialState;
    }

    setState(state: State) {
      storage.state = structuredClone(state);
    }

    async saveMessages(
      update: (messages: UIMessage[]) => UIMessage[],
      options: { signal: AbortSignal },
    ) {
      this.messages = update(this.messages);
      const response = await this.onChatMessage(() => {}, { abortSignal: options.signal });
      storage.savedReplies.push(await response.text());
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
  // The mocked SDK supplies storage; no Cloudflare runtime is used in this unit test.
  return new Conversation({} as DurableObjectState, env);
}

function chat(id: string, courseContext?: ChatContext) {
  return new Request('https://agent.test/conversations/test/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: { id, role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      context: courseContext,
    }),
  });
}

beforeEach(() => {
  storage.state = undefined;
  storage.savedReplies = [];
  vi.restoreAllMocks();
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
  it('retains accepted context for a fresh instance without a waiting HTTP request', async () => {
    const first = createConversation();
    const response = await first.onRequest(chat('message-1', context));
    expect(response.status).toBe(200);
    await response.text();

    const recovered = createConversation();
    await (await recovered.onChatMessage(() => {})).text();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('CS 101: Intro to Programming'),
      }),
    );
  });

  it('reuses context when omitted and refreshes it when supplied', async () => {
    await (await createConversation().onRequest(chat('message-1', context))).text();
    await (await createConversation().onRequest(chat('message-2'))).text();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('CS 101: Intro to Programming'),
      }),
    );

    await (
      await createConversation().onRequest(
        chat('message-3', { ...context, courseTitle: 'Renamed' }),
      )
    ).text();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({ instructions: expect.stringContaining('CS 101: Renamed') }),
    );
  });

  it('rejects older duplicate IDs without changing context or starting another turn', async () => {
    const conversation = createConversation();
    for (let i = 0; i < 3; i++) {
      await (await conversation.onRequest(chat(`message-${i}`, context))).text();
    }
    const duplicate = await conversation.onRequest(
      chat('message-0', { ...context, courseTitle: 'Wrong' }),
    );
    expect(duplicate.status).toBe(409);
    expect(storage.state).toEqual({ courseContext: context });
    expect(streamText).toHaveBeenCalledTimes(3);
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
        },
      }),
    }));
    const conversation = createConversation();
    const response = await conversation.onRequest(chat('message-1'));
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"type":"start"');
    expect(storage.savedReplies).toEqual([]);
    expect((await conversation.onRequest(chat('message-2'))).status).toBe(409);

    const controller = await source.promise;
    controller.enqueue({ type: 'finish' });
    controller.close();
    let httpReply = new TextDecoder().decode(first.value);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      httpReply += new TextDecoder().decode(value);
    }
    await vi.waitFor(() => expect(storage.savedReplies).toEqual([httpReply]));
  });

  it('returns 502 if the SDK finishes without supplying a reply', async () => {
    const conversation = createConversation();
    vi.spyOn(conversation, 'onChatMessage').mockResolvedValueOnce(new Response());
    expect((await conversation.onRequest(chat('message-1'))).status).toBe(502);
  });

  it.each([new Error('provider unavailable'), 'provider unavailable'])(
    'returns 502 for a failure before the reply starts: %s',
    async (reason) => {
      const conversation = createConversation();
      vi.spyOn(conversation, 'saveMessages').mockRejectedValueOnce(reason);
      const response = await conversation.onRequest(chat('message-1'));
      expect(response.status).toBe(502);
      expect(await response.text()).toBe('The agent could not start a reply');
      await (await conversation.onRequest(chat('message-2'))).text();
    },
  );

  it('aborts on response cancellation while letting the SDK save the partial reply', async () => {
    generateReply.mockImplementationOnce((options) => ({
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          options.abortSignal!.addEventListener('abort', () => controller.close());
        },
      }),
    }));
    const conversation = createConversation();
    const response = await conversation.onRequest(chat('message-1'));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel('Stop');
    await vi.waitFor(() => expect(generateReply.mock.lastCall![0].abortSignal!.aborted).toBe(true));
    await vi.waitFor(() => expect(storage.savedReplies).toHaveLength(1));
    expect(storage.savedReplies[0]).toContain('"type":"start"');
  });
});
