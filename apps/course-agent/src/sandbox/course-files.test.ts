import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      return value === undefined ? null : { json: async () => JSON.parse(value) };
    },
    put: async (key: string, value: string) => {
      objects.set(key, value);
    },
  };
}

/** A sandbox whose container records the commands it is asked to run. */
function createSandbox(bucket: ReturnType<typeof createBucket>) {
  const commands: string[] = [];
  const stored = new Map<string, unknown>();
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
        setAlarm: async () => {},
        deleteAlarm: async () => {},
      },
    } as unknown as DurableObjectState,
    { SANDBOX_INSTANCE_TYPE: 'standard-2', CHECKPOINTS: bucket } as unknown as Env,
  );
  return { sandbox, commands, container };
}

/** Start a conversation's sandbox and report which commands it ran to get the course files. */
async function startConversation(bucket: ReturnType<typeof createBucket>) {
  const { sandbox, commands } = createSandbox(bucket);
  await sandbox.addCourseFiles(course);
  return commands;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('a new conversation on a large GitHub course', () => {
  beforeEach(() => {
    // Only slow clones are saved. Each clock reading is a minute after the last, so every clone
    // here counts as slow.
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 60_000));
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
});

describe('a sandbox started while the first message is typed', () => {
  it('is used by the conversation that sends the message, loading the course once', async () => {
    const { sandbox, commands } = createSandbox(createBucket());
    await sandbox.warmUp(course);
    expect(await sandbox.claim(course, 'conversation')).toBe(true);
    expect(await sandbox.prepare(course, null)).toMatchObject({ prewarmed: true });
    await sandbox.addCourseFiles(course);
    expect(commands.filter((command) => command === clone)).toHaveLength(1);
  });

  it('is not given to another branch or to a second conversation', async () => {
    const { sandbox } = createSandbox(createBucket());
    await sandbox.warmUp(course);
    expect(await sandbox.claim({ ...course, branch: 'other' }, 'conversation')).toBe(false);
    expect(await sandbox.claim(course, 'conversation')).toBe(true);
    expect(await sandbox.claim(course, 'another conversation')).toBe(false);
  });

  it('removes itself if the message is never sent', async () => {
    const { sandbox, container } = createSandbox(createBucket());
    await sandbox.warmUp(course);
    await sandbox.alarm();
    expect(container.running).toBe(false);
    expect(await sandbox.claim(course, 'conversation')).toBe(false);
  });
});
