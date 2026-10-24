import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RpcConnection } from './rpc.js';

function connection() {
  const sent: Record<string, unknown>[] = [];
  const failed: Error[] = [];
  const socket = Object.assign(new EventTarget(), {
    send: (data: string) => sent.push(JSON.parse(data)),
    close() {},
  });
  const rpc = new RpcConnection(socket as unknown as WebSocket, (error) => failed.push(error));
  const emit = (frame: unknown) =>
    socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
  return { rpc, sent, emit, failed };
}
const Text = z.string();
const Number = z.number();
const textMethod = {
  method: 'text',
  params: (value: unknown): value is string => Text.safeParse(value).success,
  result: (value: unknown): value is number => Number.safeParse(value).success,
};
const numberMethod = { method: 'number', params: textMethod.result, result: textMethod.params };

describe('JSON-RPC connection', () => {
  it('routes interleaved replies, notifications and server requests without method-specific dispatch', async () => {
    const { rpc, sent, emit, failed } = connection();
    const observed: string[] = [];
    rpc.onNotification({ method: 'progress', params: textMethod.params }, (value) =>
      observed.push(value),
    );
    rpc.onRequest(numberMethod, (value) => `server ${value}`);
    const text = rpc.request(textMethod, 'input');
    const number = rpc.request(numberMethod, 42);
    emit({ id: sent[1].id, result: 'second reply' });
    emit({ method: 'progress', params: 'working' });
    emit({ id: 'server-request', method: 'number', params: 7 });
    emit({ id: sent[0].id, result: 3 });
    expect(await text).toBe(3);
    expect(await number).toBe('second reply');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observed).toEqual(['working']);
    expect(sent.at(-1)).toEqual({ id: 'server-request', result: 'server 7' });
    expect(failed).toEqual([]);
    rpc.close();
  });

  it('rejects all pending work when a response violates its method schema', async () => {
    const { rpc, sent, emit, failed } = connection();
    const first = rpc.request(textMethod, 'input');
    const second = rpc.request(numberMethod, 42);
    emit({ id: sent[0].id, result: 'incorrect type' });
    await expect(first).rejects.toThrow('Invalid result for text');
    await expect(second).rejects.toThrow('Invalid result for text');
    expect(failed).toHaveLength(1);
  });
});
