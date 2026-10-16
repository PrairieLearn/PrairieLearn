import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

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
      const id = randomUUID();
      const response = await fetch(`${root}/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, text, expectedOperationNumber: 0 }),
      });
      expect(response.ok).toBe(true);
      return id;
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
  it('compacts broadcast state without losing archived receipts or dispatch fences', async () => {
    const c = conversation();
    const ids = Array.from({ length: 150 }, () => randomUUID());
    const dispatches = ids.map(() => randomUUID());
    const receipts = Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          dispatchId: dispatches[index],
          status: 'completed',
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
});
