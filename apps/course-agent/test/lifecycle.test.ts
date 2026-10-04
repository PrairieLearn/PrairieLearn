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
        body: JSON.stringify({ id: randomUUID(), text, expectedOperationNumber: 0 }),
      });
      expect(response.ok).toBe(true);
    },
    async host(prepared = true) {
      const socket = new WebSocket(root.replace('http', 'ws'), {
        headers: { ...headers, 'X-Host-Tools': '1' },
      });
      await once(socket, 'open');
      socket.send(JSON.stringify({ type: 'host-tools-ready' }));
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'host-tool-call' && frame.sequence) {
          socket.send(
            JSON.stringify({
              type: prepared ? 'host-tool-prepared' : 'host-tool-preparation-error',
              id: frame.id,
            }),
          );
        }
      });
      return socket;
    },
  };
}
describe.skipIf(!origin)('Durable Object lifecycle in workerd', { timeout: 45000 }, () => {
  it('fences an unanswered dispatch and accepts a newly admitted retry without repeating execution', async () => {
    const c = conversation();
    const id = randomUUID(),
      dispatchId = randomUUID();
    expect(await c.request('reconcile-admissions', { admissions: [{ id, dispatchId }] })).toEqual({
      rejected: [dispatchId],
    });
    expect(
      (await c.rawMessage({ id, dispatchId, text: 'Late request', expectedOperationNumber: 0 }))
        .status,
    ).toBe(409);
    const retried = { id, dispatchId: randomUUID(), text: 'Retry', expectedOperationNumber: 0 };
    expect((await c.rawMessage(retried)).ok).toBe(true);
    expect((await c.request('snapshot')).executions[id].dispatchId).toBe(retried.dispatchId);
    expect(
      await c.request('reconcile-admissions', {
        admissions: [{ id, dispatchId: retried.dispatchId }],
      }),
    ).toEqual({ rejected: [] });
    expect((await c.rawMessage(retried)).ok).toBe(true);
    expect((await c.request('test/status')).launches).toBe(1);
    await c.request('cancel', {});
  });
  it('compacts broadcast state without losing archived usage or dispatch fences', async () => {
    const c = conversation();
    const ids = Array.from({ length: 150 }, () => randomUUID());
    const dispatches = ids.map(() => randomUUID());
    const receipts = Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          dispatchId: dispatches[index],
          status: 'completed',
          model: 'fixture-model',
          input: 10,
          cached: 0,
          output: 2,
        },
      ]),
    );
    const rejected = Array.from({ length: 150 }, () => randomUUID());
    const state = await c.request('test/receipt-volume', {
      executions: receipts,
      rejectedDispatches: Object.fromEntries(rejected.map((id) => [id, true])),
    });
    expect(Object.keys(state.executions)).toHaveLength(100);
    expect(Object.keys(state.rejectedDispatches)).toHaveLength(100);
    const saved = await c.request(`snapshot?ids=${encodeURIComponent(JSON.stringify([ids[0]]))}`);
    expect(saved.executions[ids[0]]).toEqual(receipts[ids[0]]);
    expect(
      await c.request('reconcile-admissions', {
        admissions: [{ id: ids[0], dispatchId: dispatches[0] }],
      }),
    ).toEqual({ rejected: [] });
    expect(
      (
        await c.rawMessage({
          id: randomUUID(),
          dispatchId: rejected[0],
          text: 'Late',
          expectedOperationNumber: 0,
        })
      ).status,
    ).toBe(409);
  });
  it('keeps a preparation failure connected and acknowledges a successful explicit retry', async () => {
    const c = conversation();
    const socket = await c.host(false);
    try {
      await c.send();
      await c.request('test/approval', {});
      await expect
        .poll(async () => (await c.request('snapshot')).pendingTool?.error)
        .toBe('Retry preparation.');
      expect(socket.readyState).toBe(WebSocket.OPEN);
      const tool = (await c.request('snapshot')).pendingTool;
      expect(tool.prepared).not.toBe(true);
      await c.request('tool-prepared', { id: tool.id });
      expect((await c.request('snapshot')).pendingTool.prepared).toBe(true);
      expect((await c.request('snapshot')).pendingTool.error).toBeUndefined();
      await c.request('cancel', {});
    } finally {
      socket.close();
    }
  });
  it('suspends after ten idle minutes, keeps one checkpoint, and restores on the next message', async () => {
    const c = conversation();
    await c.send();
    await expect
      .poll(async () => (await c.request('diagnostics')).state, { timeout: 15000 })
      .toBe('waiting_for_user');
    await c.request('test/advance', { milliseconds: 31_000 });
    expect((await c.request('diagnostics')).state).toBe('waiting_for_user');
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
  it('includes live tools and steering in snapshots before the turn finishes', async () => {
    const c = conversation();
    await c.send();
    await expect
      .poll(async () =>
        (await c.request('snapshot')).messages.some((message: { parts: { type: string }[] }) =>
          message.parts.some((part) => part.type === 'dynamic-tool'),
        ),
      )
      .toBe(true);
    const id = randomUUID();
    expect(
      (await c.rawMessage({ id, text: 'Continue checking.', expectedOperationNumber: 0 })).ok,
    ).toBe(true);
    await expect
      .poll(async () =>
        (await c.request('snapshot')).messages.some((message: { parts: { type: string }[] }) =>
          message.parts.some((part) => part.type === 'data-steering'),
        ),
      )
      .toBe(true);
    await c.request('cancel', {});
  });
  it('reconciles a lost steering acknowledgment without submitting steering twice', async () => {
    const c = conversation();
    await c.send();
    await c.request('test/steer-behavior', { behavior: 'lose-ack' });
    const input = {
      id: randomUUID(),
      text: 'Also check the assessments.',
      expectedOperationNumber: 0,
    };
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
  it('delivers a failed native tool result and releases the gate without an approval decision', async () => {
    const c = conversation();
    const socket = await c.host();
    try {
      await c.send();
      await c.request('test/approval', {});
      await expect.poll(async () => (await c.request('snapshot')).pendingTool?.prepared).toBe(true);
      const pending = (await c.request('snapshot')).pendingTool;
      const error = 'Unrecognized key: accessRules. Correct the file and submit a new proposal.';
      const result = {
        type: 'host-tool-result',
        id: pending.id,
        outcome: {
          id: pending.id,
          result: error,
          success: false,
          display: { name: 'push_sync', value: { error } },
        },
      };
      socket.send(JSON.stringify(result));
      await expect
        .poll(async () => (await c.request('test/status')).toolResults?.[0]?.success)
        .toBe(false);
      await expect.poll(async () => (await c.request('snapshot')).blocked).toBe(false);
      expect((await c.request('test/status')).toolResults[0].contentItems[0].text).toBe(error);
      socket.send(JSON.stringify(result));
      await c.request('cancel', {});
      expect((await c.request('test/status')).toolResults).toHaveLength(1);
    } finally {
      socket.close();
    }
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
      const rejected: unknown[] = [];
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'host-tool-delivered') received.push(frame);
        if (frame.type === 'host-tool-delivery-error') rejected.push(frame);
      });
      socket.send(JSON.stringify(outcome));
      await expect.poll(() => rejected.length).toBe(1);
      expect(received).toHaveLength(0);
      expect((await c.request('test/status')).restores).toBe(0);
      expect((await c.request('snapshot')).pendingTool.id).toBe(pending.id);
      const dispatchId = randomUUID();
      const admitted = { ...outcome, outcome: { ...outcome.outcome, dispatchId } };
      socket.send(JSON.stringify(admitted));
      await expect.poll(() => received.length, { timeout: 15000 }).toBe(1);
      socket.send(JSON.stringify(outcome));
      await expect.poll(() => received.length).toBe(2);
      const snapshot = await c.request('snapshot');
      expect(snapshot.pendingTool).toBeUndefined();
      expect(snapshot.executions[pending.id].dispatchId).toBe(dispatchId);
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
