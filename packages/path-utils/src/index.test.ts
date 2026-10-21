import fs, { mkdtempDisposable } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, expect, it } from 'vitest';

import {
  FileSizeLimitError,
  contains,
  isContainedRelativePath,
  openFileWithinDirectory,
  readFileWithinDirectory,
} from './index.js';

function makeTempDirectory() {
  return mkdtempDisposable(path.join(os.tmpdir(), 'prairielearn-path-utils-'));
}

describe('File paths', () => {
  describe('contains function', () => {
    it('works with valid absolute paths', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests'));
      assert.ok(contains('/', '/PrairieLearn/tests'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/exampleCourse/questions'));
      assert.ok(contains('/PrairieLearn/exampleCourse', '/PrairieLearn/exampleCourse/questions'));
    });

    it('works with valid absolute over relative paths', async () => {
      assert.ok(contains('/PrairieLearn', 'tests'));
      assert.ok(contains('/PrairieLearn', 'exampleCourse/questions'));
      assert.ok(contains('/PrairieLearn/exampleCourse', 'questions'));
    });

    it('works with absolute paths that are not contained', async () => {
      assert.notOk(contains('/PrairieLearn', '/tmp'));
      assert.notOk(contains('/PrairieLearn/exampleCourse', '/PrairieLearn/tests'));
      assert.notOk(
        contains('/PrairieLearn/exampleCourse/questions', '/PrairieLearn/exampleCourse'),
      );
    });

    it('works with same path', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/.'));
      assert.ok(contains('/tmp', '/tmp'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn', false));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/.', false));
      assert.notOk(contains('/tmp', '/tmp', false));
    });

    it('works with paths using .. that are outside parent', async () => {
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/..'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/../etc'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/tests/../../etc'));
      assert.notOk(contains('/PrairieLearn', '../etc'));
      assert.notOk(contains('/PrairieLearn', 'tests/../../etc'));
      assert.notOk(contains('/PrairieLearn', '/PrairieLearn/tests/..', false));
      assert.notOk(contains('/PrairieLearn', 'tests/..', false));
    });

    it('works with paths using .. that are still inside parent', async () => {
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests/../exampleCourse'));
      assert.ok(contains('/PrairieLearn', '/PrairieLearn/tests/..'));
      assert.ok(contains('/PrairieLearn', 'tests/../exampleCourse'));
      assert.ok(contains('/PrairieLearn', 'tests/..'));
    });
  });

  describe('isContainedRelativePath function', () => {
    it('works if path is contained', async () => {
      assert.ok(isContainedRelativePath('PrairieLearn'));
      assert.ok(isContainedRelativePath('PrairieLearn/../etc'));
      assert.ok(isContainedRelativePath('PrairieLearn/..'));
    });

    it('works if path is not contained', async () => {
      assert.notOk(isContainedRelativePath('PrairieLearn/..', false));
      assert.notOk(isContainedRelativePath('/PrairieLearn'));
      assert.notOk(isContainedRelativePath('../PrairieLearn'));
      assert.notOk(isContainedRelativePath('PrairieLearn/../../etc'));
    });
  });

  describe('openFileWithinDirectory function', () => {
    it('opens a regular file within the directory', async () => {
      await using directory = await makeTempDirectory();
      await fs.mkdir(path.join(directory.path, 'results'));
      await fs.writeFile(path.join(directory.path, 'results', 'results.json'), '{"score": 1}');

      await using file = await openFileWithinDirectory(directory.path, 'results/results.json');
      const contents = await file.readFile();

      assert.equal(contents.toString(), '{"score": 1}');
    });

    it('rejects a symbolic link to a file outside the directory', async () => {
      await using directory = await makeTempDirectory();
      await using outsideDirectory = await makeTempDirectory();
      const outsideFile = path.join(outsideDirectory.path, 'secret.json');
      await fs.mkdir(path.join(directory.path, 'results'));
      await fs.writeFile(outsideFile, '{"secret": true}');
      await fs.symlink(outsideFile, path.join(directory.path, 'results', 'results.json'));

      await expect(openFileWithinDirectory(directory.path, 'results/results.json')).rejects.toThrow(
        'File is outside the allowed directory.',
      );
    });

    it('rejects a symbolic link to a directory outside the allowed directory', async () => {
      await using directory = await makeTempDirectory();
      await using outsideDirectory = await makeTempDirectory();
      await fs.writeFile(path.join(outsideDirectory.path, 'results.json'), '{"secret": true}');
      await fs.symlink(outsideDirectory.path, path.join(directory.path, 'results'));

      await expect(openFileWithinDirectory(directory.path, 'results/results.json')).rejects.toThrow(
        'File is outside the allowed directory.',
      );
    });

    it('rejects non-regular files', async () => {
      await using directory = await makeTempDirectory();
      await fs.mkdir(path.join(directory.path, 'results.json'));

      await expect(openFileWithinDirectory(directory.path, 'results.json')).rejects.toThrow(
        'Path is not a regular file.',
      );
    });
  });

  describe('readFileWithinDirectory function', () => {
    it('reads files within the limit and rejects larger files', async () => {
      await using directory = await makeTempDirectory();
      await fs.writeFile(path.join(directory.path, 'results.json'), '12345');

      assert.equal(
        (await readFileWithinDirectory(directory.path, 'results.json', 5)).toString(),
        '12345',
      );
      await expect(readFileWithinDirectory(directory.path, 'results.json', 4)).rejects.toThrow(
        FileSizeLimitError,
      );
    });
  });
});
