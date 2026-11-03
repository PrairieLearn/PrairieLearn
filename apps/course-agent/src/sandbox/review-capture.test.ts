import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { expect, it, vi } from 'vitest';

import { CourseSandbox } from './sandbox.js';

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
  DirectoryBackup: vi.fn(),
  SandboxFileError: { is: (error: NodeJS.ErrnoException) => error.code === 'ENOENT' },
  Files: class {
    constructor(private container: { course: string }) {}
    async lstat(file: string) {
      const stat = await lstat(path.join(this.container.course, file));
      return { type: stat.isFile() ? 'file' : 'other', mode: stat.mode, size: BigInt(stat.size) };
    }

    async readFile(file: string) {
      return new Response(await readFile(path.join(this.container.course, file)));
    }

    async writeFile(file: string, contents: Buffer) {
      await writeFile(file, contents);
    }
  },
}));

it('uses the saved local contents as the base for the next review', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pl-local-review-'));
  // Local sandboxes reach the course through a link into a subdirectory of the repository.
  const course = path.join(directory, 'course');
  const git = async (...args: string[]) => (await execa('git', args, { cwd: directory })).stdout;
  const base64 = (text: string) => Buffer.from(text).toString('base64');
  try {
    await git('init', '--initial-branch=local');
    await mkdir(course);
    await writeFile(path.join(course, 'question.html'), 'A');
    await writeFile(path.join(course, 'old.html'), 'old');
    await git('add', '--all');
    await git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Source',
    );
    await git('update-ref', 'refs/prairielearn/saved', 'HEAD');
    const head = await git('rev-parse', 'HEAD');
    await writeFile(path.join(course, 'question.html'), 'B');
    await rm(path.join(course, 'old.html'));
    const container = {
      course,
      running: false,
      exec: async (args: string[]) => ({
        output: async () => {
          const result = await execa(
            args[0],
            args.slice(1).map((arg) => arg.replace('/workspace/session/course', course)),
            {
              encoding: 'buffer',
              reject: false,
              stripFinalNewline: false,
            },
          );
          return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
        },
      }),
    };
    const sandbox = new CourseSandbox(
      {
        container,
        blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
      } as unknown as DurableObjectState,
      {} as Env,
    );
    const source = { type: 'local' as const, archiveKey: 'source', directory: 'course' };
    const snapshot = await sandbox.captureReview(source);
    expect(snapshot).toEqual({
      type: 'local',
      additions: [{ path: 'question.html', contents: base64('B') }],
      deletions: [{ path: 'old.html' }],
    });
    // A write after capture must still be proposed: only the approved bytes were saved.
    await writeFile(path.join(course, 'question.html'), 'C');
    await sandbox.advanceLocalBaseline([
      ...snapshot.additions,
      ...snapshot.deletions.map(({ path }) => ({ path, contents: null })),
    ]);
    expect(await git('ls-tree', '-r', '--name-only', 'refs/prairielearn/saved')).toBe(
      'course/question.html',
    );
    expect(await git('show', 'refs/prairielearn/saved:course/question.html')).toBe('B');
    expect(await sandbox.captureReview(source)).toEqual({
      type: 'local',
      additions: [{ path: 'question.html', contents: base64('C') }],
      deletions: [],
    });
    // The agent's checkout is untouched: its commit and unstaged edits remain.
    expect(await git('rev-parse', 'HEAD')).toBe(head);
    expect(await git('status', '--porcelain')).toBe(' D course/old.html\n M course/question.html');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
