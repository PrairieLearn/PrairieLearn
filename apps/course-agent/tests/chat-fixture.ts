import type { OnChatMessageOptions } from '@cloudflare/ai-chat';
import {
  type UIMessage,
  isToolUIPart,
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
} from 'ai';
import { vi } from 'vitest';

import type { ConversationState } from '@prairielearn/course-agent-types';

import type { Conversation } from '../src/conversation/conversation.js';

// The Workers SDK owns storage and response consumption; exercise our real streams through it.
export class AIChatAgent {
  readonly name = '00000000-0000-4000-8000-000000000001';
  messages: UIMessage[];
  state: ConversationState = { status: 'offline', deadlineAt: null };
  deadline!: Parameters<Conversation['onDeadline']>[0];

  readonly background: Promise<void>[] = [];

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    this.messages = ctx.storage.kv.get<UIMessage[]>('messages') ?? [];
  }

  setState(state: ConversationState) {
    this.state = state;
  }

  schedule = vi.fn(async (_when: unknown, method: string, payload: unknown) => {
    if (method === 'onDeadline') this.deadline = payload as typeof this.deadline;
  });

  stash = vi.fn();

  async persistMessages(messages: UIMessage[]) {
    this.messages = structuredClone(messages);
    this.ctx.storage.kv.put('messages', this.messages);
  }

  async keepAliveWhile(fn: () => Promise<void>) {
    const work = fn();
    this.background.push(work);
    await work;
  }

  continueLastTurn = vi.fn(async () => {
    await this.respond({ requestId: crypto.randomUUID(), continuation: true });
    return { status: 'completed' };
  });

  async respond(options: OnChatMessageOptions) {
    const response = await this.onChatMessage(undefined, options);
    const parsed = parseJsonEventStream({ stream: response.body!, schema: uiMessageChunkSchema });
    const stream = parsed.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (!chunk.success) throw chunk.error;
          controller.enqueue(chunk.value);
        },
      }),
    );
    const previous = this.messages.at(-1);
    for await (const message of readUIMessageStream({
      stream,
      message: previous?.role === 'assistant' ? previous : undefined,
      terminateOnError: true,
    })) {
      await this.persistMessages([
        ...this.messages.filter((saved) => saved.id !== message.id),
        message,
      ]);
    }
    await this.onChatResponse({ requestId: options.requestId });
  }

  async onChatResponse(_result: { requestId: string }) {}

  async onChatMessage(_finish: unknown, _options: OnChatMessageOptions): Promise<Response> {
    throw new Error('Conversation supplies this hook');
  }

  get outcome() {
    return this.messages
      .flatMap((message) => message.parts)
      .find((part) => isToolUIPart(part) && part.state === 'output-available');
  }
}
