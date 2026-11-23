import { afterEach, describe, expect, it, vi } from 'vitest';

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

const course = { type: 'github' as const, repository: 'Org/course', branch: 'main' };
const clone =
  'git clone --depth 1 --single-branch --branch main -- http://repository.internal/Org/course.git /workspace/session/course';

/** The bucket all sandboxes share. */
function createBucket() {
  const objects = new Map<string, string>();
  return {
    get: async (key: string) => {
      const value = objects.get(key);
      return value === undefined ? null : { etag: 'etag', json: async () => JSON.parse(value) };
    },
    put: async (key: string, value: string) => {
      objects.set(key, value);
      return {};
    },
  };
}

/** Start a conversation's sandbox and report which commands it ran to get the course files. */
async function startConversation(bucket: ReturnType<typeof createBucket>, courseId = '1') {
  const commands: string[] = [];
  const container = {
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
    { CHECKPOINTS: bucket } as unknown as Env,
  );
  await sandbox.addCourseFiles(course, courseId);
  return commands;
}

describe('a new conversation on a GitHub course', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('clones the first time and restores the saved copy the next time', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValue({ id: 'saved copy' });

    expect(await startConversation(bucket)).toContain(clone);

    expect(await startConversation(bucket)).not.toContain(clone);
    expect(archives.restore).toHaveBeenCalledWith({ id: 'saved copy' }, expect.anything());
  });

  it('still starts when the saved copy is damaged, and replaces it', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValueOnce({ id: 'damaged copy' });
    await startConversation(bucket);

    archives.restore.mockRejectedValueOnce(new Error('BACKUP_INTEGRITY'));
    archives.backup.mockResolvedValueOnce({ id: 'new copy' });
    expect(await startConversation(bucket)).toContain(clone);
    expect(archives.delete).toHaveBeenCalledWith({ id: 'damaged copy' });

    await startConversation(bucket);
    expect(archives.restore).toHaveBeenLastCalledWith({ id: 'new copy' }, expect.anything());
  });

  it('does not share a copy with another course that uses the same repository', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValue({ id: 'saved copy' });
    await startConversation(bucket, '1');

    expect(await startConversation(bucket, '2')).toContain(clone);
  });
});
