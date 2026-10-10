import { getAgentByName } from 'agents';
import { z } from 'zod';

import { verifyServiceRequest } from '@prairielearn/course-agent-contract';

import { type Env, Chat as ProductionChat } from '../../src/agent.js';
import { cleanupError } from '../../src/cleanup-error.js';
import { type CodexSandbox, type CodexState, SANDBOX_IDLE_MS } from '../../src/codex.js';
import worker from '../../src/worker.js';

import { TestPLAPI } from './pl-api.js';
import retentionSql from './retention.sql';
import { TestSandbox } from './sandbox.js';

export { TestPLAPI, TestSandbox };

export class Chat extends ProductionChat {
  // Exercise deadline-before-idle ordering without changing the production timeout.
  protected override get interactionTimeoutMs() {
    return this.name === 'short-deadline' ? 30_000 : super.interactionTimeoutMs;
  }

  private timeOffset = 0;
  protected override now() {
    return Date.now() + this.timeOffset;
  }

  private fixture() {
    const env = this.env as typeof this.env & {
      TestSandbox: DurableObjectNamespace<TestSandbox>;
    };
    return env.TestSandbox.get(env.TestSandbox.idFromName(this.name));
  }

  protected override async deleteCheckpoint(id: string) {
    const skip = (await this.ctx.storage.get<number>('fixtureDeleteSkip')) ?? 0;
    if (skip) {
      await this.ctx.storage.put('fixtureDeleteSkip', skip - 1);
      return super.deleteCheckpoint(id);
    }
    const remaining = (await this.ctx.storage.get<number>('fixtureDeleteFailures')) ?? 0;
    if (remaining) {
      await this.ctx.storage.put('fixtureDeleteFailures', remaining - 1);
      throw new Error('Fixture checkpoint deletion unavailable.');
    }
    await super.deleteCheckpoint(id);
  }

  protected override sandbox(_id: string) {
    const fixture = this.fixture();
    return new Proxy(fixture, {
      get(target, key) {
        if (key === 'wsConnect') return (request: Request) => target.fetch(request);
        if (key === 'startProcess') {
          return async (command: string, options: { processId: string }) => {
            await target.startProcess(command, options);
            return { waitForPort: async () => {} };
          };
        }
        return Reflect.get(target, key);
      },
    }) as unknown as CodexSandbox;
  }

