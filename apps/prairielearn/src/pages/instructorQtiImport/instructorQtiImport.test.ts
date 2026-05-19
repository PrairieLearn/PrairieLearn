import path from 'node:path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { describe, expect, it } from 'vitest';

import { serializeClientFiles } from './instructorQtiImport.js';

describe('serializeClientFiles', () => {
  it('encodes buffer content as base64', async () => {
    const files = new Map<string, Buffer | string>([['image.png', Buffer.from('fake png data')]]);
    const { files: result } = await serializeClientFiles(files, '/nonexistent');
    expect(result['image.png']).toBe(Buffer.from('fake png data').toString('base64'));
  });

  it('reads string content from web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      await fs.outputFile(path.join(tempDir, 'asset.png'), 'fake asset content');

      const files = new Map<string, Buffer | string>([['asset.png', 'asset.png']]);
      const { files: result } = await serializeClientFiles(files, tempDir);
      expect(result['asset.png']).toBe(Buffer.from('fake asset content').toString('base64'));
    } finally {
      await cleanup();
    }
  });

  it('reports string paths that escape web_resources directory', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['evil.txt', '../../etc/passwd']]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('evil.txt');
      expect(missingFiles).toEqual(['evil.txt']);
    } finally {
      await cleanup();
    }
  });

  it('reports files that do not exist', async () => {
    const { path: tempDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
    try {
      const files = new Map<string, Buffer | string>([['missing.png', 'nonexistent.png']]);
      const { files: result, missingFiles } = await serializeClientFiles(files, tempDir);
      expect(result).not.toHaveProperty('missing.png');
      expect(missingFiles).toEqual(['missing.png']);
    } finally {
      await cleanup();
    }
  });
});
