import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import { beforeEach, expect, it, vi } from 'vitest';

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
// The SDK imports `cloudflare:workers`, which only resolves in the Workers runtime.
vi.mock('@cloudflare/sandbox', () => ({
  DirectoryBackup: class {
    restore = restore;
  },
  SandboxBackupError: { is: (error: Error) => error.name === 'SandboxBackupError' },
}));

const source = {
  type: 'github' as const,
  repository: 'PrairieLearn/course',
  branch: 'master',
  model: 'test',
};

const checkpoint: DirectoryBackupRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  dir: '/workspace/session',
  size: 1,
  sha256: '0'.repeat(64),
  format: 'tar+zstd/1',
};

function backupError(code: 'BACKUP_NOT_FOUND' | 'BACKUP_TRANSFER') {
  return Object.assign(new Error(code), { name: 'SandboxBackupError', code });
}

function createSandbox() {
  const commands: string[][] = [];
  const container = {
    running: false,
    images: { courseAgent: 'image' },
    start: vi.fn(),
    setInactivityTimeout: vi.fn(),
    interceptOutboundHttp: vi.fn(),
    exec: async (args: string[]) => {
      commands.push(args);
      return {
        output: async () => ({ stdout: new Uint8Array(), stderr: new Uint8Array(), exitCode: 0 }),
      };
    },
  };
  const sandbox = new CourseSandbox(
    {
      container,
      exports: { CourseAgentGitHubOutbound: vi.fn(), DirectoryBackupGateway: vi.fn() },
      blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
    } as unknown as DurableObjectState,
    { SANDBOX_INSTANCE_TYPE: 'standard-2' } as Env,
  );
  return { sandbox, commands };
}

beforeEach(() => {
  restore.mockReset();
});

it('prepares an empty workspace when the checkpoint object no longer exists', async () => {
  restore.mockRejectedValue(backupError('BACKUP_NOT_FOUND'));
  const { sandbox, commands } = createSandbox();
  expect(await sandbox.prepare(source, checkpoint)).toEqual({
    instance: 'standard-2',
    checkpointMissing: true,
  });
  // The workspace stays unlocked for addCourseFiles(), as when there is no checkpoint.
  expect(commands.map(([command]) => command)).toEqual(['install']);
});

it.each([
  { failure: 'a failed transfer', error: backupError('BACKUP_TRANSFER') },
  { failure: 'an unrecognized error', error: new Error('Network connection lost') },
])('fails without reporting the checkpoint missing after $failure', async ({ error }) => {
  restore.mockRejectedValue(error);
  const { sandbox } = createSandbox();
  await expect(sandbox.prepare(source, checkpoint)).rejects.toBe(error);
});
