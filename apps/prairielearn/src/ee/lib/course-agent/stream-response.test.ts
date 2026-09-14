import { Writable } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { pipeCourseAgentUIStream } from './stream-response.js';

it('prevents intermediary caches from storing an agent stream', async () => {
  const headers = new Map<string, unknown>();
  const response = new Writable({ write: (_chunk, _encoding, callback) => callback() });
  Object.assign(response, {
    setHeader: vi.fn((key: string, value: unknown) => headers.set(key, value)),
  });
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('data: {}\n\n');
      controller.close();
    },
  });

  await pipeCourseAgentUIStream(
    stream,
    response as unknown as Parameters<typeof pipeCourseAgentUIStream>[1],
  );

  expect(headers.get('Cache-Control')).toBe('no-store');
});
