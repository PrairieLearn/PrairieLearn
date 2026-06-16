import * as path from 'node:path';

import * as async from 'async';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs-extra';
import hljs from 'highlight.js';
import { isBinaryFile } from 'isbinaryfile';

import { contains } from '@prairielearn/path-utils';

import * as editorUtil from './editorUtil.js';
import { encodePath } from './uri-util.js';

/**
 * The slice of path/permission context the browse functions need. The
 * instructor file browser's `InstructorFilePaths` satisfies this; other callers
 * (e.g. the draft question file browser) can construct it directly.
 */
export interface FileBrowserPaths {
  coursePath: string;
  courseId: string;
  /** Absolute path of the file or directory being browsed. */
  workingPath: string;
  hasEditPermission: boolean;
  /** Absolute paths that may not be renamed or deleted (e.g. metadata files). */
  cannotMove: string[];
  /** Absolute paths whose contents may not be viewed in this context. */
  invalidRootPaths: string[];
}

export interface FileInfo {
  id: number;
  name: string;
  path: string;
  dir: string;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  canView: boolean;
  isBinary: boolean;
  isImage: boolean;
  isPDF: boolean;
  isText: boolean;
  contents?: string | null;
}

interface DirectoryEntry {
  id: string | number;
  name: string;
  path: string;
  canView: boolean;
}

interface DirectoryEntryDirectory extends DirectoryEntry {
  isFile: false;
}

interface DirectoryEntryFile extends DirectoryEntry {
  isFile: true;
  dir: string;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
}

export interface DirectoryListings {
  dirs: DirectoryEntryDirectory[];
  files: DirectoryEntryFile[];
}

export type BrowseResult =
  | { isFile: true; fileInfo: FileInfo }
  | { isFile: false; directoryListings: DirectoryListings };

/** Browses the working path, dispatching on whether it is a directory or a file. */
export async function browseDirectoryOrFile({
  paths,
}: {
  paths: FileBrowserPaths;
}): Promise<BrowseResult> {
  const stats = await fs.lstat(paths.workingPath);
  if (stats.isDirectory()) {
    return { isFile: false, directoryListings: await browseDirectory({ paths }) };
  } else if (stats.isFile()) {
    return { isFile: true, fileInfo: await browseFile({ paths }) };
  } else {
    throw new Error(
      `Invalid working path - ${paths.workingPath} is neither a directory nor a file`,
    );
  }
}

/** URL that downloads a course file as an attachment. */
export function getFileDownloadUrl({
  urlPrefix,
  path: filePath,
  name,
}: {
  urlPrefix: string;
  /** Path relative to the course root. */
  path: string;
  name: string;
}): string {
  return `${urlPrefix}/file_download/${encodePath(filePath)}?attachment=${encodeURIComponent(name)}`;
}

/**
 * Classifies a binary file by its MIME type to decide how it should be
 * previewed. Callers that have already established a file is binary use this to
 * avoid re-running the binary-file check.
 */
export async function getBinaryFileKind(filePath: string): Promise<'image' | 'pdf' | 'other'> {
  const type = await fileTypeFromFile(filePath);
  if (type?.mime.startsWith('image')) return 'image';
  if (type?.mime === 'application/pdf') return 'pdf';
  return 'other';
}

export async function browseDirectory({
  paths,
}: {
  paths: FileBrowserPaths;
}): Promise<DirectoryListings> {
  const filenames = await fs.readdir(paths.workingPath);
  const all_files = await async.mapLimit(
    filenames.sort().map((name, index) => ({ name, index })),
    3,
    async (file: { name: string; index: number }) => {
      const filepath = path.join(paths.workingPath, file.name);
      const stats = await fs.lstat(filepath);
      if (stats.isFile()) {
        const editable = !(await isBinaryFile(filepath));
        const movable = !paths.cannotMove.includes(filepath);
        const relative_path = path.relative(paths.coursePath, filepath);
        const fileMetadata = await editorUtil.getFileMetadataForPath(paths.courseId, relative_path);
        const result: DirectoryEntryFile = {
          id: file.index,
          name: file.name,
          isFile: true,
          path: relative_path,
          dir: paths.workingPath,
          canEdit: editable && paths.hasEditPermission,
          canUpload: paths.hasEditPermission,
          canDownload: true, // we already know the user is a course Viewer (checked on GET)
          canRename: movable && paths.hasEditPermission,
          canDelete: movable && paths.hasEditPermission,
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
          syncErrors: fileMetadata.syncErrors,
          syncWarnings: fileMetadata.syncWarnings,
        };
        return result;
      } else if (stats.isDirectory()) {
        // The .git directory is hidden in the browser interface.
        if (file.name === '.git') return null;
        const result: DirectoryEntryDirectory = {
          id: file.index,
          name: file.name,
          isFile: false,
          path: path.relative(paths.coursePath, filepath),
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
        };
        return result;
      } else {
        return null;
      }
    },
  );
  return {
    files: all_files.filter((f): f is DirectoryEntryFile => f?.isFile === true),
    dirs: all_files.filter((f): f is DirectoryEntryDirectory => f?.isFile === false),
  };
}

async function browseFile({ paths }: { paths: FileBrowserPaths }): Promise<FileInfo> {
  const filepath = paths.workingPath;
  const movable = !paths.cannotMove.includes(filepath);
  const file: FileInfo = {
    id: 0,
    name: path.basename(paths.workingPath),
    path: path.relative(paths.coursePath, filepath),
    dir: path.dirname(paths.workingPath),
    canEdit: false, // will be overridden only if the file is a text file
    canUpload: paths.hasEditPermission,
    canDownload: true, // we already know the user is a course Viewer (checked on GET)
    canRename: movable && paths.hasEditPermission,
    canDelete: movable && paths.hasEditPermission,
    canView: !paths.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, filepath)),
    isBinary: await isBinaryFile(paths.workingPath),
    isImage: false,
    isPDF: false,
    isText: false,
  };

  if (file.isBinary) {
    const kind = await getBinaryFileKind(paths.workingPath);
    file.isImage = kind === 'image';
    file.isPDF = kind === 'pdf';
  } else {
    // This is probably a text file. If it's is larger that 1MB, don't
    // attempt to read it; treat it like an opaque binary file.
    const { size } = await fs.stat(paths.workingPath);
    if (size > 1 * 1024 * 1024) {
      return { ...file, isBinary: true };
    }

    file.isText = true;
    file.canEdit = paths.hasEditPermission;

    const fileContents = await fs.readFile(paths.workingPath);
    const stringifiedContents = fileContents.toString('utf8');

    // Try to guess the language from the file extension. This takes
    // advantage of the fact that Highlight.js includes common file extensions
    // as aliases for each supported language, and `getLanguage()` allows
    // us to look up a language by its alias.
    //
    // If we don't get a match, we'll try to guess the language by running
    // `highlightAuto()` on the first few thousand characters of the file.
    //
    // Note that we deliberately exclude `ml` and `ls` from the extensions
    // that we try to guess from, as they're ambiguous (OCaml/Standard ML
    // and LiveScript/Lasso, respectively). For more details, see
    // https://highlightjs.readthedocs.io/en/latest/supported-languages.html
    let language: string | undefined = undefined;
    const extension = path.extname(paths.workingPath).slice(1);
    if (!['ml', 'ls'].includes(extension) && hljs.getLanguage(extension)) {
      language = extension;
    } else {
      const result = hljs.highlightAuto(stringifiedContents.slice(0, 2000));
      language = result.language;
    }
    file.contents = hljs.highlight(stringifiedContents, {
      language: language ?? 'plaintext',
    }).value;
  }

  return file;
}
