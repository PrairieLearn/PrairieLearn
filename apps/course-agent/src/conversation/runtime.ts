import { createOpenAI } from '@ai-sdk/openai';
import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  streamText,
  toUIMessageStream,
} from 'ai';

import type { CourseContext } from '@prairielearn/course-agent-protocol';

import { buildInstructions } from './instructions.js';

export interface ModelEnvironment {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
}
export interface ReplyInput {
  messages: UIMessage[];
  messageId: string;
  signal: AbortSignal;
  context: CourseContext | null;
}

/** A sandbox runtime can implement this same producer without owning the observation protocol. */
export async function createModelReply(
  env: ModelEnvironment,
  input: ReplyInput,
): Promise<ReadableStream<UIMessageChunk>> {
  const result = streamText({
    model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(env.OPENAI_MODEL),
    instructions: buildInstructions(input.context ?? undefined),
    messages: await convertToModelMessages(input.messages),
    abortSignal: input.signal,
  });
  return toUIMessageStream({
    stream: result.stream,
    originalMessages: input.messages,
    generateMessageId: () => input.messageId,
  });
}
