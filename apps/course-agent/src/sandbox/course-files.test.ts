import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import { expect, it, vi } from 'vitest';

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

/** A sandbox whose container records the commands it is asked to run. */
function createSandbox(snapshot: DirectoryBackupRecord | null) {
  const commands: string[] = [];
  const container = {
    running: false,
    exec: async (args: string[]) => {
      commands.push(args.join(' '));
      return { output: async () => ({ exitCode: 0, stdout: new Uint8Array() }) };
    },
  };
  const sandbox = new CourseSandbox(
    {
      container,
      exports: {},
      blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
    } as unknown as DurableObjectState,
    {
      RepositorySnapshot: { getByName: () => ({ current: async () => snapshot }) },
    } as unknown as Env,
  );
  return { sandbox, commands };
}

it('checks out the branch tip from a restored snapshot instead of cloning', async () => {
  const snapshot = { id: 'snapshot' } as DirectoryBackupRecord;
  const { sandbox, commands } = createSandbox(snapshot);
  restore.mockResolvedValueOnce(undefined);
  expect(await sandbox.addCourseFiles(source)).toMatchObject({ source: 'snapshot' });
  expect(restore).toHaveBeenCalledWith(snapshot, { dir: '/workspace/session/course/.git' });
  expect(commands).toEqual([
    'mkdir /workspace/session/course',
    'git -C /workspace/session/course fetch --depth 1 origin main',
    'git -C /workspace/session/course reset --hard refs/remotes/origin/main',
    'chown root:root /workspace/session',
  ]);
});

it('clones when the snapshot cannot be restored', async () => {
  const { sandbox, commands } = createSandbox({ id: 'snapshot' } as DirectoryBackupRecord);
  restore.mockRejectedValueOnce(new Error('BACKUP_NOT_FOUND'));
  expect(await sandbox.addCourseFiles(source)).toEqual({ source: 'clone' });
  expect(commands).toEqual([
    'mkdir /workspace/session/course',
    'rm -rf /workspace/session/course',
    'git clone --depth 1 --single-branch --branch main -- http://repository.internal/Org/course.git /workspace/session/course',
    'chown root:root /workspace/session',
  ]);
});
