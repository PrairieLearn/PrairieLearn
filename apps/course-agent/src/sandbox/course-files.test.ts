import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import { describe, expect, it, vi } from 'vitest';

import { CourseSandbox } from './sandbox.js';

const restore = vi.hoisted(() => vi.fn());

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: DurableObjectState,
      readonly env: Env,
    ) {}
  },
  WorkerEntrypoint: vi.fn(),
}));
vi.mock('@cloudflare/sandbox', () => ({
  DirectoryBackup: class {
    restore = restore;
  },
}));
vi.mock('../monitoring.js', () => ({ logEvent: vi.fn(), reportError: vi.fn() }));

const source = { type: 'github' as const, repository: 'Org/course', branch: 'main' };
const clone =
  'git clone --depth 1 --single-branch --branch main -- http://repository.internal/Org/course.git /workspace/session/course';

/** A sandbox whose container records the commands it is asked to run. */
function createSandbox(snapshot: DirectoryBackupRecord | null) {
  const commands: string[] = [];
  const stored = new Map<string, unknown>();
  let alarm: number | null = null;
  const container = {
    running: false,
    images: {},
    start() {
      container.running = true;
    },
    async destroy() {
      container.running = false;
    },
    setInactivityTimeout: async () => {},
    interceptOutboundHttp: async () => {},
    exec: async (args: string[]) => {
      commands.push(args.join(' '));
      return { output: async () => ({ exitCode: 0, stdout: new Uint8Array() }) };
    },
  };
  const sandbox = new CourseSandbox(
    {
      container,
      exports: { CourseAgentGitHubOutbound: () => ({}) },
      blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
      waitUntil: () => {},
      storage: {
        kv: {
          get: (key: string) => stored.get(key),
          put: stored.set.bind(stored),
          delete: stored.delete.bind(stored),
        },
        setAlarm: async (time: number) => {
          alarm = time;
        },
        deleteAlarm: async () => {
          alarm = null;
        },
      },
    } as unknown as DurableObjectState,
    {
      SANDBOX_INSTANCE_TYPE: 'standard-2',
      RepositorySnapshot: { getByName: () => ({ current: async () => snapshot }) },
    } as unknown as Env,
  );
  return { sandbox, commands, container, hasAlarm: () => alarm !== null };
}

it('clones when the snapshot cannot be restored', async () => {
  const { sandbox, commands } = createSandbox({ id: 'snapshot' } as DirectoryBackupRecord);
  restore.mockRejectedValueOnce(new Error('BACKUP_NOT_FOUND'));
  expect(await sandbox.addCourseFiles(source)).toEqual({ source: 'clone' });
  expect(commands).toEqual([
    'mkdir /workspace/session/course',
    'rm -rf /workspace/session/course',
    clone,
    'chown root:root /workspace/session',
  ]);
});

describe('a sandbox warmed before its conversation exists', () => {
  it('is adopted mid-warm-up by the conversation that claims it, loading the course once', async () => {
    const { sandbox, commands, hasAlarm } = createSandbox(null);
    await sandbox.warmUp(source);
    expect(await sandbox.claim(source, 'conversation')).toBe(true);
    expect(await sandbox.prepare(source, null)).toMatchObject({ prewarmed: true });
    expect(hasAlarm()).toBe(false);
    expect(await sandbox.addCourseFiles(source)).toEqual({ source: 'clone' });
    expect(commands.filter((command) => command === clone)).toHaveLength(1);
  });

  it('cannot be claimed for another branch or by a second conversation', async () => {
    const { sandbox } = createSandbox(null);
    await sandbox.warmUp(source);
    expect(await sandbox.claim({ ...source, branch: 'other' }, 'conversation')).toBe(false);
    expect(await sandbox.claim(source, 'conversation')).toBe(true);
    expect(await sandbox.claim(source, 'another conversation')).toBe(false);
  });

  it('removes itself when no conversation adopts it, leaving the ID usable for a cold start', async () => {
    const { sandbox, commands, container } = createSandbox(null);
    await sandbox.warmUp(source);
    await vi.waitFor(() => expect(commands).toContain('chown root:root /workspace/session'));
    await sandbox.alarm();
    expect(container.running).toBe(false);
    expect(await sandbox.claim(source, 'conversation')).toBe(false);
    expect(await sandbox.prepare(source, null)).toMatchObject({ prewarmed: false });
  });
});
