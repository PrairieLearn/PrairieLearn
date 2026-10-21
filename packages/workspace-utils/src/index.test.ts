import fs, { mkdtempDisposable } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

import { assert, describe, it } from 'vitest';

import { openWorkspaceGradedFiles } from './index.js';

function makeTempDirectory() {
  return mkdtempDisposable(path.join(os.tmpdir(), 'prairielearn-workspace-utils-'));
}

describe('openWorkspaceGradedFiles', () => {
  const limits = {
    maxFiles: 10,
    maxSize: 1024,
  };

  it('returns regular graded files', async () => {
    await using workspaceDirectory = await makeTempDirectory();
    await fs.writeFile(path.join(workspaceDirectory.path, 'answer.py'), 'print("hello")');

    await using files = await openWorkspaceGradedFiles(workspaceDirectory.path, ['*.py'], limits);

    const [file] = [...files];
    assert.equal(file.path, 'answer.py');
    await fs.appendFile(path.join(workspaceDirectory.path, 'answer.py'), '\nprint("goodbye")');
    assert.equal((await buffer(file.createReadStream())).toString(), 'print("hello")');
  });

  it('does not follow a symbolic link to a file', async () => {
    await using workspaceDirectory = await makeTempDirectory();
    await using outsideDirectory = await makeTempDirectory();
    const outsideFile = path.join(outsideDirectory.path, 'secret.py');
    await fs.writeFile(outsideFile, 'secret');
    await fs.symlink(outsideFile, path.join(workspaceDirectory.path, 'answer.py'));

    await using files = await openWorkspaceGradedFiles(workspaceDirectory.path, ['*.py'], limits);

    assert.isEmpty([...files]);
  });

  it('does not traverse a symbolic link to a directory', async () => {
    await using workspaceDirectory = await makeTempDirectory();
    await using outsideDirectory = await makeTempDirectory();
    await fs.writeFile(path.join(outsideDirectory.path, 'secret.py'), 'secret');
    await fs.symlink(outsideDirectory.path, path.join(workspaceDirectory.path, 'linked'));

    await using files = await openWorkspaceGradedFiles(
      workspaceDirectory.path,
      ['**/*.py'],
      limits,
    );

    assert.isEmpty([...files]);
  });
});
