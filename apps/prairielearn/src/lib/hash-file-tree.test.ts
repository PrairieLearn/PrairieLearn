import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { hashFileTree } from './hash-file-tree.js';

describe('hashFileTree', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-hashes-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('invalidates changed files and their ancestors while preserving sibling hashes', async () => {
    await fs.mkdir(path.join(directory, 'nested'));
    await fs.writeFile(path.join(directory, 'nested', 'changed.js'), 'before');
    await fs.writeFile(path.join(directory, 'stable.js'), 'unchanged');

    const before = await hashFileTree(directory);
    await fs.writeFile(path.join(directory, 'nested', 'changed.js'), 'after');
    const after = await hashFileTree(directory);

    assert.notEqual(after.hash, before.hash);
    assert.notEqual(after.children[0].hash, before.children[0].hash);
    assert.notEqual(after.children[0].children[0].hash, before.children[0].children[0].hash);
    assert.equal(after.children[1].hash, before.children[1].hash);
  });

  it('hashes entries deterministically and detects renames, additions, and removals', async () => {
    await fs.writeFile(path.join(directory, 'b.js'), 'b');
    await fs.writeFile(path.join(directory, 'a.js'), 'a');
    const before = await hashFileTree(directory);

    await fs.unlink(path.join(directory, 'a.js'));
    await fs.unlink(path.join(directory, 'b.js'));
    await fs.writeFile(path.join(directory, 'a.js'), 'a');
    await fs.writeFile(path.join(directory, 'b.js'), 'b');
    assert.deepEqual(await hashFileTree(directory), before);

    await fs.rename(path.join(directory, 'a.js'), path.join(directory, 'renamed.js'));
    const renamed = await hashFileTree(directory);
    assert.notEqual(renamed.hash, before.hash);

    await fs.mkdir(path.join(directory, 'empty'));
    assert.notEqual((await hashFileTree(directory)).hash, renamed.hash);
    await fs.rmdir(path.join(directory, 'empty'));
    assert.deepEqual(await hashFileTree(directory), renamed);
  });

  it('invalidates symlinked directories when their target content changes', async () => {
    await fs.mkdir(path.join(directory, 'target'));
    await fs.writeFile(path.join(directory, 'target', 'asset.js'), 'before');
    await fs.symlink('target', path.join(directory, 'link'));
    const before = await hashFileTree(directory);

    await fs.writeFile(path.join(directory, 'target', 'asset.js'), 'after');
    const after = await hashFileTree(directory);

    assert.equal(after.children[0].name, 'link');
    assert.equal(after.children[0].children[0].name, 'asset.js');
    assert.notEqual(after.children[0].hash, before.children[0].hash);
    assert.notEqual(after.hash, before.hash);
  });
});
