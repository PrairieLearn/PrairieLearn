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

/** The bucket all sandboxes share, honouring the conditional writes R2 supports. */
function createBucket() {
  const objects = new Map<string, { value: string; etag: string; uploaded: Date }>();
  let version = 0;
  return {
    get: async (key: string) => {
      const object = objects.get(key);
      return object === undefined
        ? null
        : { ...object, json: async () => JSON.parse(object.value) };
    },
    put: async (
      key: string,
      value: string,
      { onlyIf }: { onlyIf: Headers | { etagMatches: string } },
    ) => {
      const current = objects.get(key);
      const allowed =
        onlyIf instanceof Headers ? current === undefined : current?.etag === onlyIf.etagMatches;
      if (!allowed) return null;
      objects.set(key, { value, etag: String(++version), uploaded: new Date() });
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
    vi.useRealTimers();
  });

  it('clones the first time and restores the saved copy the next time', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValue({ id: 'saved copy' });

    expect(await startConversation(bucket)).toContain(clone);

    const restore = await startConversation(bucket);
    expect(restore).not.toContain(clone);
    expect(restore).toEqual(
      expect.arrayContaining([
        'git -C /workspace/session/course fetch --depth 1 origin +refs/heads/main:refs/remotes/origin/main',
        'git -C /workspace/session/course reset --hard refs/remotes/origin/main',
      ]),
    );
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

  it('replaces a saved copy once it is too old', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValueOnce({ id: 'old copy' });
    await startConversation(bucket);

    vi.useFakeTimers({ now: Date.now() + 15 * 24 * 60 * 60 * 1000, toFake: ['Date'] });
    archives.backup.mockResolvedValueOnce({ id: 'new copy' });
    expect(await startConversation(bucket)).toContain(clone);
    expect(archives.restore).not.toHaveBeenCalled();
    expect(archives.delete).toHaveBeenCalledWith({ id: 'old copy' });
  });

  it('keeps the first replacement when two conversations replace a damaged copy at once', async () => {
    const bucket = createBucket();
    archives.backup.mockResolvedValueOnce({ id: 'damaged copy' });
    await startConversation(bucket);

    archives.restore.mockRejectedValue(new Error('BACKUP_INTEGRITY'));
    const { promise: secondSaved, resolve: saveSecond } = Promise.withResolvers<undefined>();
    archives.backup.mockResolvedValueOnce({ id: 'first copy' }).mockImplementationOnce(async () => {
      await secondSaved;
      return { id: 'second copy' };
    });
    const first = startConversation(bucket);
    const second = startConversation(bucket);
    await first;
    saveSecond(undefined);
    await second;

    expect(archives.delete).toHaveBeenCalledWith({ id: 'damaged copy' });
    expect(archives.delete).toHaveBeenCalledWith({ id: 'second copy' });
    expect(archives.delete).not.toHaveBeenCalledWith({ id: 'first copy' });
  });
});
