import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { serviceHeaders } from '@prairielearn/course-agent-contract';

const origin = process.env.COURSE_AGENT_FIXTURE_URL;
const secret = 'local-fixture-service-token-not-a-secret';

function conversation() {
  const id = randomUUID();
  const scope = { conversationId: id, courseId: '1', userId: '1', authnUserId: '1' };
  const root = '/v1/conversations/' + id;
  let configured = false;

  async function raw(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const url = new URL(root + (path ? '/' + path : ''), origin);
    const json = body === undefined ? '' : JSON.stringify(body);
    return fetch(url, {
      method,
      headers: await serviceHeaders(secret, 'agent-api', method, url.pathname + url.search, scope, {
        body: json,
      }),
      body: json || undefined,
    });
  }

  async function configure() {
    if (!configured) {
      expect((await raw('', { repository: 'example/course', branch: 'main' }, 'PUT')).ok).toBe(
        true,
      );
      configured = true;
    }
  }

  async function request(path: string, body?: unknown) {
    await configure();
    const response = await raw(path, body);
    expect(response.ok).toBe(true);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    id,
    scope,
    raw,
    request,
    async rawMessage(input: unknown) {
      await configure();
      return raw('messages', input);
    },
    async send(text = 'Hello') {
      const input = {
        id: randomUUID(),
        text,
        expectedRevision: (await request('snapshot')).revision,
      };
      expect((await raw('messages', input)).ok).toBe(true);
      return input.id;
    },
  };
}
describe.skipIf(!origin)(
  'Signed conversation API and durable lifecycle in workerd',
  { timeout: 45000 },
  () => {
    it('preserves history for present/soft-deleted contexts and indeterminate context errors', async () => {
      const c = conversation();
      await c.send();
      for (const status of ['present', 'soft_deleted', 'unavailable', 'conflict']) {
        await c.request('test/context', { status });
        expect((await c.request('test/retention-check', {})).retention).toBeUndefined();
        expect((await c.request('history')).messages.length).toBeGreaterThan(0);
        expect((await c.request('test/status')).destroys).toBe(0);
        expect(
          (await c.request('test/schedules')).filter(
            (s: { callback: string }) => s.callback === 'checkRetention',
          ),
        ).toHaveLength(1);
      }
      await c.request('stop', {});
    });
    it('purges only after physical absence, destruction and settlement; fences later native replay', async () => {
      const c = conversation();
      await c.send();
      await c.request('test/retention-evidence', {});
      await c.request('test/context', { status: 'absent' });
      expect((await c.request('test/retention-check', {})).retention.status).toBe('complete');
      const saved = await c.request('test/retention-inspect');
      expect(saved.messages).toBe(0);
      expect(saved.recovery).toBe(false);
      expect(saved.counts.every((row: { count: number }) => row.count === 0)).toBe(true);
      expect((await c.request('test/status')).destroys).toBe(1);
      expect((await c.raw('snapshot')).status).toBe(410);
      expect(
        (await c.raw('', { repository: 'example/course', branch: 'main' }, 'PUT')).status,
      ).toBe(410);
      expect(
        (await c.raw('messages', { id: randomUUID(), text: 'Restart', expectedRevision: 0 }))
          .status,
      ).toBe(410);
      await c.request('test/recover', {});
      expect((await c.request('test/state')).repository).toBeUndefined();
      expect((await c.request('test/status')).launches).toBe(1);
    });
    it('keeps history and financial evidence when settlement fails, then reconciles explicitly', async () => {
      const c = conversation();
      await c.send();
      const grant = await c.request('test/model-reserve', {
        model: 'gpt-6-astra',
        requestDigest: 'a'.repeat(64),
        inputTokenUpperBound: 100,
        requestedMaxOutputTokens: 32,
      });
      await c.request('test/model-dispatch', { reservationId: grant.reservationId });
      await c.request('test/settlement-error', { enabled: true });
      await c.request('test/context', { status: 'absent' });
      const pending = await c.request('test/retention-check', {});
      expect(pending.retention.status).toBe('pending');
      expect(pending.modelRequests[grant.reservationId].settled).not.toBe(true);
      expect((await c.request('test/retention-inspect')).messages).toBeGreaterThan(0);
      expect(
        (await c.request('test/model-dispatch', { reservationId: grant.reservationId })).sent,
      ).toBe(false);
      await c.request('test/settlement-error', { enabled: false });
      await c.request('retention', {});
      await expect
        .poll(async () => (await c.request('test/state')).retention.status)
        .toBe('complete');
      expect((await c.request('test/retention-inspect')).settlements).toContainEqual({
        kind: 'unknown',
        reservationId: grant.reservationId,
      });
      await c.request('test/model-settle', {
        kind: 'measured',
        reservationId: grant.reservationId,
        responseId: 'late-response',
        usage: { input: 100, cached: 0, cacheWrite: 0, output: 20 },
      });
      const corrected = await c.request('test/state');
      expect(corrected.retention.status).toBe('complete');
      expect(corrected.modelRequests[grant.reservationId]).toBeUndefined();
      expect(corrected.run).toBeUndefined();
      expect((await c.request('test/retention-inspect')).messages).toBe(0);
    });
    it('reconciles an in-flight model grant without resurrecting its record after purge', async () => {
      const c = conversation();
      await c.send();
      await c.request('test/model-grant-delay', { milliseconds: 500 });
      const reservation = c.raw('test/model-reserve', {
        model: 'gpt-6-astra',
        requestDigest: 'b'.repeat(64),
        inputTokenUpperBound: 100,
        requestedMaxOutputTokens: 32,
      });
      await expect
        .poll(async () => Object.keys((await c.request('test/state')).modelRequests ?? {}).length)
        .toBe(1);
      const id = Object.keys((await c.request('test/state')).modelRequests)[0];
      await c.request('test/context', { status: 'absent' });
      expect((await c.request('test/retention-check', {})).retention.status).toBe('complete');
      expect((await reservation).ok).toBe(false);
      const saved = await c.request('test/state');
      expect(saved.modelRequests?.[id]).toBeUndefined();
      expect(saved.run).toBeUndefined();
      const evidence = await c.request('test/retention-inspect');
      expect(evidence.settlements).toContainEqual({ kind: 'not_sent', reservationId: id });
      expect(evidence.messages).toBe(0);
    });
    it('defers purge and capacity release while sandbox destruction is unconfirmed', async () => {
      const c = conversation();
      const id = await c.send();
      await c.request('test/fail-destroy', { attempts: 3 });
      await c.request('test/context', { status: 'absent' });
      const pending = await c.request('test/retention-check', {});
      expect(pending.retention.status).toBe('pending');
      expect(pending.sandbox.phase).toBe('cleanup_failed');
      const saved = await c.request('test/retention-inspect');
      expect(saved.messages).toBeGreaterThan(0);
      expect(saved.releases).not.toContain(id);
      await c.request('test/fail-destroy', { attempts: 0 });
      expect((await c.request('test/retention-check', {})).retention.status).toBe('complete');
      expect((await c.request('test/retention-inspect')).releases).toContain(id);
    });
    it('releases archived lost-ack grants in bounded batches before removing receipts', async () => {
      const c = conversation();
      await c.send();
      await c.request('stop', {});
      const ids = Array.from({ length: 150 }, () => randomUUID());
      await c.request('test/receipt-volume', {
        executions: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              status: 'interrupted',
              digest: 'immutable',
              revision: 1,
              authorization: { scope: c.scope, actionId: id, createdAt: Date.now() },
            },
          ]),
        ),
        rejectedDispatches: Object.fromEntries(ids.map((id) => [id, true])),
      });
      await c.request('test/context', { status: 'absent' });
      expect((await c.request('test/retention-check', {})).retention.status).toBe('pending');
      expect(
        (await c.request('test/retention-inspect')).counts.find(
          (r: { name: string }) => r.name === 'executions',
        ).count,
      ).toBeGreaterThan(0);
      expect((await c.request('test/retention-check', {})).retention.status).toBe('complete');
      const saved = await c.request('test/retention-inspect');
      expect(ids.every((id) => saved.releases.includes(id))).toBe(true);
      expect(saved.counts.every((r: { count: number }) => r.count === 0)).toBe(true);
    });
    it('recovers a missed deletion request through the daily durable context check', async () => {
      const c = conversation();
      await c.send();
      await c.request('stop', {});
      await c.request('test/context', { status: 'absent' });
      const saved = await c.request('test/advance', { milliseconds: 86401000 });
      expect(saved.retention.status).toBe('complete');
      expect((await c.request('test/retention-inspect')).messages).toBe(0);
    });
    it('retries partial checkpoint deletion without touching another conversation', async () => {
      const c = conversation(),
        other = conversation();
      await c.send();
      await c.request('stop', {});
      await c.request('test/advance', { milliseconds: 601000 });
      await other.send();
      await other.request('stop', {});
      await other.request('test/advance', { milliseconds: 601000 });
      const ownId = (await c.request('test/state')).checkpoint.backup.id;
      const otherId = (await other.request('test/state')).checkpoint.backup.id;
      await c.request('test/retention-evidence', {});
      const obsolete = (await c.request('test/state')).obsoleteCheckpoints[0];
      await c.request('test/fail-checkpoint-delete', { attempts: 1, skip: 1 });
      await c.request('test/context', { status: 'absent' });
      const pending = await c.request('test/retention-check', {});
      expect(pending.retention.status).toBe('pending');
      expect(pending.obsoleteCheckpoints).not.toContain(obsolete);
      const objects = await c.request('test/backup-objects');
      expect(objects).toContain(`backups/${ownId}/data.sqsh`);
      expect(objects).not.toContain(`backups/${obsolete}/data.sqsh`);
      expect((await c.request('test/retention-inspect')).messages).toBeGreaterThan(0);
      expect((await c.request('test/retention-check', {})).retention.status).toBe('complete');
      const remaining = await other.request('test/backup-objects');
      expect(remaining).toContain(`backups/${otherId}/data.sqsh`);
      expect(remaining).not.toContain(`backups/${ownId}/data.sqsh`);
      expect((await other.request('history')).messages.length).toBeGreaterThan(0);
    });
    it('joins an idle backup already in flight before purging its recorded objects', async () => {
      const c = conversation();
      await c.send();
      await c.request('stop', {});
      await c.request('test/delay-backup', { milliseconds: 1000 });
      const idle = c.request('test/advance', { milliseconds: 601000 });
      await expect.poll(async () => await c.request('test/backups')).toContain('backup-started');
      await c.request('test/context', { status: 'absent' });
      const cleanup = c.request('test/retention-check', {});
      await idle;
      expect((await cleanup).retention.status).toBe('complete');
      expect(await c.request('test/backups')).toEqual(['backup-started', 'backup', 'destroy']);
      expect((await c.request('test/retention-inspect')).messages).toBe(0);
      const objects = await c.request('test/backup-objects');
      expect((await c.request('test/state')).checkpoint).toBeUndefined();
      const id = await c.request('test/last-backup-id');
      expect(id).toBeTypeOf('string');
      expect(objects).not.toContain(`backups/${id}/data.sqsh`);
      expect(objects).not.toContain(`backups/${id}/meta.json`);
    });
    it('retries immutable command identity without repeating native work and rejects changed input', async () => {
      const c = conversation();
      const input = { id: randomUUID(), text: 'Hello', expectedRevision: 0 };
      expect((await c.rawMessage(input)).ok).toBe(true);
      expect((await c.rawMessage(input)).ok).toBe(true);
      expect((await c.rawMessage({ ...input, text: 'Different' })).status).toBe(409);
      expect((await c.request('test/status')).launches).toBe(1);
      expect((await c.request('snapshot')).revision).toBe(1);
      await c.request('stop', {});
    });
    it('keeps native usage in Cloudflare across checkpoint restore', async () => {
      const c = conversation();
      const prices = { input: 2, cachedInput: 0.5, cacheWrite: 3, output: 10 };
      expect(
        (
          await c.raw(
            '',
            {
              repository: 'example/course',
              branch: 'main',
              modelPrices: { 'gpt-6-astra': prices },
            },
            'PUT',
          )
        ).ok,
      ).toBe(true);
      await c.send();
      const usage = { input: 100, cached: 40, cacheWrite: 50, output: 20 };
      await c.request('test/usage', usage);
      await expect
        .poll(async () => (await c.request('snapshot')).conversationUsage.cacheWrite)
        .toBe(50);
      await expect
        .poll(async () => (await c.request('diagnostics')).state, { timeout: 15000 })
        .toBe('waiting_for_user');
      await c.request('test/advance', { milliseconds: 601000 });
      expect((await c.request('diagnostics')).state).toBe('absent');
      expect((await c.request('snapshot')).conversationUsage.prices).toEqual(prices);
      await c.raw(
        '',
        {
          repository: 'example/course',
          branch: 'main',
          modelPrices: { 'gpt-6-astra': { ...prices, output: 99 } },
        },
        'PUT',
      );
      expect((await c.request('snapshot')).conversationUsage.prices).toEqual(prices);
      await c.send('Continue');
      expect((await c.request('snapshot')).conversationUsage).toMatchObject(usage);
      expect((await c.request('test/status')).restores).toBe(1);
      const exported = await c.request('export');
      expect(exported).toMatchObject({ version: 1, conversationId: c.id, usage });
      await c.request('stop', {});
    });
    it('archives receipt identity without exposing a second admission API', async () => {
      const c = conversation();
      const ids = Array.from({ length: 150 }, () => randomUUID());
      const receipts = Object.fromEntries(
        ids.map((id) => [
          id,
          { dispatchId: id, digest: 'immutable', revision: 1, status: 'completed' },
        ]),
      );
      const state = await c.request('test/receipt-volume', {
        executions: receipts,
        rejectedDispatches: {},
      });
      expect(Object.keys(state.executions)).toHaveLength(100);
      const saved = await c.request('snapshot?ids=' + encodeURIComponent(JSON.stringify([ids[0]])));
      expect(saved.executions[ids[0]]).toEqual(receipts[ids[0]]);
      expect((await c.raw('reconcile-admissions', {})).status).toBe(404);
    });
    it('pauses a permanent financial callback error and recovers through explicit maintenance', async () => {
      const c = conversation();
      await c.send();
      const grant = await c.request('test/model-reserve', {
        model: 'gpt-6-astra',
        requestDigest: 'a'.repeat(64),
        inputTokenUpperBound: 100,
        requestedMaxOutputTokens: 32,
      });
      expect(
        await c.request('test/model-dispatch', { reservationId: grant.reservationId }),
      ).toEqual({ sent: true });
      await c.request('test/settlement-error', { enabled: true });
      await c.request('test/model-settle', { kind: 'unknown', reservationId: grant.reservationId });
      expect((await c.request('snapshot')).accountingWarning).toContain(
        'Contact your administrator',
      );
      expect((await c.request('snapshot')).unconfirmedCost).toBe(0.1);
      await c.request('test/advance', { milliseconds: 121000 });
      expect((await c.request('test/settlement-attempts')).attempts).toBe(1);
      await c.request('stop', {});
      await c.request('test/settlement-error', { enabled: false });
      await c.request('cleanup', {});
      await expect
        .poll(async () => (await c.request('snapshot')).accountingWarning)
        .toBeUndefined();
      await expect.poll(async () => (await c.request('test/settlement-attempts')).attempts).toBe(2);
      expect((await c.request('history')).messages.length).toBeGreaterThan(0);
    });
    it('retries measured usage arriving during an unknown settlement acknowledgment', async () => {
      const c = conversation();
      await c.send();
      const grant = await c.request('test/model-reserve', {
        model: 'gpt-6-astra',
        requestDigest: 'a'.repeat(64),
        inputTokenUpperBound: 100,
        requestedMaxOutputTokens: 32,
      });
      await c.request('test/model-dispatch', { reservationId: grant.reservationId });
      await c.request('test/settlement-delay', { milliseconds: 1000 });
      const unknown = c.raw('test/model-settle', {
        kind: 'unknown',
        reservationId: grant.reservationId,
      });
      await expect.poll(async () => (await c.request('test/settlement-attempts')).attempts).toBe(1);
      const measured = c.raw('test/model-settle', {
        kind: 'measured',
        reservationId: grant.reservationId,
        responseId: 'response-1',
        usage: { input: 100, cached: 0, cacheWrite: 0, output: 20 },
      });
      for (const response of await Promise.all([unknown, measured])) expect(response.ok).toBe(true);
      expect((await c.request('test/state')).modelRequests[grant.reservationId].settled).toBe(
        false,
      );
      await c.request('test/settlement-delay', { milliseconds: 0 });
      await c.request('test/advance', { milliseconds: 31000 });
      await expect.poll(async () => (await c.request('test/settlement-attempts')).attempts).toBe(2);
      expect((await c.request('test/state')).modelRequests[grant.reservationId]).toBeUndefined();
      await c.request('stop', {});
    });
    it('fences a reserved request after Stop and a new turn reuses the sandbox', async () => {
      const c = conversation();
      await c.send();
      const before = await c.request('test/state');
      const grant = await c.request('test/model-reserve', {
        model: 'gpt-6-astra',
        requestDigest: 'a'.repeat(64),
        inputTokenUpperBound: 100,
        requestedMaxOutputTokens: 32,
      });
      await c.request('stop', {});
      await c.send('A new turn');
      const after = await c.request('test/state');
      expect(after.sandbox.id).toBe(before.sandbox.id);
      expect(after.action.grant.actionId).not.toBe(before.action.grant.actionId);
      expect(
        await c.request('test/model-dispatch', { reservationId: grant.reservationId }),
      ).toEqual({ sent: false });
      await c.request('test/budget-stop', {});
      await expect.poll(async () => (await c.request('runtime')).running).toBe(false);
      expect((await c.request('snapshot')).budgetStop.message).toContain('spending limit');
      const page = await c.request('history?limit=1');
      expect(page.messages).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      const next = await c.request('history?limit=1&cursor=' + encodeURIComponent(page.nextCursor));
      expect(next.messages[0].id).not.toBe(page.messages[0].id);
      await c.send('Explicit continuation');
      expect((await c.request('snapshot')).budgetStop).toBeUndefined();
      await c.request('stop', {});
    });
    it('fences old lifecycle calls after restoring a new generation', async () => {
      const c = conversation();
      await c.send();
      await expect
        .poll(async () => (await c.request('diagnostics')).state, { timeout: 15000 })
        .toBe('waiting_for_user');
      const old = (await c.request('test/state')).sandbox.id;
      await c.request('test/advance', { milliseconds: 601000 });
      await c.send('Restore');
      const current = (await c.request('test/state')).sandbox.id;
      expect(current).not.toBe(old);
      await c.request('test/expire-old', { id: old });
      expect((await c.request('test/state')).sandbox.id).toBe(current);
      await c.request('stop', {});
    });
    it('includes live tools and steering without giving a correction a new spending root', async () => {
      const c = conversation();
      await c.send();
      const action = (await c.request('test/state')).action.grant.actionId;
      await expect
        .poll(async () =>
          (await c.request('snapshot')).messages.some((m: { parts: { type: string }[] }) =>
            m.parts.some((p) => p.type === 'dynamic-tool'),
          ),
        )
        .toBe(true);
      await c.send('Continue checking');
      expect((await c.request('test/state')).action.grant.actionId).toBe(action);
      expect((await c.request('test/status')).steers).toBe(1);
      await c.request('stop', {});
    });
    it('reconciles a lost steering acknowledgment without repeating the correction', async () => {
      const c = conversation();
      await c.send();
      await c.request('test/steer-behavior', { behavior: 'lose-ack' });
      const input = {
        id: randomUUID(),
        text: 'Also check assessments',
        expectedRevision: (await c.request('snapshot')).revision,
      };
      expect((await c.rawMessage(input)).status).toBe(503);
      expect((await c.rawMessage(input)).ok).toBe(true);
      expect((await c.rawMessage(input)).ok).toBe(true);
      expect((await c.request('test/status')).steers).toBe(1);
      expect(
        (await c.request('snapshot')).messages.filter((m: { id: string }) => m.id === input.id),
      ).toHaveLength(1);
      await c.request('stop', {});
    });
    it('bounds cleanup retries and retains an explicit recovery path', async () => {
      const c = conversation();
      await c.send();
      await c.request('stop', {});
      await c.request('test/fail-destroy', { attempts: 3 });
      await c.request('test/advance', { milliseconds: 601000 });
      await c.request('test/advance', { milliseconds: 31000 });
      await c.request('test/advance', { milliseconds: 31000 });
      expect((await c.request('diagnostics')).cleanup).toMatchObject({
        attempts: 3,
        retryAt: null,
      });
      await c.request('cleanup', {});
      await expect.poll(async () => (await c.request('diagnostics')).state).toBe('absent');
    });
    it('publishes a failed tool result without any browser executor or connected observer', async () => {
      const c = conversation();
      await c.send();
      await c.request('test/approval', {});
      await expect.poll(async () => (await c.request('snapshot')).pendingTool?.prepared).toBe(true);
      const pending = (await c.request('snapshot')).pendingTool;
      const result = {
        id: pending.id,
        result: 'Validation failed. Correct the file and request approval again.',
        success: false,
      };
      await c.request('test/publication', result);
      await expect
        .poll(async () => (await c.request('test/status')).toolResults?.[0]?.success)
        .toBe(false);
      await c.request('test/drive', {});
      expect((await c.request('test/status')).toolResults).toHaveLength(1);
      expect((await c.request('snapshot')).pendingTool).toBeUndefined();
      await c.request('stop', {});
    });
    it('retains approval across suspension and records a cold continuation once under the original root', async () => {
      const c = conversation();
      await c.send();
      await c.request('test/approval', {});
      await expect.poll(async () => (await c.request('snapshot')).pendingTool?.prepared).toBe(true);
      const pending = (await c.request('snapshot')).pendingTool;
      const action = (await c.request('test/state')).action.grant.actionId;
      await c.request('test/advance', { milliseconds: 601000 });
      expect((await c.request('diagnostics')).state).toBe('absent');
      await c.request('test/publication', {
        id: pending.id,
        result: 'The user denied the proposal. Nothing was published.',
        success: true,
      });
      await expect
        .poll(async () => (await c.request('test/status')).restores, { timeout: 15000 })
        .toBe(1);
      await c.request('test/drive', {});
      expect((await c.request('test/state')).action.grant.actionId).toBe(action);
      expect(
        (await c.request('snapshot')).messages.filter(
          (m: { metadata?: { source: string } }) => m.metadata?.source === 'tool-result',
        ),
      ).toHaveLength(1);
      await c.request('stop', {});
    });
  },
);
