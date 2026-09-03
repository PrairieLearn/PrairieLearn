import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import type { Response } from 'express';

export async function pipeUiMessageStream(stream: ReadableStream<string>, res: Response) {
  Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // `Readable.fromWeb` accepts node:stream/web's `ReadableStream`, but the `ai`
  // package returns the global (lib.dom) `ReadableStream`. They are runtime-
  // compatible (Node implements WHATWG streams) but TypeScript treats them as
  // nominally distinct classes, so a cast is required.
  await pipeline(Readable.fromWeb(stream as unknown as NodeReadableStream<string>), res);
}
