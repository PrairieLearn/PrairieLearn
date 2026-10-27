import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { CourseSandbox } from './sandbox.js';

vi.mock('cloudflare:workers', () => ({ DurableObject: vi.fn(), WorkerEntrypoint: vi.fn() }));
vi.mock('@cloudflare/sandbox', () => ({
  DirectoryBackup: vi.fn(),
  SandboxFileError: { is: (error: unknown) => error instanceof Error && 'code' in error },
  Files: class {
    constructor(private container: { root: string }) {}
    async lstat(file: string) {
      const info = await lstat(path.join(this.container.root, file));
      return {
        type: info.isFile() ? 'file' : info.isSymbolicLink() ? 'symlink' : 'directory',
        size: BigInt(info.size),
        mode: info.mode,
      };
    }

    async readFile(file: string) {
      return new Response(await readFile(path.join(this.container.root, file)));
    }
  },
}));

it('captures local commits and working-tree edits as immutable full files without changing staging', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'course-review-patch-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    await writeFile(path.join(dir, 'edit.txt'), 'original\n');
    await writeFile(path.join(dir, 'delete.txt'), 'delete me\n');
    await writeFile(path.join(dir, 'binary.dat'), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(dir, '.gitignore'), 'ignored.dat\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/master', base);
    await writeFile(path.join(dir, 'committed.txt'), 'local commit\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'local');
    await writeFile(path.join(dir, 'edit.txt'), 'staged\n');
    git('add', 'edit.txt');
    await writeFile(path.join(dir, 'edit.txt'), 'unstaged\n');
    await unlink(path.join(dir, 'delete.txt'));
    await writeFile(path.join(dir, 'new file.txt'), 'new\n');
    await writeFile(path.join(dir, 'ignored.dat'), 'not part of the review\n');
    await writeFile(path.join(dir, 'binary.dat'), Buffer.from([0, 255, 17, 0]));
    const index = git('write-tree');
    const sandbox = {
      container: { root: dir },
      exec: async (args: string[]) => {
        const command = [...args];
        command[command.indexOf('-C') + 1] = dir;
        return { stdout: execFileSync(command[0], command.slice(1), { stdio: 'pipe' }) };
      },
    } as unknown as CourseSandbox;
    const snapshot = () =>
      CourseSandbox.prototype.captureReview.call(sandbox, 'PrairieLearn/course', 'master');
    const frozen = await snapshot();
    expect(frozen.baseCommit).toBe(base);
    expect(git('write-tree')).toBe(index);
    expect(frozen.deletions).toEqual([{ path: 'delete.txt' }]);
    const files = new Map(
      frozen.additions.map((file) => [file.path, Buffer.from(file.contents, 'base64')]),
    );
    expect([...files.keys()].sort()).toEqual([
      'binary.dat',
      'committed.txt',
      'edit.txt',
      'new file.txt',
    ]);
    expect(files.get('edit.txt')!.toString()).toBe('unstaged\n');
    expect(files.get('committed.txt')!.toString()).toBe('local commit\n');
    expect(files.get('new file.txt')!.toString()).toBe('new\n');
    expect(files.get('binary.dat')).toEqual(Buffer.from([0, 255, 17, 0]));
    await writeFile(path.join(dir, 'edit.txt'), 'later edit\n');
    expect(files.get('edit.txt')!.toString()).toBe('unstaged\n');
    await chmod(path.join(dir, 'edit.txt'), 0o755);
    await expect(snapshot()).rejects.toThrow('File mode changes are not supported');
    await chmod(path.join(dir, 'edit.txt'), 0o644);
    await symlink('edit.txt', path.join(dir, 'link.txt'));
    await expect(snapshot()).rejects.toThrow('Unsupported course file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
