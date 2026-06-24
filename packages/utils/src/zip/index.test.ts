import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ZipArchive } from 'archiver';
import { describe, expect, it } from 'vitest';

import { ZipArchiveValidationError, extractZipArchive } from './index.js';

async function withTempDir(fn: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'prairielearn-zip-'));
  try {
    await fn(tempDir);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function buildZip(
  destPath: string,
  entries: { name: string; content: string | Buffer }[],
): Promise<void> {
  const archive = new ZipArchive();
  for (const entry of entries) {
    archive.append(entry.content, { name: entry.name });
  }
  void archive.finalize();
  await pipeline(archive, createWriteStream(destPath));
}

describe('extractZipArchive', () => {
  it('extracts a valid zip archive', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'valid.zip');
      const outputDir = path.join(tempDir, 'output');
      await buildZip(zipPath, [{ name: 'documents/readme.txt', content: 'hello' }]);

      await extractZipArchive({
        archivePath: zipPath,
        destinationDir: outputDir,
        maxEntries: 10,
        maxExtractedBytes: 1024,
      });

      expect(await readFile(path.join(outputDir, 'documents', 'readme.txt'), 'utf-8')).toBe(
        'hello',
      );
    });
  });

  it('rejects archives that exceed the expanded size limit', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'large.zip');
      const outputDir = path.join(tempDir, 'output');
      await buildZip(zipPath, [{ name: 'large.txt', content: 'x'.repeat(1024) }]);

      await expect(
        extractZipArchive({
          archivePath: zipPath,
          destinationDir: outputDir,
          maxEntries: 10,
          maxExtractedBytes: 100,
        }),
      ).rejects.toMatchObject({
        code: 'max_extracted_bytes_exceeded',
        message: 'Archive expands to more than 100 bytes.',
      });
    });
  });

  it('rejects archives that exceed the entry count limit', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'many-files.zip');
      const outputDir = path.join(tempDir, 'output');
      await buildZip(zipPath, [
        { name: 'one.txt', content: '1' },
        { name: 'two.txt', content: '2' },
        { name: 'three.txt', content: '3' },
      ]);

      await expect(
        extractZipArchive({
          archivePath: zipPath,
          destinationDir: outputDir,
          maxEntries: 2,
          maxExtractedBytes: 1024,
        }),
      ).rejects.toMatchObject({
        code: 'max_entries_exceeded',
        message: 'Archive contains more than 2 entries.',
      });
    });
  });

  it('applies the entry count limit to macOS metadata entries', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'many-macosx-files.zip');
      const outputDir = path.join(tempDir, 'output');
      await buildZip(zipPath, [
        { name: '__MACOSX/one.txt', content: '1' },
        { name: '__MACOSX/two.txt', content: '2' },
        { name: '__MACOSX/three.txt', content: '3' },
      ]);

      await expect(
        extractZipArchive({
          archivePath: zipPath,
          destinationDir: outputDir,
          maxEntries: 2,
          maxExtractedBytes: 1024,
        }),
      ).rejects.toMatchObject({
        code: 'max_entries_exceeded',
        message: 'Archive contains more than 2 entries.',
      });
    });
  });

  it('rejects symbolic links', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'symlink.zip');
      const outputDir = path.join(tempDir, 'output');
      const archive = new ZipArchive();
      archive.symlink('link.txt', 'target.txt');
      void archive.finalize();
      await pipeline(archive, createWriteStream(zipPath));

      await expect(
        extractZipArchive({
          archivePath: zipPath,
          destinationDir: outputDir,
          maxEntries: 10,
          maxExtractedBytes: 1024,
        }),
      ).rejects.toMatchObject({
        code: 'symlink_entry',
        message: 'Archive contains a symbolic link.',
      });
    });
  });

  it('uses ZipArchiveValidationError for limit failures', async () => {
    await withTempDir(async (tempDir) => {
      const zipPath = path.join(tempDir, 'large.zip');
      const outputDir = path.join(tempDir, 'output');
      await buildZip(zipPath, [{ name: 'large.txt', content: 'x'.repeat(1024) }]);

      await expect(
        extractZipArchive({
          archivePath: zipPath,
          destinationDir: outputDir,
          maxEntries: null,
          maxExtractedBytes: 100,
        }),
      ).rejects.toBeInstanceOf(ZipArchiveValidationError);
    });
  });
});
