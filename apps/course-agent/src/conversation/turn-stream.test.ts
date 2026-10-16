import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';

import { TurnStream } from './turn-stream.js';

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

describe('TurnStream', () => {
  it('gives the SDK and the caller the full reply', async () => {
    const turn = new TurnStream(undefined);
    const callerStream = turn.callerStream();
    const forSdk = turn.split(replyStream(CHUNKS));
    turn.end();

    const [sdkChunks, callerChunks] = await Promise.all([
      readAll(forSdk),
      readAll(await callerStream),
    ]);
    expect(sdkChunks).toEqual(CHUNKS);
    expect(callerChunks).toEqual(CHUNKS);
  });

  it('fails the caller if the turn ends without a reply', async () => {
    const turn = new TurnStream(undefined);
    const callerStream = turn.callerStream();
    turn.end(new Error('model unavailable'));
    await expect(callerStream).rejects.toThrow('model unavailable');
  });

  it('aborts the turn when the caller stops reading, without cutting off the SDK', async () => {
    const turn = new TurnStream(undefined);
    const callerStream = turn.callerStream();
    const forSdk = turn.split(replyStream(CHUNKS.slice(0, 3), { close: false }));

    const reader = (await callerStream).getReader();
    expect((await reader.read()).value).toEqual(CHUNKS[0]);
    await reader.cancel('Stop');

    expect(turn.abort.signal.aborted).toBe(true);
    // The SDK's copy is still readable, so it can persist the partial reply.
    const sdkReader = forSdk.getReader();
    expect((await sdkReader.read()).value).toEqual(CHUNKS[0]);
  });
});
