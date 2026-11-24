import { Readable, type Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';

import { ZipArchive } from 'archiver';
import fg from 'fast-glob';
import { filesize } from 'filesize';

import { isContainedRelativePath, openFileWithinDirectory } from '@prairielearn/path-utils';

interface GradedFilesLimits {
  maxFiles: number;
  maxSize: number;
}

export interface WorkspaceGradedFile {
  path: string;
  createReadStream(): Readable;
}

interface OpenedWorkspaceGradedFile extends WorkspaceGradedFile {
  close(): Promise<void>;
}

export type OpenedWorkspaceGradedFiles = Iterable<WorkspaceGradedFile> & AsyncDisposable;

async function closeWorkspaceGradedFiles(files: OpenedWorkspaceGradedFile[]): Promise<void> {
  await Promise.allSettled(files.map((file) => file.close()));
}

export async function openWorkspaceGradedFiles(
  workspaceDir: string,
  gradedFiles: string[],
  limits: GradedFilesLimits,
): Promise<OpenedWorkspaceGradedFiles> {
  const matchedPaths = (
    await fg(gradedFiles, {
      cwd: workspaceDir,
      ...workspaceFastGlobDefaultOptions,
    })
  ).filter((filePath) => isContainedRelativePath(filePath, false));

  // We generally use `archiver` downstream of this, which does not elegantly
  // handle file names with backslashes:
  // https://github.com/archiverjs/node-archiver/issues/743
  // To prevent downstream issues, we disallow any files with backslashes in
  // their paths. We fail hard rather than silently dropping these files so
  // that it's clear to the user what's happening.
  const backslashPaths = matchedPaths.filter((filePath) => filePath.includes('\\'));
  if (backslashPaths.length > 0) {
    const paths = backslashPaths.join(', ');
    throw new Error(`Cannot submit files with paths that contain backslashes: ${paths}`);
  }

  if (matchedPaths.length > limits.maxFiles) {
    throw new Error(`Cannot submit more than ${limits.maxFiles} files from the workspace.`);
  }

  const files: OpenedWorkspaceGradedFile[] = [];
  try {
    let totalSize = 0;
    for (const matchedPath of matchedPaths) {
      const fileHandle = await openFileWithinDirectory(workspaceDir, matchedPath);
      let size: number;
      try {
        size = (await fileHandle.stat()).size;
      } catch (error) {
        await fileHandle.close();
        throw error;
      }

      files.push({
        path: matchedPath,
        createReadStream: () =>
          size === 0 ? Readable.from([]) : fileHandle.createReadStream({ start: 0, end: size - 1 }),
        close: () => fileHandle.close(),
      });
      totalSize += size;

      if (totalSize > limits.maxSize) {
        throw new Error(
          `Workspace files exceed limit of ${filesize(limits.maxSize, {
            base: 2,
          })}.`,
        );
      }
    }

    return {
      [Symbol.iterator]: () => files[Symbol.iterator](),
      [Symbol.asyncDispose]: () => closeWorkspaceGradedFiles(files),
    };
  } catch (error) {
    await closeWorkspaceGradedFiles(files);
    throw error;
  }
}

/**
 * Default options for calls to `fast-glob`.
 */
export const workspaceFastGlobDefaultOptions = {
  extglob: false,
  braceExpansion: false,
  followSymbolicLinks: false,
};

export async function writeWorkspaceGradedFilesArchive(
  files: Iterable<WorkspaceGradedFile>,
  output: Writable,
): Promise<void> {
  const archive = new ZipArchive();
  const archiveCompleted = pipeline(archive, output);
  const sources: Readable[] = [];

  try {
    for (const file of files) {
      const source = file.createReadStream();
      sources.push(source);
      // Archiver pipes sources through a PassThrough without forwarding read errors.
      source.on('error', (error) => archive.destroy(error));
      archive.append(source, { name: file.path });
    }

    await Promise.all([archive.finalize(), archiveCompleted]);
  } finally {
    // Aborting the archive does not close its sources, including queued files.
    archive.abort();
    archive.destroy();
    for (const source of sources) source.destroy();
    await Promise.allSettled([
      archiveCompleted,
      ...sources.map((source) => finished(source, { cleanup: true })),
    ]);
  }
}
