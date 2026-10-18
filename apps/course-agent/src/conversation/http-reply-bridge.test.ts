import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';

import { HttpReplyBridge } from './http-reply-bridge.js';

const CHUNKS: UIMessageChunk[] = [
  { type: 'start' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'Hello' },
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
];

function replyStream(chunks: UIMessageChunk[], { close = true } = {}) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      if (close) controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('HttpReplyBridge', () => {
  it('gives the SDK and the caller the full reply', async () => {
    const turn = new HttpReplyBridge();
    const callerStream = turn.waitForReplyStream();
    const forSdk = turn.attachReplyStream(replyStream(CHUNKS));
    turn.failIfReplyNotStarted();

    const [sdkChunks, callerChunks] = await Promise.all([
      readAll(forSdk),
      readAll(await callerStream),
    ]);
    expect(sdkChunks).toEqual(CHUNKS);
    expect(callerChunks).toEqual(CHUNKS);
  });

  it('fails the caller if the turn ends without a reply', async () => {
    const turn = new HttpReplyBridge();
    const callerStream = turn.waitForReplyStream();
    turn.failIfReplyNotStarted(new Error('model unavailable'));
    await expect(callerStream).rejects.toThrow('model unavailable');
  });

  it('preserves non-Error rejection reasons', async () => {
    const bridge = new HttpReplyBridge();
    const response = bridge.waitForReplyStream();
    bridge.failIfReplyNotStarted('provider unavailable');
    await expect(response).rejects.toBe('provider unavailable');
  });

  it('aborts the turn when the caller stops reading, without cutting off the SDK', async () => {
    const turn = new HttpReplyBridge();
    const callerStream = turn.waitForReplyStream();
    const forSdk = turn.attachReplyStream(replyStream(CHUNKS.slice(0, 3), { close: false }));

    const reader = (await callerStream).getReader();
    expect((await reader.read()).value).toEqual(CHUNKS[0]);
    await reader.cancel('Stop');

    expect(turn.abort.signal.aborted).toBe(true);
    // The SDK's copy is still readable, so it can persist the partial reply.
    const sdkReader = forSdk.getReader();
    expect((await sdkReader.read()).value).toEqual(CHUNKS[0]);
  });
});
