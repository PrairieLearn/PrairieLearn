import { describe, expect, it } from 'vitest';

import { createCodexConnection } from './codex-connection.js';

describe('Codex WebSocket transport', () => {
  it('adapts bidirectional Codex frames and disposes pending work on disconnect', async () => {
    const sent: Record<string, unknown>[] = [];
    const failed: Error[] = [];
    const socket = Object.assign(new EventTarget(), {
      send: (data: string) => sent.push(JSON.parse(data)),
      close() {},
    });
    const rpc = createCodexConnection(socket as unknown as WebSocket, (error) =>
      failed.push(error),
    );
    const emit = (frame: unknown) =>
      socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
    const progress: unknown[] = [];
    rpc.onNotification('progress', (params: unknown) => {
      progress.push(params);
    });
    rpc.onRequest('approve', (params: { command: string }) => ({ approved: params.command }));
    rpc.listen();
    const reply = rpc.sendRequest('run', { text: 'input' });
    emit({ method: 'progress', params: { text: 'working' } });
    emit({ id: 'server-request', method: 'approve', params: { command: 'edit' } });
    emit({ id: sent[0].id, result: { accepted: true } });
    expect(await reply).toEqual({ accepted: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sent).toEqual([
      { id: 0, method: 'run', params: { text: 'input' } },
      { id: 'server-request', result: { approved: 'edit' } },
    ]);
    expect(progress).toEqual([{ text: 'working' }]);
    const pending = rpc.sendRequest('pending', {});
    socket.dispatchEvent(new Event('close'));
    await expect(pending).rejects.toThrow();
    expect(failed).toEqual([new Error('Native runner disconnected')]);
  });
});
