import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import type { Response } from 'express';

export async function pipeCourseAgentUIStream(stream: ReadableStream<string>, res: Response) {
  Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.setHeader('Cache-Control', 'no-store');

  await pipeline(Readable.fromWeb(stream as unknown as NodeReadableStream<string>), res);
}
