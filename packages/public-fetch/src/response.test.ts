import { ReadableStream } from 'node:stream/web';

import { Response } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import { ResponseTooLargeError, readResponseWithLimit } from './index.js';

describe('readResponseWithLimit', () => {
  it('allows exactly the limit and preserves multibyte text', async () => {
    const response = new Response('olá');
    expect((await readResponseWithLimit(response, 4)).toString('utf8')).toBe('olá');
  });

  it('rejects an oversized Content-Length and cancels without reading', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Length': '5' },
    });
    await expect(readResponseWithLimit(response, 4)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds streamed bytes without Content-Length', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('abc'));
          controller.enqueue(Buffer.from('de'));
        },
        cancel,
      }),
    );
    await expect(readResponseWithLimit(response, 4)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
