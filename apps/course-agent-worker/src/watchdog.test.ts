import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ destroy: vi.fn(async () => {}) }));
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: () => sandbox }));
import { SandboxInactivityWatchdog } from './watchdog.js';

function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    setAlarm: vi.fn(async (_deadline: number) => {}),
    deleteAlarm: vi.fn(async () => {}),
  };
  const notify = vi.fn(async () => new Response(null, { status: 204 }));
  const watchdog = new SandboxInactivityWatchdog(
    {
      storage,
      blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
    } as unknown as DurableObjectState,
    {
      Sandbox: {},
      COURSE_AGENT_COORDINATOR: { idFromName: () => 'id', get: () => ({ fetch: notify }) },
    } as unknown as ConstructorParameters<typeof SandboxInactivityWatchdog>[1],
  );
  const register = (generation = 1) =>
    watchdog.fetch(
      new Request('https://watchdog/register', {
        method: 'POST',
        body: JSON.stringify({ sandboxId: 'sandbox', generation, timeoutSeconds: 60 }),
      }),
    );
  const activity = () =>
    watchdog.fetch(new Request('https://watchdog/activity', { method: 'POST' }));
  return { watchdog, storage, notify, register, activity };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('independent sandbox inactivity watchdog', () => {
  it('destroys without depending on the coordinator or a backup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { watchdog, register, notify } = fixture();
    await register();
    notify.mockRejectedValue(new Error('Coordinator unavailable'));
    vi.setSystemTime(60_000);
    await expect(watchdog.alarm()).rejects.toThrow('Coordinator unavailable');
    expect(sandbox.destroy).toHaveBeenCalledOnce();
    notify.mockResolvedValue(new Response(null, { status: 204 }));
    await watchdog.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });
  it('reschedules from real activity, but not from diagnostic reads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { watchdog, register, activity, storage } = fixture();
    await register();
    vi.setSystemTime(30_000);
    await activity();
    vi.setSystemTime(60_000);
    await watchdog.fetch(new Request('https://watchdog/status'));
    await watchdog.alarm();
    expect(storage.setAlarm).toHaveBeenLastCalledWith(90_000);
    expect(sandbox.destroy).not.toHaveBeenCalled();
    vi.setSystemTime(90_000);
    await watchdog.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });
  it('rejects stale generation registration and stale disarming', async () => {
    const { watchdog, register, storage } = fixture();
    await register(2);
    expect((await register(1)).status).toBe(409);
    await watchdog.fetch(
      new Request('https://watchdog/disarm', {
        method: 'POST',
        body: JSON.stringify({ generation: 1 }),
      }),
    );
    expect(storage.deleteAlarm).not.toHaveBeenCalled();
  });
  it('rejects activity after destruction', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { watchdog, register, activity } = fixture();
    await register();
    vi.setSystemTime(60_000);
    await watchdog.alarm();
    expect((await activity()).status).toBe(409);
  });
  it('does not renew activity merely because the coordinator retries startup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { watchdog, register } = fixture();
    await register();
    vi.setSystemTime(30_000);
    await register(2);
    vi.setSystemTime(60_000);
    await watchdog.alarm();
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });
  it('does not clear the next generation alarm after a delayed shutdown notification', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { watchdog, register, storage, notify } = fixture();
    await register();
    let finish!: () => void;
    notify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }));
        }),
    );
    vi.setSystemTime(60_000);
    const alarm = watchdog.alarm();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
    await register(2);
    finish();
    await alarm;
    expect(storage.deleteAlarm).not.toHaveBeenCalled();
  });
});
