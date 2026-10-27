import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
  ReviewSnapshotSchema,
} from '@prairielearn/course-agent-types';

import { captureReviewScript } from './review-snapshot.js';

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
    await writeFile(path.join(dir, 'binary.dat'), Buffer.from([0, 255, 17, 0]));
    const index = git('write-tree');
    const snapshot = () =>
      ReviewSnapshotSchema.parse({
        ...JSON.parse(
          execFileSync(
            process.execPath,
            [
              '-e',
              captureReviewScript,
              dir,
              'master',
              String(MAX_REVIEW_FILE_BYTES),
              String(MAX_REVIEW_BYTES),
            ],
            { encoding: 'utf8', stdio: 'pipe' },
          ),
        ),
        repository: 'PrairieLearn/course',
        branch: 'master',
      });
    const frozen = snapshot();
    expect(frozen.baseCommit).toBe(base);
    expect(git('write-tree')).toBe(index);
    expect(frozen.deletions).toEqual([{ path: 'delete.txt' }]);
    const files = new Map(
      frozen.additions.map((file) => [file.path, Buffer.from(file.contents, 'base64')]),
    );
    expect(files.get('edit.txt')!.toString()).toBe('unstaged\n');
    expect(files.get('committed.txt')!.toString()).toBe('local commit\n');
    expect(files.get('new file.txt')!.toString()).toBe('new\n');
    expect(files.get('binary.dat')).toEqual(Buffer.from([0, 255, 17, 0]));
    await writeFile(path.join(dir, 'edit.txt'), 'later edit\n');
    expect(files.get('edit.txt')!.toString()).toBe('unstaged\n');
    await chmod(path.join(dir, 'edit.txt'), 0o755);
    expect(() => snapshot()).toThrow('File mode changes are not supported');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
