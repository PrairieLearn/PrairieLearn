import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { Connection, ConnectionContext } from 'agents';
import {
  type UIMessageChunk,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';
import { z } from 'zod';

import { buildInstructions } from './instructions.js';

const CourseContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});

type ConversationState =
  | { model?: never; courseContext: null }
  | {
      model: string;
      /** The model is pinned at creation; course context arrives on first connect. */
      courseContext: z.infer<typeof CourseContextSchema> | null;
    };

/** The SDK owns message persistence, streaming, reconnect replay, and Stop. */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { courseContext: null };

  override onStart() {
    this.getModel();
  }

  private getModel(): string {
    if (this.state.model) return this.state.model;
    const model = this.env.OPENAI_MODEL;
    this.setState({ ...this.state, model });
    return model;
  }

  override async onConnect(connection: Connection, context: ConnectionContext) {
    // PL supplies this header after checking the session, course, and owner.
    const courseContext = CourseContextSchema.parse(
      JSON.parse(decodeURIComponent(context.request.headers.get('X-PL-Course-Context') ?? 'null')),
    );
    this.setState({ model: this.getModel(), courseContext });
    // Load history on the same connection as resume, so an earlier HTTP snapshot
    // cannot race the SDK's startup recovery. Use the SDK's transcript message.
    connection.send(
      JSON.stringify({
        type: MessageType.CF_AGENT_CHAT_MESSAGES,
        messages: await this.sessions.session().getHistory(),
      }),
    );
  }

  override validateStateChange(_state: ConversationState, source: Connection | 'server') {
    // Browser protocol messages cannot change the pinned model or PL context.
    if (source !== 'server') throw new Error('Conversation state is managed by PrairieLearn');
  }

  protected override async onChatRecovery() {
    // Keep recoverable partial output, without rerunning an interrupted prompt.
    return { continue: false };
  }

  protected async createReply(
    signal: AbortSignal | undefined,
    messageId: string,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const result = streamText({
      model: createOpenAI({ apiKey: this.env.OPENAI_API_KEY })(this.getModel()),
      instructions: buildInstructions(this.state.courseContext ?? undefined),
      messages: await convertToModelMessages(this.messages),
      abortSignal: signal,
    });
    return toUIMessageStream({
      stream: result.stream,
      originalMessages: this.messages,
      generateMessageId: () => messageId,
    });
  }

  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    return createUIMessageStreamResponse({
      stream: await this.createReply(options?.abortSignal, crypto.randomUUID()),
    });
  }
}
