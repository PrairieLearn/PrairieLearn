import { type ChatTransport, DefaultChatTransport, type UIMessageChunk } from 'ai';

import type { CourseAgentMessage } from '../lib/course-agent/ui-stream.js';

export interface CourseAgentRun {
  conversationId: string;
  sandboxId: string;
  runId: string;
}

export class CourseAgentTransport extends DefaultChatTransport<CourseAgentMessage> {
  private run: CourseAgentRun | null = null;

  constructor(
    private readonly startRun: (input: {
      conversationId?: string;
      prompt: string;
    }) => Promise<CourseAgentRun>,
    courseId: string,
    private readonly onRun: (run: CourseAgentRun | null) => void,
    initialRun: CourseAgentRun | null = null,
  ) {
    super({
      prepareReconnectToStreamRequest: () => ({
        api: `/pl/course/${courseId}/course_agent/stream?${new URLSearchParams({
          conversationId: this.run!.conversationId,
          sandboxId: this.run!.sandboxId,
          runId: this.run!.runId,
        })}`,
      }),
    });
    this.run = initialRun;
  }

  override async sendMessages(
    options: Parameters<ChatTransport<CourseAgentMessage>['sendMessages']>[0],
  ) {
    const message = options.messages.at(-1);
    if (options.trigger !== 'submit-message' || message?.role !== 'user') {
      throw new Error('Send a new message to the course agent.');
    }
    const conversationId = this.run?.conversationId;
    this.onRun(null);
    this.run = await this.startRun({
      conversationId,
      prompt: message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
    });
    this.onRun(this.run);
    const stream = await this.reconnectToStream(options);
    if (!stream) throw new Error('The course-agent response is unavailable.');
    return stream;
  }

  override async reconnectToStream(
    options: Parameters<ChatTransport<CourseAgentMessage>['reconnectToStream']>[0],
  ) {
    if (!this.run) return null;
    return super.reconnectToStream(options);
  }

  protected override processResponseStream(stream: ReadableStream<Uint8Array>) {
    let finished = false;
    return super.processResponseStream(stream).pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (chunk.type === 'finish') finished = true;
          controller.enqueue(chunk);
        },
        flush() {
          if (!finished) {
            throw new Error('The connection was interrupted. Reconnect to recover the response.');
          }
        },
      }),
    );
  }
}
