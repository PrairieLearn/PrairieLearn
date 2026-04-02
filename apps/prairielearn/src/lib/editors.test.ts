import path from 'node:path';

import fs from 'fs-extra';
import { withDir } from 'tmp-promise';
import { assert, describe, expect, it } from 'vitest';

import { getAssessmentToolsConfig } from './editors.js';

describe('getAssessmentToolsConfig', () => {
  it('returns all tools disabled when file does not exist', async () => {
    await withDir(
      async ({ path: dir }) => {
        const result = await getAssessmentToolsConfig(path.join(dir, 'nonexistent.json'));
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns all tools disabled when file has no tools key', async () => {
    await withDir(
      async ({ path: dir }) => {
        const filePath = path.join(dir, 'no-tools.json');
        await fs.writeJson(filePath, { uuid: 'test', type: 'Exam' });

        const result = await getAssessmentToolsConfig(filePath);
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns enabled tools from config', async () => {
    await withDir(
      async ({ path: dir }) => {
        const filePath = path.join(dir, 'with-tools.json');
        await fs.writeJson(filePath, {
          uuid: 'test',
          type: 'Exam',
          tools: { calculator: { enabled: true } },
        });

        const result = await getAssessmentToolsConfig(filePath);
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: true }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns disabled tools from config', async () => {
    await withDir(
      async ({ path: dir }) => {
        const filePath = path.join(dir, 'disabled-tools.json');
        await fs.writeJson(filePath, {
          uuid: 'test',
          type: 'Exam',
          tools: { calculator: { enabled: false } },
        });

        const result = await getAssessmentToolsConfig(filePath);
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns tools disabled when tools key is empty object', async () => {
    await withDir(
      async ({ path: dir }) => {
        const filePath = path.join(dir, 'empty-tools.json');
        await fs.writeJson(filePath, { uuid: 'test', type: 'Exam', tools: {} });

        const result = await getAssessmentToolsConfig(filePath);
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('returns all tools disabled when file contains malformed JSON', async () => {
    await withDir(
      async ({ path: dir }) => {
        const filePath = path.join(dir, 'malformed.json');
        await fs.writeFile(filePath, '{ invalid json !!!');

        const result = await getAssessmentToolsConfig(filePath);
        assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
      },
      { unsafeCleanup: true },
    );
  });

  it('throws on non-ENOENT errors', async () => {
    await withDir(
      async ({ path: dir }) => {
        // Use a directory path instead of a file to trigger a non-ENOENT read error
        await expect(getAssessmentToolsConfig(dir)).rejects.toThrow();
      },
      { unsafeCleanup: true },
    );
  });
});
