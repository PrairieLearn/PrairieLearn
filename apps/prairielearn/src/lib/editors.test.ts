import path from 'node:path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { getAssessmentToolsConfig } from './editors.js';

describe('getAssessmentToolsConfig', () => {
  let tmpDir: tmp.DirectoryResult;

  beforeAll(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true });
  });

  afterAll(async () => {
    await tmpDir.cleanup();
  });

  it('returns all tools disabled when file does not exist', async () => {
    const result = await getAssessmentToolsConfig(path.join(tmpDir.path, 'nonexistent.json'));
    assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
  });

  it('returns all tools disabled when file has no tools key', async () => {
    const filePath = path.join(tmpDir.path, 'no-tools.json');
    await fs.writeJson(filePath, { uuid: 'test', type: 'Exam' });

    const result = await getAssessmentToolsConfig(filePath);
    assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
  });

  it('returns enabled tools from config', async () => {
    const filePath = path.join(tmpDir.path, 'with-tools.json');
    await fs.writeJson(filePath, {
      uuid: 'test',
      type: 'Exam',
      tools: { calculator: { enabled: true } },
    });

    const result = await getAssessmentToolsConfig(filePath);
    assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: true }]);
  });

  it('returns disabled tools from config', async () => {
    const filePath = path.join(tmpDir.path, 'disabled-tools.json');
    await fs.writeJson(filePath, {
      uuid: 'test',
      type: 'Exam',
      tools: { calculator: { enabled: false } },
    });

    const result = await getAssessmentToolsConfig(filePath);
    assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
  });

  it('returns tools disabled when tools key is empty object', async () => {
    const filePath = path.join(tmpDir.path, 'empty-tools.json');
    await fs.writeJson(filePath, { uuid: 'test', type: 'Exam', tools: {} });

    const result = await getAssessmentToolsConfig(filePath);
    assert.deepEqual(result, [{ name: 'calculator', label: 'Calculator', enabled: false }]);
  });

  it('throws on non-ENOENT errors', async () => {
    // Use a directory path instead of a file to trigger a non-ENOENT read error
    await expect(getAssessmentToolsConfig(tmpDir.path)).rejects.toThrow();
  });
});
