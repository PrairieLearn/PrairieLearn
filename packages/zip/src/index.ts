import * as fs from 'node:fs';
import path from 'node:path';

import extractZip from 'extract-zip';
import * as yauzl from 'yauzl';

export type ZipArchiveValidationErrorCode =
  | 'max_entries_exceeded'
  | 'max_extracted_bytes_exceeded'
  | 'symlink_entry';

export interface ZipArchiveValidationErrorDetails {
  actual?: number;
  entryPath?: string;
  limit?: number;
}

export class ZipArchiveValidationError extends Error {
  code: ZipArchiveValidationErrorCode;
  details: ZipArchiveValidationErrorDetails;

  constructor(
    code: ZipArchiveValidationErrorCode,
    message: string,
    details: ZipArchiveValidationErrorDetails = {},
  ) {
    super(message);
    this.name = 'ZipArchiveValidationError';
    this.code = code;
    this.details = details;
  }
}

export interface ExtractZipArchiveOptions {
  archivePath: string;
  destinationDir: string;
  maxEntries?: number;
  maxExtractedBytes?: number;
}

function isSymlinkEntry({ externalFileAttributes }: yauzl.Entry): boolean {
  const mode = (externalFileAttributes >> 16) & 0xffff;
  return (mode & fs.constants.S_IFMT) === fs.constants.S_IFLNK;
}

function readArchiveEntryCount(archivePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      const { entryCount } = zipfile;
      zipfile.close();
      resolve(entryCount);
    });
  });
}

export async function extractZipArchive({
  archivePath,
  destinationDir,
  maxEntries,
  maxExtractedBytes,
}: ExtractZipArchiveOptions): Promise<void> {
  if (maxEntries !== undefined) {
    const entryCount = await readArchiveEntryCount(archivePath);
    if (entryCount > maxEntries) {
      throw new ZipArchiveValidationError(
        'max_entries_exceeded',
        `Archive contains more than ${maxEntries} entries.`,
        { actual: entryCount, limit: maxEntries },
      );
    }
  }

  let declaredExtractedBytes = 0;
  await extractZip(archivePath, {
    dir: path.resolve(destinationDir),
    onEntry(entry) {
      if (isSymlinkEntry(entry)) {
        throw new ZipArchiveValidationError('symlink_entry', 'Archive contains a symbolic link.', {
          entryPath: entry.fileName,
        });
      }

      if (maxExtractedBytes === undefined) return;

      declaredExtractedBytes += entry.uncompressedSize;
      if (declaredExtractedBytes > maxExtractedBytes) {
        throw new ZipArchiveValidationError(
          'max_extracted_bytes_exceeded',
          `Archive expands to more than ${maxExtractedBytes} bytes.`,
          { actual: declaredExtractedBytes, limit: maxExtractedBytes },
        );
      }
    },
  });
}