  override async onRequest(request: Request) {
    const path = new URL(request.url).pathname;
    if (path.includes('/test/') && !this.state.repository && !this.state.retention) {
      this.setState({
        ...this.state,
        repository: { repository: 'example/course', branch: 'main' },
      });
    }
    if (path.endsWith('/test/context')) {
      const { status } = await request.json<{ status: string }>();
      await (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name).contextStatus(status);
      return Response.json({});
    }
    if (path.endsWith('/test/retention-check')) {
      await this.checkRetention();
      return Response.json(this.state);
    }
    if (path.endsWith('/test/retention-evidence')) {
      await this.ctx.storage.put('cf:chat:retention-test', { text: 'private history' });
      await this.ctx.storage.put('__cf_chat_turn_snapshot:retention-test', {
        text: 'private history',
      });
      const id = crypto.randomUUID();
      await this.env.BACKUP_BUCKET.put(`backups/${id}/data.sqsh`, 'private checkpoint');
      await this.env.BACKUP_BUCKET.put(`backups/${id}/meta.json`, '{}');
      this.saveState({
        ...this.state,
        obsoleteCheckpoints: [...(this.state.obsoleteCheckpoints ?? []), id],
      });
      return Response.json({});
    }
    if (path.endsWith('/test/retention-inspect')) {
      const sql = retentionSql.split('-- BLOCK counts\n')[1];
      const api = (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name);
      return Response.json({
        counts: this.ctx.storage.sql.exec(sql).toArray(),
        messages: this.messages.length,
        recovery: !!(await this.ctx.storage.get('__cf_chat_turn_snapshot:retention-test')),
        releases: await api.releasedAuthorizations(),
        settlements: await api.settlements(),
      });
    }
    if (path.endsWith('/test/fail-checkpoint-delete')) {
      const { attempts, skip = 0 } = await request.json<{ attempts: number; skip?: number }>();
      await this.ctx.storage.put('fixtureDeleteFailures', attempts);
      await this.ctx.storage.put('fixtureDeleteSkip', skip);
      return Response.json({});
    }
    if (path.endsWith('/test/error-shape')) {
      try {
        await this.fixture().structuredFailure();
      } catch (error) {
        return Response.json({
          name: error instanceof Error ? error.name : null,
          diagnosis: cleanupError('backup', error),
        });
      }
    }
    if (path.endsWith('/test/receipt-volume')) {
      const { executions, rejectedDispatches } =
        await request.json<Pick<CodexState, 'executions' | 'rejectedDispatches'>>();
      this.saveState({ ...this.state, executions, rejectedDispatches });
      return Response.json(this.state);
    }
    if (path.endsWith('/test/pl-origin')) {
      const env = this.env as typeof this.env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> };
      const { origin } = await request.json<{ origin: string }>();
      await env.TestPLAPI.get(env.TestPLAPI.idFromName(this.name)).setPublicationOrigin(origin);
      return Response.json({});
    }
    if (path.endsWith('/test/publication')) {
      const env = this.env as typeof this.env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> };
      const api = env.TestPLAPI.get(env.TestPLAPI.idFromName(this.name));
      await api.complete(await request.json());
      if (this.state.pendingTool) await this.drivePublication({ id: this.state.pendingTool.id });
      return Response.json({});
    }
    if (path.endsWith('/test/drive')) {
      if (this.state.pendingTool) await this.drivePublication({ id: this.state.pendingTool.id });
      return Response.json({});
    }
    if (path.endsWith('/test/launch')) {
      await this.fixture().configureLaunch(await request.json());
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/usage')) {
      await this.fixture().reportUsage(await request.json());
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/host-tool')) {
      const { name, input } = await request.json<{
        name: string;
        input: Record<string, string>;
      }>();
      await this.fixture().requestApproval(name, input);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/approval')) {
      const { count, captureDelay } = await request.json<{
        count?: number;
        captureDelay?: number;
      }>();
      await this.fixture().requestApproval(undefined, undefined, count, captureDelay);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/run')) {
      await this.persistMessages([
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: 'Run fixture.' }],
        },
      ]);
      const response = await this.onChatMessage();
      await response.text();
      return Response.json(this.state);
    }
    if (path.endsWith('/test/advance')) {
      const { milliseconds } = await request.json<{ milliseconds: number }>();
      this.timeOffset += milliseconds;
      // Invoke the actual persisted callbacks with a test clock, not six hours of sleep.
      for (const schedule of this.getSchedules<Parameters<Chat['expireSandbox']>[0]>()) {
        if (schedule.callback === 'expireSandbox' && schedule.time * 1000 <= this.now()) {
          await this.cancelSchedule(schedule.id);
          await this.expireSandbox(schedule.payload);
        }
        if (schedule.callback === 'flushServiceCallbacks' && schedule.time * 1000 <= this.now()) {
          await this.cancelSchedule(schedule.id);
          await this.flushServiceCallbacks();
        }
        if (schedule.callback === 'checkRetention' && schedule.time * 1000 <= this.now()) {
          await this.cancelSchedule(schedule.id);
          await this.checkRetention();
        }
      }
      return Response.json(this.state);
    }
    if (path.endsWith('/test/expire')) {
      const lifecycle = this.state.sandbox!;
      this.timeOffset = lifecycle.lastUserInteractionAt + this.interactionTimeoutMs - Date.now();
      for (const schedule of this.getSchedules<{
        id: string;
        reason: string;
      }>()) {
        if (
          schedule.callback === 'expireSandbox' &&
          schedule.payload.id === lifecycle.id &&
          schedule.payload.reason === 'interaction'
        ) {
          await this.cancelSchedule(schedule.id);
        }
      }
      await this.expireSandbox({ id: lifecycle.id, reason: 'interaction' });
      return Response.json(this.state);
    }
    if (path.endsWith('/test/stale-idle')) {
      await this.expireSandbox({
        id: this.state.sandbox!.id,
        reason: 'idle',
        waitingSince: this.now() - SANDBOX_IDLE_MS,
      });
      return Response.json(this.state);
    }
    if (path.endsWith('/test/expire-old')) {
      const { id } = await request.json<{ id: string }>();
      await this.expireSandbox({ id, reason: 'interaction' });
      return Response.json(this.state);
    }
    if (path.endsWith('/test/steer-behavior')) {
      const { behavior } = await request.json<{
        behavior: 'finish' | 'lose-ack' | 'reject';
      }>();
      await this.fixture().setSteerBehavior(behavior);
      return Response.json({});
    }
    if (path.endsWith('/test/drop-start-ack')) {
      await this.fixture().dropNextStartAck();
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/disconnect')) {
      await this.fixture().disconnect();
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/recover')) {
      await this.onChatRecovery();
      return Response.json(this.state);
    }
    if (path.endsWith('/test/sleep')) {
      await this.fixture().sleep();
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/fail-backup')) {
      await this.fixture().failNextBackup();
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/delay-backup')) {
      const { milliseconds } = z
        .object({ milliseconds: z.number().int().min(0).max(2000) })
        .parse(await request.json());
      await this.fixture().delayBackup(milliseconds);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/fail-destroy')) {
      const { attempts } = await request.json<{ attempts: number }>();
      await this.fixture().failDestroy(attempts);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/ignore-cancel')) {
      await this.fixture().ignoreCancellation();
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/schedules')) return Response.json(this.getSchedules());
    if (path.endsWith('/test/delete-checkpoint')) {
      const id = this.state.checkpoint!.backup.id;
      await this.env.BACKUP_BUCKET.delete([`backups/${id}/data.sqsh`, `backups/${id}/meta.json`]);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/test/backup-objects')) {
      const objects = await this.env.BACKUP_BUCKET.list({ prefix: 'backups/' });
      return Response.json(objects.objects.map((object) => object.key));
    }
    if (path.endsWith('/test/state')) return Response.json(this.state);
    const binding = {
      sandboxId: this.state.sandbox?.id ?? '',
      actionId: this.state.action?.grant.actionId ?? '',
      capacityGrantId: this.state.action?.grant.id ?? '',
    };
    if (path.endsWith('/test/model-reserve')) {
      return Response.json(await this.reserveModelRequest(binding, await request.json()));
    }
    if (path.endsWith('/test/model-grant-delay')) {
      const { milliseconds } = z
        .object({ milliseconds: z.number().int().min(0).max(1000) })
        .parse(await request.json());
      await (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name).delayModelGrant(milliseconds);
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/test/model-dispatch')) {
      const { reservationId } = (await request.json()) as { reservationId: string };
      return Response.json({ sent: await this.dispatchModelRequest(binding, reservationId) });
    }
    if (path.endsWith('/test/model-settle')) {
      await this.settleModelRequest(await request.json());
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/test/settlement-error')) {
      const { enabled } = (await request.json()) as { enabled: boolean };
      await (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name).failSettlement(enabled);
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/test/settlement-delay')) {
      const { milliseconds } = (await request.json()) as { milliseconds: number };
      await (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name).delaySettlement(milliseconds);
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/test/settlement-attempts')) {
      const attempts = await (
        this.env as Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }
      ).TestPLAPI.getByName(this.name).settlementAttempts();
      return Response.json({ attempts });
    }
    if (path.endsWith('/test/budget-stop')) {
      await this.stopForBudget(
        binding,
        'This turn reached its spending limit. Your history is saved. Send a new message to continue.',
      );
      return Response.json({ accepted: true });
    }
    if (path.endsWith('/test/last-backup-id')) {
      return Response.json(await this.fixture().lastBackupId());
    }
    if (path.endsWith('/test/backups')) return Response.json(await this.fixture().backupEvents());
    if (path.endsWith('/test/status')) return Response.json(await this.fixture().inspect());
    return super.onRequest(request);
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/pl/api/course-automation/v1/')) {
      const body = await request.clone().text();
      const scope = await verifyServiceRequest(request, env.PL_SERVICE_TOKEN ?? '', 'pl-api', body);
      if (!scope) return new Response('Unauthorized', { status: 401 });
      return env.TestPLAPI.get(env.TestPLAPI.idFromName(scope.conversationId)).fetch(request);
    }
    if (/^\/v1\/conversations\/[a-f0-9-]+\/test\//.test(url.pathname)) {
      const body = request.method === 'GET' ? '' : await request.clone().text();
      const scope = await verifyServiceRequest(
        request,
        env.PL_SERVICE_TOKEN ?? '',
        'agent-api',
        body,
      );
      if (
        !scope ||
        !url.pathname.startsWith('/v1/conversations/' + scope.conversationId + '/test/')
      ) {
        return new Response('Unauthorized', { status: 401 });
      }
      return (await getAgentByName(env.Chat, scope.conversationId)).fetch(request);
    }
    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env & { TestPLAPI: DurableObjectNamespace<TestPLAPI> }>;
