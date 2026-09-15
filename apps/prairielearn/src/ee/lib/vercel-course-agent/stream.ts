import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { type HarnessAgentSession, getHarnessErrorMessage } from '@ai-sdk/harness/agent';
import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';

import { logger } from '@prairielearn/logger';

import type { claimConversation } from './conversations.js';
import { createSandboxAgent } from './sandbox.js';

export async function streamConversation(
  conversation: ReturnType<typeof claimConversation>,
  prompt: string,
  response: ServerResponse,
) {
  const abort = new AbortController();
  const disconnected = () => {
    if (!response.writableFinished) abort.abort();
  };
  response.on('close', disconnected);
  let drain = Promise.resolve();
  let session: HarnessAgentSession | undefined;
  const onError = (error: unknown) => {
    conversation.failed = true;
    // SDK errors can contain provider requests and credentials. Never log their bodies.
    logger.error('Vercel course agent failed', {
      conversationId: conversation.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    const message = getHarnessErrorMessage(error);
    return message === 'An error occurred.'
      ? 'The agent could not finish. Start over to try again.'
      : message;
  };
  try {
    const streamResponse = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          conversation.runtime ??= await createSandboxAgent(conversation.repository);
          abort.signal.throwIfAborted();
          const { agent } = conversation.runtime;
          session = await agent.createSession({
            sessionId: conversation.id,
            resumeFrom: conversation.resumeFrom,
            abortSignal: abort.signal,
          });
          // Native Codex owns the history. Only send the new user message.
          const result = await agent.stream({
            session,
            prompt,
            abortSignal: abort.signal,
            timeout: 5 * 60_000,
          });
          writer.merge(toUIMessageStream({ stream: result.stream, onError }));
        },
        onError,
      }),
      // Keep the claim until the native turn ends, not just until headers are sent.
      consumeSseStream: ({ stream }) => {
        drain = consumeStream({ stream });
      },
    });
    streamResponse.headers.forEach((value, name) => response.setHeader(name, value));
    // Node's pipeline cancels its reader on disconnect, including under backpressure.
    await pipeline(
      Readable.fromWeb(streamResponse.body! as NodeReadableStream<Uint8Array>),
      response,
    );
    await drain;
    if (abort.signal.aborted || !session || session.hasUnfinishedTurn()) conversation.failed = true;
    if (session && !conversation.failed) conversation.resumeFrom = await session.detach();
  } catch (error) {
    onError(error);
  } finally {
    await drain;
    if (conversation.failed) await conversation.runtime?.sandbox.stop().catch(() => {});
    response.off('close', disconnected);
    conversation.busy = false;
  }
}
