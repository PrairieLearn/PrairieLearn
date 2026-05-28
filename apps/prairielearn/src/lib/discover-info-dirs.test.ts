import * as fs from 'fs/promises';
import * as path from 'path';

import tmp from 'tmp-promise';
import { assert, describe, it } from 'vitest';

import { discoverInfoDirs } from './discover-info-dirs.js';

describe('discoverInfoDirs', () => {
  it('returns an empty array when the root directory does not exist', async () => {
    const result = await discoverInfoDirs('/nonexistent/path', 'info.json');
    assert.deepEqual(result, []);
  });

  it('discovers flat directories containing the info file', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        await fs.mkdir(path.join(tmpDir, 'a'), { recursive: true });
        await fs.mkdir(path.join(tmpDir, 'b'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'a', 'info.json'), '{}');
        await fs.writeFile(path.join(tmpDir, 'b', 'info.json'), '{}');

        const result = await discoverInfoDirs(tmpDir, 'info.json');
        assert.deepEqual(result, ['a', 'b']);
      },
      { unsafeCleanup: true },
    );
  });

  it('discovers deeply nested directories', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        await fs.mkdir(path.join(tmpDir, 'a', 'b', 'c'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'a', 'b', 'c', 'info.json'), '{}');

        const result = await discoverInfoDirs(tmpDir, 'info.json');
        assert.deepEqual(result, [path.join('a', 'b', 'c')]);
      },
      { unsafeCleanup: true },
    );
  });

  it('stops recursing once it finds a directory with the info file', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        // Create info.json at a/
        await fs.mkdir(path.join(tmpDir, 'a'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'a', 'info.json'), '{}');

        // Create another info.json nested inside a/ — should NOT be discovered
        await fs.mkdir(path.join(tmpDir, 'a', 'b', 'c'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'a', 'b', 'c', 'info.json'), '{}');

        const result = await discoverInfoDirs(tmpDir, 'info.json');
        assert.deepEqual(result, ['a']);
      },
      { unsafeCleanup: true },
    );
  });

  it('skips directories without the info file and recurses into them', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        // "group" has no info file, so we recurse into it
        await fs.mkdir(path.join(tmpDir, 'group', 'item1'), { recursive: true });
        await fs.mkdir(path.join(tmpDir, 'group', 'item2'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'group', 'item1', 'info.json'), '{}');
        await fs.writeFile(path.join(tmpDir, 'group', 'item2', 'info.json'), '{}');

        const result = await discoverInfoDirs(tmpDir, 'info.json');
        assert.deepEqual(result, [path.join('group', 'item1'), path.join('group', 'item2')]);
      },
      { unsafeCleanup: true },
    );
  });

  it('ignores regular files in the directory tree', async () => {
    await tmp.withDir(
      async ({ path: tmpDir }) => {
        await fs.mkdir(path.join(tmpDir, 'a'), { recursive: true });
        await fs.writeFile(path.join(tmpDir, 'a', 'info.json'), '{}');
        await fs.writeFile(path.join(tmpDir, 'README.md'), 'hello');

        const result = await discoverInfoDirs(tmpDir, 'info.json');
        assert.deepEqual(result, ['a']);
      },
      { unsafeCleanup: true },
    );
  });
});
