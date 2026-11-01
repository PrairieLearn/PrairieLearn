import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  },
}));

it('uses the approved local contents as the base for the next review', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pl-local-review-'));
  const course = directory;
  const git = async (...args: string[]) => (await execa('git', args, { cwd: directory })).stdout;
  try {
    await git('init', '--initial-branch=local');
    await writeFile(path.join(course, 'question.html'), 'A');
    await git('add', 'question.html');
    await git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Source',
    );
    const commit = await git('rev-parse', 'HEAD');
    await writeFile(path.join(course, 'question.html'), 'B');
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
    const source = { type: 'local' as const, archiveKey: 'source', directory: '.' };
    const snapshot = await sandbox.captureReview(source, { commit, files: [] });
    expect(snapshot).toEqual({
      type: 'local',
      additions: [{ path: 'question.html', contents: Buffer.from('B').toString('base64') }],
      deletions: [],
      originals: [{ path: 'question.html', contents: Buffer.from('A').toString('base64') }],
    });
    const baseline = { commit, files: snapshot.additions };
    expect(await sandbox.captureReview(source, baseline)).toEqual({
      type: 'local',
      additions: [],
      deletions: [],
      originals: [],
    });
    await writeFile(path.join(course, 'question.html'), 'C');
    expect(await sandbox.captureReview(source, baseline)).toEqual({
      type: 'local',
      additions: [{ path: 'question.html', contents: Buffer.from('C').toString('base64') }],
      deletions: [],
      originals: [{ path: 'question.html', contents: Buffer.from('B').toString('base64') }],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
