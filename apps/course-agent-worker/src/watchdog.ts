import { getSandbox } from '@cloudflare/sandbox';
import { z } from 'zod';

import type { Sandbox } from './index.js';

const RegistrationSchema = z.object({
  sandboxId: z.string(),
  generation: z.number().int().positive(),
  timeoutSeconds: z.number().int().min(60).max(86_400),
});
interface WatchdogState extends z.infer<typeof RegistrationSchema> {
  lastActivityAt: number;
  stopped: boolean;
  expired?: boolean;
}
interface WatchdogEnv {
  Sandbox: DurableObjectNamespace<Sandbox>;
  COURSE_AGENT_COORDINATOR: DurableObjectNamespace;
  COURSE_AGENT_WATCHDOG: DurableObjectNamespace;
}

export function watchdogStub(env: WatchdogEnv, containerId: string) {
  return env.COURSE_AGENT_WATCHDOG.get(env.COURSE_AGENT_WATCHDOG.idFromName(containerId));
}

export async function recordSandboxActivity(env: WatchdogEnv, containerId: string) {
  const response = await watchdogStub(env, containerId).fetch('https://watchdog/activity', {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Sandbox inactivity watchdog is not armed');
}

/** Independent of coordinator alarms and sandbox SDK requests. No public route exposes this DO. */
export class SandboxInactivityWatchdog {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: WatchdogEnv,
  ) {}

  async fetch(request: Request) {
    return this.state.blockConcurrencyWhile(async () => {
      const path = new URL(request.url).pathname;
      const current = await this.state.storage.get<WatchdogState>('watchdog');
      if (path === '/register' && request.method === 'POST') {
        const registration = RegistrationSchema.parse(await request.json());
        if (current && registration.generation < current.generation) {
          return new Response('Stale generation', { status: 409 });
        }
        if (current?.generation === registration.generation) return Response.json(current);
        // Coordinator retries/generation changes are housekeeping, not agent activity.
        const next = {
          ...registration,
          lastActivityAt: current && !current.stopped ? current.lastActivityAt : Date.now(),
          stopped: false,
        };
        await this.state.storage.put('watchdog', next);
        await this.state.storage.setAlarm(next.lastActivityAt + next.timeoutSeconds * 1000);
        return Response.json(next);
      }
      if (path === '/activity' && request.method === 'POST') {
        if (!current || current.stopped) return new Response('Sandbox stopped', { status: 409 });
        // Coalesce event bursts without periodically poking the sandbox itself.
        if (Date.now() - current.lastActivityAt >= 1000) {
          current.lastActivityAt = Date.now();
          await this.state.storage.put('watchdog', current);
        }
        return new Response(null, { status: 204 });
      }
      if (path === '/status') return Response.json(current ?? null);
      if (path === '/disarm' && request.method === 'POST') {
        const { generation } = RegistrationSchema.pick({ generation: true }).parse(
          await request.json(),
        );
        if (current?.generation === generation) {
          await this.state.storage.put('watchdog', { ...current, stopped: true, expired: false });
          await this.state.storage.deleteAlarm();
        }
        return new Response(null, { status: 204 });
      }
      return new Response('Not found', { status: 404 });
    });
  }

  async alarm() {
    const stopped = await this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get<WatchdogState>('watchdog');
      if (!current || (current.stopped && !current.expired)) return null;
      const deadline = current.lastActivityAt + current.timeoutSeconds * 1000;
      if (!current.stopped && deadline > Date.now()) {
        await this.state.storage.setAlarm(deadline);
        return null;
      }
      // Retry failed destruction/notification, but never block destruction on a backup.
      await this.state.storage.setAlarm(Date.now() + 60_000);
      if (!current.stopped) {
        await getSandbox(this.env.Sandbox, current.sandboxId, {
          normalizeId: true,
          keepAlive: false,
        }).destroy();
        current.stopped = true;
        current.expired = true;
        await this.state.storage.put('watchdog', current);
      }
      return current;
    });
    if (!stopped) return;
    // The coordinator may be unavailable or call this object while recovering. Never hold
    // the watchdog's concurrency gate while notifying it, or block a newer generation.
    const coordinator = this.env.COURSE_AGENT_COORDINATOR.get(
      this.env.COURSE_AGENT_COORDINATOR.idFromName(stopped.sandboxId),
    );
    const response = await coordinator.fetch('https://coordinator/inactivity-expired', {
      method: 'POST',
      body: JSON.stringify({ generation: stopped.generation }),
    });
    if (response.ok) {
      await this.state.blockConcurrencyWhile(async () => {
        const current = await this.state.storage.get<WatchdogState>('watchdog');
        if (current?.generation === stopped.generation && current.expired) {
          await this.state.storage.deleteAlarm();
        }
      });
    }
  }
}
