import { Chat as ProductionChat } from '../../src/agent.js';
import { cleanupError } from '../../src/cleanup-error.js';
import { type CodexSandbox, type CodexState, SANDBOX_IDLE_MS } from '../../src/codex.js';
import worker from '../../src/worker.js';

import { TestSandbox } from './sandbox.js';

export { TestSandbox };

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
    if (!this.state.repository) {
      this.setState({
        ...this.state,
        repository: { repository: 'example/course', branch: 'main' },
      });
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
        if (schedule.callback === 'expireToolPreparation' && schedule.time * 1000 <= this.now()) {
          await this.cancelSchedule(schedule.id);
          await this.expireToolPreparation({ id: schedule.payload.id });
        }
        if (schedule.callback === 'expireSandbox' && schedule.time * 1000 <= this.now()) {
          await this.cancelSchedule(schedule.id);
          await this.expireSandbox(schedule.payload);
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
    if (path.endsWith('/test/backups')) return Response.json(await this.fixture().backupEvents());
    if (path.endsWith('/test/status')) return Response.json(await this.fixture().inspect());
    return super.onRequest(request);
  }
}
export default worker;
