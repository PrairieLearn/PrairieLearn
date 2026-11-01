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
  },
}));

it('captures local edits relative to the saved baseline without changing working files or staging', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pl-local-review-'));
  const course = path.join(directory, 'nested-course');
  const git = async (...args: string[]) => (await execa('git', args, { cwd: directory })).stdout;
  try {
    await mkdir(course);
    await git('init', '--initial-branch=local');
    await writeFile(path.join(course, '.gitattributes'), '* text eol=lf\n');
    await writeFile(
      path.join(directory, '.git/info/attributes'),
      '* -text -filter -ident -working-tree-encoding\n',
    );
    await writeFile(path.join(course, 'question.html'), 'Original\r\n');
    await writeFile(path.join(course, 'old.txt'), 'Delete me');
    await git('-c', 'core.autocrlf=false', 'add', '.');
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
    await writeFile(path.join(course, 'question.html'), 'Reviewed\r\n');
    await writeFile(path.join(course, 'new.bin'), Buffer.from([0, 255]));
    await rm(path.join(course, 'old.txt'));
    await git('add', '.');
    const index = await git('write-tree');
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
    const source = { type: 'local' as const, archiveKey: 'source', directory: 'nested-course' };
    const snapshot = await sandbox.captureReview(source, { commit, files: [] });
    expect(snapshot).toMatchObject({
      type: 'local',
      additions: [
        { path: 'new.bin', contents: 'AP8=' },
        { path: 'question.html', contents: Buffer.from('Reviewed\r\n').toString('base64') },
      ],
      deletions: [{ path: 'old.txt' }],
      originals: expect.arrayContaining([
        { path: 'question.html', contents: Buffer.from('Original\r\n').toString('base64') },
      ]),
    });
    // Applying the approved snapshot advances the baseline, not the agent's current HEAD.
    const files = [
      ...snapshot.additions,
      ...snapshot.deletions.map(({ path }) => ({ path, contents: null })),
    ];
    expect(await sandbox.captureReview(source, { commit, files })).toEqual({
      type: 'local',
      additions: [],
      deletions: [],
      originals: [],
    });
    await writeFile(path.join(course, 'question.html'), 'Next edit');
    expect(await sandbox.captureReview(source, { commit, files })).toMatchObject({
      additions: [{ path: 'question.html', contents: Buffer.from('Next edit').toString('base64') }],
      originals: [
        { path: 'question.html', contents: Buffer.from('Reviewed\r\n').toString('base64') },
      ],
    });
    expect(await git('write-tree')).toBe(index);
    expect(await readFile(path.join(course, 'question.html'), 'utf8')).toBe('Next edit');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
