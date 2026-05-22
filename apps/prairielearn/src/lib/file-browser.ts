import * as path from 'node:path';

import * as async from 'async';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs-extra';
import hljs from 'highlight.js';
import { isBinaryFile } from 'isbinaryfile';

import { contains } from '@prairielearn/path-utils';

import * as editorUtil from './editorUtil.js';
import type { InstructorFilePaths } from './instructorFiles.js';

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

export interface DirectoryEntry {
  id: string | number;
  name: string;
  path: string;
  canView: boolean;
}

export interface DirectoryEntryDirectory extends DirectoryEntry {
  isFile: false;
}

export interface DirectoryEntryFile extends DirectoryEntry {
  isFile: true;
  dir: string;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  sync_errors: string | null;
  sync_warnings: string | null;
  uuid: string | null;
}

export interface DirectoryListings {
  dirs: DirectoryEntryDirectory[];
  files: DirectoryEntryFile[];
}

export async function browseDirectory({
  paths,
}: {
  paths: InstructorFilePaths;
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
          sync_errors: fileMetadata.syncErrors,
          sync_warnings: fileMetadata.syncWarnings,
          uuid: fileMetadata.uuid,
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

export async function browseFile({ paths }: { paths: InstructorFilePaths }): Promise<FileInfo> {
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
    const type = await fileTypeFromFile(paths.workingPath);
    if (type) {
      if (type.mime.startsWith('image')) {
        file.isImage = true;
      } else if (type.mime === 'application/pdf') {
        file.isPDF = true;
      }
    }
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
