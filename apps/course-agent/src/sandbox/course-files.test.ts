import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CourseSandbox } from './sandbox.js';

const archives = vi.hoisted(() => ({ backup: vi.fn(), restore: vi.fn(), delete: vi.fn() }));

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
    backup = archives.backup;
    restore = archives.restore;
    delete = archives.delete;
  },
}));
vi.mock('../monitoring.js', () => ({ logEvent: vi.fn(), reportError: vi.fn() }));

const source = { type: 'github' as const, repository: 'Org/course', branch: 'main' };
const clone =
  'git clone --depth 1 --single-branch --branch main -- http://repository.internal/Org/course.git /workspace/session/course';
const snapshotKey = 'repository-snapshots/org/course@main.json';
const gitDirectory = { dir: '/workspace/session/course/.git' };

/** The bucket every sandbox shares, holding each branch's snapshot record. */
function createBucket() {
  const objects = new Map<string, string>();
  return {
    objects,
    get: async (key: string) => {
      const value = objects.get(key);
      return value === undefined ? null : { json: async () => JSON.parse(value) };
    },
    put: async (key: string, value: string) => {
      objects.set(key, value);
    },
  };
}

/** A sandbox whose container records its commands and takes a minute to clone. */
function createSandbox(bucket: ReturnType<typeof createBucket>) {
  const commands: string[] = [];
  const container = {
    running: false,
    exec: async (args: string[]) => {
      commands.push(args.join(' '));
      if (args[1] === 'clone') vi.setSystemTime(Date.now() + 60_000);
      return { output: async () => ({ exitCode: 0, stdout: new Uint8Array() }) };
    },
  };
  const sandbox = new CourseSandbox(
    {
      container,
      exports: {},
      blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
    } as unknown as DurableObjectState,
    { CHECKPOINTS: bucket } as unknown as Env,
  );
  return { sandbox, commands };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('saves a snapshot of a slow clone, which the next sandbox on the branch restores', async () => {
  const bucket = createBucket();
  archives.backup.mockResolvedValueOnce({ id: 'saved' });
  const first = createSandbox(bucket);
  expect(await first.sandbox.addCourseFiles(source)).toMatchObject({ source: 'clone' });
  expect(archives.backup).toHaveBeenCalledWith(gitDirectory);

  const second = createSandbox(bucket);
  expect(await second.sandbox.addCourseFiles(source)).toMatchObject({ source: 'snapshot' });
  expect(archives.restore).toHaveBeenCalledWith({ id: 'saved' }, gitDirectory);
  expect(second.commands).not.toContain(clone);
});

it('clones when the snapshot cannot be restored, and replaces it', async () => {
  const bucket = createBucket();
  bucket.objects.set(snapshotKey, JSON.stringify({ id: 'damaged' }));
  archives.restore.mockRejectedValueOnce(new Error('BACKUP_NOT_FOUND'));
  archives.backup.mockResolvedValueOnce({ id: 'replacement' });
  const { sandbox, commands } = createSandbox(bucket);
  expect(await sandbox.addCourseFiles(source)).toMatchObject({ source: 'clone' });
  expect(commands).toEqual([
    'mkdir /workspace/session/course',
    'rm -rf /workspace/session/course',
    clone,
    'chown root:root /workspace/session',
  ]);
  expect(bucket.objects.get(snapshotKey)).toBe(JSON.stringify({ id: 'replacement' }));
  expect(archives.delete).toHaveBeenCalledWith({ id: 'damaged' });
});
