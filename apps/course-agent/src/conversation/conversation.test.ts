import { type UIMessage, type UIMessageChunk, streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../env.js';
import type { ChatContext } from '../http/chat-request.js';

import { Conversation } from './conversation.js';

interface State {
  courseContext: ChatContext | null;
}
const storage = vi.hoisted(() => ({ state: undefined as State | undefined }));

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

    async saveMessages(update: (messages: UIMessage[]) => UIMessage[]) {
      this.messages = update(this.messages);
      const response = await this.onChatMessage(() => {});
      await response?.text();
    }

    async onChatMessage(_onFinish: () => void): Promise<Response | undefined> {
      return undefined;
    }
  },
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => () => 'test-model' }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  streamText: vi.fn(() => ({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'finish' });
        controller.close();
      },
    }),
  })),
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
  vi.clearAllMocks();
});

describe('conversation prompt context', () => {
  it('retains accepted context for a fresh instance without an HTTP reply bridge', async () => {
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
