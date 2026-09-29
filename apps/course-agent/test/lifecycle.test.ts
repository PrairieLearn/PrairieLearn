import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const origin = process.env.COURSE_AGENT_FIXTURE_URL;
const headers = {
  Authorization: 'Bearer local-fixture-service-token-not-a-secret',
  'Content-Type': 'application/json',
};

function conversation() {
  const id = randomUUID();
  const root = `${origin}/agents/chat/${id}`;
  return {
    async request(path: string, body?: unknown) {
      const response = await fetch(`${root}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      expect(response.ok).toBe(true);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    },
    rawMessage(input: unknown) {
      return fetch(`${root}/message`, { method: 'POST', headers, body: JSON.stringify(input) });
    },
    async send(text = 'Hello') {
      const response = await fetch(`${root}/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: randomUUID(), text, expectedRevision: 0 }),
      });
      expect(response.ok).toBe(true);
    },
    async host() {
      const socket = new WebSocket(root.replace('http', 'ws'), {
        headers: { ...headers, 'X-Host-Tools': '1' },
      });
      await once(socket, 'open');
      socket.send(JSON.stringify({ type: 'host-tools-ready' }));
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'host-tool-call' && frame.sequence) {
          socket.send(JSON.stringify({ type: 'host-tool-prepared', id: frame.id }));
        }
      });
      return socket;
    },
  };
}
describe.skipIf(!origin)('Durable Object lifecycle in workerd', { timeout: 45000 }, () => {
  it('suspends after ten idle minutes, keeps one checkpoint, and restores on the next message', async () => {
    const c = conversation();
    await c.send();
    await expect
      .poll(async () => (await c.request('diagnostics')).state, { timeout: 15000 })
      .toBe('waiting_for_user');
    const before = await c.request('test/status');
    expect(before.launches).toBe(1);
    await c.request('test/advance', { milliseconds: 10 * 60_000 + 1000 });
    expect((await c.request('diagnostics')).state).toBe('absent');
    const checkpoint = (await c.request('test/state')).checkpoint;
    expect(checkpoint).toBeDefined();
    await c.send('Continue');
    expect((await c.request('test/status')).restores).toBe(1);
    await expect
      .poll(async () => (await c.request('diagnostics')).state, { timeout: 15000 })
      .toBe('waiting_for_user');
    await c.request('test/advance', { milliseconds: 10 * 60_000 + 1000 });
    const objects = await c.request('test/backup-objects');
    expect(objects).not.toContain(`backups/${checkpoint.backup.id}/data.sqsh`);
    const latest = (await c.request('test/state')).checkpoint;
    expect(objects).toContain(`backups/${latest.backup.id}/data.sqsh`);
  });
  it('reconciles a lost steering acknowledgment without submitting steering twice', async () => {
    const c = conversation();
    await c.send();
    await c.request('test/steer-behavior', { behavior: 'lose-ack' });
    const input = { id: randomUUID(), text: 'Also check the assessments.', expectedRevision: 0 };
    const response = await c.rawMessage(input);
    expect(response.status).toBe(503);
    const retry = await c.rawMessage(input);
    expect(retry.ok).toBe(true);
    expect((await c.request('test/status')).steers).toBe(1);
    expect(
      (await c.request('snapshot')).messages.filter(
        (message: { id: string }) => message.id === input.id,
      ),
    ).toHaveLength(1);
    await c.request('cancel', {});
  });
  it('automatically attempts cleanup three times, then requires an explicit retry', async () => {
    const c = conversation();
    await c.send();
    await c.request('cancel', {});
    await c.request('test/fail-destroy', { attempts: 3 });
    await c.request('test/advance', { milliseconds: 10 * 60_000 + 1000 });
    expect((await c.request('diagnostics')).state).toBe('cleanup_failed');
    await c.request('test/advance', { milliseconds: 31000 });
    await c.request('test/advance', { milliseconds: 31000 });
    const diagnostics = await c.request('diagnostics');
    expect(diagnostics.cleanup.attempts).toBe(3);
    expect(diagnostics.cleanup.retryAt).toBeNull();
    await c.request('cleanup', {});
    expect((await c.request('diagnostics')).state).toBe('absent');
  });
  it('retains the pending tool across suspension and delivers a cold hidden continuation exactly once', async () => {
    const c = conversation();
    const socket = await c.host();
    try {
      await c.send();
      await c.request('test/approval', {});
      await expect.poll(async () => (await c.request('snapshot')).pendingTool?.prepared).toBe(true);
      const pending = (await c.request('snapshot')).pendingTool;
      await c.request('test/advance', { milliseconds: 10 * 60_000 + 1000 });
      expect((await c.request('snapshot')).pendingTool.id).toBe(pending.id);
      expect((await c.request('diagnostics')).state).toBe('absent');
      const outcome = {
        type: 'host-tool-result',
        id: pending.id,
        outcome: { id: pending.id, result: 'Denied. Nothing was published.' },
      };
      const received: unknown[] = [];
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'host-tool-delivered') received.push(frame);
      });
      socket.send(JSON.stringify(outcome));
      await expect.poll(() => received.length, { timeout: 15000 }).toBe(1);
      socket.send(JSON.stringify(outcome));
      await expect.poll(() => received.length).toBe(2);
      const snapshot = await c.request('snapshot');
      expect(snapshot.pendingTool).toBeUndefined();
      expect(
        snapshot.messages.filter(
          (m: { metadata?: { source: string } }) => m.metadata?.source === 'tool-result',
        ),
      ).toHaveLength(1);
      expect((await c.request('test/status')).restores).toBe(1);
      await c.request('cancel', {});
    } finally {
      socket.close();
    }
  });
});
