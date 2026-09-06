import { Chat } from '@ai-sdk/react';
import { JsonToSseTransformStream, type UIMessageChunk } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CourseAgentMessage } from '../lib/course-agent/ui-stream.js';

import { CourseAgentTransport } from './courseAgentTransport.js';

const run = { runId: 'test-run', conversationId: 'conversation', sandboxId: 'sandbox' };

describe('course-agent useChat transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('updates the SDK message before the stream completes', async () => {
    let controller!: ReadableStreamDefaultController<UIMessageChunk>;
    const stream = new ReadableStream<UIMessageChunk>({
      start(value) {
        controller = value;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            stream.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream()),
          ),
        ),
    );
    const start = vi.fn().mockResolvedValue(run);
    const chat = new Chat<CourseAgentMessage>({
      transport: new CourseAgentTransport(start, '1', vi.fn()),
    });
    const sending = chat.sendMessage({ text: 'Hello' });
    controller.enqueue({ type: 'start', messageId: run.runId });
    controller.enqueue({ type: 'text-start', id: 'text' });
    controller.enqueue({ type: 'text-delta', id: 'text', delta: 'First' });
    await vi.waitFor(() => {
      expect(chat.status).toBe('streaming');
      expect(chat.messages.at(-1)?.parts).toMatchObject([{ type: 'text', text: 'First' }]);
    });
    controller.enqueue({ type: 'text-delta', id: 'text', delta: ' second' });
    controller.enqueue({ type: 'text-end', id: 'text' });
    controller.enqueue({ type: 'finish' });
    controller.close();
    await sending;
    expect(chat.status).toBe('ready');
    expect(chat.messages.at(-1)?.parts).toMatchObject([{ type: 'text', text: 'First second' }]);
    expect(start).toHaveBeenCalledExactlyOnceWith({ prompt: 'Hello', conversationId: undefined });
  });

  it('reports truncated streams and replays without submitting another model request', async () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: run.runId },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: 'Recovered' },
    ];
    const response = (complete: boolean) =>
      new Response(
        chunks
          .concat(complete ? [{ type: 'text-end', id: 'text' }, { type: 'finish' }] : [])
          .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
          .join(''),
      );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(false)).mockResolvedValueOnce(response(true)),
    );
    const start = vi.fn().mockResolvedValue(run);
    const chat = new Chat<CourseAgentMessage>({
      transport: new CourseAgentTransport(start, '1', vi.fn()),
    });
    await chat.sendMessage({ text: 'Hello' });
    expect(chat.status).toBe('error');
    expect(chat.error?.message).toContain('interrupted');
    chat.messages = chat.messages.filter((message) => message.id !== run.runId);
    await chat.resumeStream();
    expect(chat.status).toBe('ready');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages.at(-1)?.parts).toMatchObject([{ type: 'text', text: 'Recovered' }]);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
