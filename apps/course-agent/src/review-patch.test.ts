import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { freezeReviewScript } from './review-patch.js';

it('round-trips local commits, staged and unstaged edits, additions, deletions, modes, and binary files without changing the native index', async () => {
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
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    await writeFile(path.join(dir, 'committed.txt'), 'local commit\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'local');
    await writeFile(path.join(dir, 'edit.txt'), 'staged\n');
    git('add', 'edit.txt');
    await writeFile(path.join(dir, 'edit.txt'), 'unstaged\n');
    await chmod(path.join(dir, 'edit.txt'), 0o755);
    await unlink(path.join(dir, 'delete.txt'));
    await writeFile(path.join(dir, 'new file.txt'), 'new\n');
    await writeFile(path.join(dir, 'binary.dat'), Buffer.from([0, 255, 17, 0]));
    const index = git('write-tree');
    const patchFile = path.join(dir, '..', `${path.basename(dir)}.patch`);
    try {
      await writeFile(
        patchFile,
        execFileSync('sh', ['-ec', freezeReviewScript, 'review', base, dir]),
      );
      const patch = await readFile(patchFile, 'utf8');
      expect(patch).toContain('GIT binary patch');
      expect(git('write-tree')).toBe(index);
      const expected = git('status', '--porcelain');
      await writeFile(
        patchFile,
        execFileSync('sh', ['-ec', freezeReviewScript, 'review', base, dir]),
      );
      expect(await readFile(patchFile, 'utf8')).toBe(patch);
      expect(git('status', '--porcelain')).toBe(expected);
      git('reset', '--hard', base);
      git('clean', '-fd');
      git('apply', '--index', patchFile);
      expect(await readFile(path.join(dir, 'edit.txt'), 'utf8')).toBe('unstaged\n');
      expect(await readFile(path.join(dir, 'committed.txt'), 'utf8')).toBe('local commit\n');
      expect(await readFile(path.join(dir, 'new file.txt'), 'utf8')).toBe('new\n');
      expect(await readFile(path.join(dir, 'binary.dat'))).toEqual(Buffer.from([0, 255, 17, 0]));
      expect(git('ls-files', '--stage', 'edit.txt')).toMatch(/^100755 /);
      expect(git('ls-files', 'delete.txt')).toBe('');
    } finally {
      await rm(patchFile, { force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
