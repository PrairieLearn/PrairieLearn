import { constants } from 'node:fs';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

export class FileSizeLimitError extends Error {
  constructor(maxSize: number) {
    super(`File exceeds size limit of ${maxSize} bytes.`);
    this.name = 'FileSizeLimitError';
  }
}

/**
 * Returns true if the parent path contains the child path. Used to allow code
 * to make checks that prevent directory traversal attacks.
 *
 * @param parentPath The path of the parent directory. Must be absolute.
 * @param childPath The path of the child file/directory. If relative, resolved
 * in relation to the parent directory.
 * @param includeSelf Return value if both paths point to the same directory.
 * @returns True if the child path is a child of the parent path, false
 * otherwise.
 */
export function contains(parentPath: string, childPath: string, includeSelf = true): boolean {
  return isContainedRelativePath(
    path.relative(parentPath, path.resolve(parentPath, childPath)),
    includeSelf,
  );
}

/**
 * Returns true if the path, when normalized, is relative and does not require a
 * visit to the parent directory. In other words, returns true if, when resolved
 * against any arbitrary directory, will never result in a file outside of that
 * directory. Used to allow code to make checks that prevent directory traversal
 * attacks.
 *
 * @param relPath The path of the child directory. Path will be normalized
 * before checking.
 * @param includeSelf Return value if the path refers to the directory itself
 * (i.e. '.' or '').
 * @returns True if the path is contained within the current directory, false
 * otherwise.
 */
export function isContainedRelativePath(relPath: string, includeSelf = true): boolean {
  relPath = path.normalize(relPath);
  if (relPath === '.') return includeSelf;
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}

/**
 * Opens a regular file whose resolved path is contained within the given directory.
 *
 * `O_NOFOLLOW` protects against replacement of the final path component after resolution, while
 * `O_NONBLOCK` prevents a special file from blocking before it can be rejected. On Linux, resolving
 * the opened descriptor also detects replacement of a parent directory. The caller is responsible
 * for closing the returned file handle.
 */
export async function openFileWithinDirectory(
  directoryPath: string,
  filePath: string,
): Promise<FileHandle> {
  const [resolvedDirectoryPath, resolvedFilePath] = await Promise.all([
    fs.realpath(directoryPath),
    fs.realpath(path.resolve(directoryPath, filePath)),
  ]);

  if (!contains(resolvedDirectoryPath, resolvedFilePath, false)) {
    throw new Error('File is outside the allowed directory.');
  }

  const file = await fs.open(
    resolvedFilePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (process.platform === 'linux') {
      // `O_NOFOLLOW` only protects the final path component. Resolving the opened descriptor lets
      // us detect if a concurrently replaced parent directory redirected the open outside the root.
      const openedFilePath = await fs.realpath(`/proc/self/fd/${file.fd}`);
      if (!contains(resolvedDirectoryPath, openedFilePath, false)) {
        throw new Error('File is outside the allowed directory.');
      }
    }

    const stats = await file.stat();
    if (!stats.isFile()) {
      throw new Error('Path is not a regular file.');
    }
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

/**
 * Reads a contained regular file while limiting the number of bytes read into memory.
 */
export async function readFileWithinDirectory(
  directoryPath: string,
  filePath: string,
  maxSize: number,
): Promise<Buffer> {
  await using file = await openFileWithinDirectory(directoryPath, filePath);
  const data = await buffer(
    file.createReadStream({
      autoClose: false,
      start: 0,
      // `end` is inclusive, so this reads at most `maxSize + 1` bytes.
      end: maxSize,
    }),
  );
  if (data.length > maxSize) {
    throw new FileSizeLimitError(maxSize);
  }
  return data;
}
