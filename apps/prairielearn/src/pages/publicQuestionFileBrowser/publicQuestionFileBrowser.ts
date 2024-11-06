import * as path from 'node:path';

import * as async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs-extra';
import hljs from 'highlight.js';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';

import { UserSchema } from '../../lib/db-types.js';
import * as editorUtil from '../../lib/editorUtil.js';
import { getPaths, type InstructorFilePaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

import {
  type DirectoryListings,
  type DirectoryEntryDirectory,
  type DirectoryEntryFile,
  type FileInfo,
  PublicQuestionFileBrowser,
} from './publicQuestionFileBrowser.html.js';

const router = Router({ mergeParams: true });

async function setLocals(req, res) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.course = await selectCourseById(req.params.course_id);
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (
    !res.locals.question.share_source_publicly ||
    res.locals.course.id !== res.locals.question.course_id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
  return;
}

function isHidden(item: string) {
  return item[0] === '.';
}

async function browseDirectory({
  paths,
}: {
  paths: InstructorFilePaths;
}): Promise<DirectoryListings> {
  const filenames = await fs.readdir(paths.workingPath);
  const all_files = await async.mapLimit(
    filenames
      .sort()
      .map((name, index) => ({ name, index }))
      .filter((f) => !isHidden(f.name)),
    3,
    async (file: { name: string; index: number }) => {
      const filepath = path.join(paths.workingPath, file.name);
      const stats = await fs.lstat(filepath);
      if (stats.isFile()) {
        const relative_path = path.relative(paths.coursePath, filepath);
        const sync_data = await editorUtil.getErrorsAndWarningsForFilePath(
          paths.courseId,
          relative_path,
        );
        return {
          id: file.index,
          name: file.name,
          isFile: true,
          path: relative_path,
          dir: paths.workingPath,
          canEdit: false,
          canUpload: false,
          canDownload: true, // For public browsing, all access except viewing/downloading is always disabled
          canRename: false,
          canDelete: false,
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
          sync_errors: sync_data.errors,
          sync_warnings: sync_data.warnings,
        } as DirectoryEntryFile;
      } else if (stats.isDirectory()) {
        return {
          id: file.index,
          name: file.name,
          isFile: false,
          path: path.relative(paths.coursePath, filepath),
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
        } as DirectoryEntryDirectory;
      } else {
        return null;
      }
    },
  );
  return {
    files: all_files.filter((f) => f?.isFile === true),
    dirs: all_files.filter((f) => f?.isFile === false),
  };
}

async function browseFile({ paths }: { paths: InstructorFilePaths }): Promise<FileInfo> {
  const filepath = paths.workingPath;
  const file: FileInfo = {
    id: 0,
    name: path.basename(paths.workingPath),
    path: path.relative(paths.coursePath, filepath),
    dir: path.dirname(paths.workingPath),
    canEdit: false,
    canUpload: false,
    canDownload: true, // For public browsing, all access except viewing/downloading is always disabled
    canRename: false,
    canDelete: false,
    canView: !paths.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, filepath)),
    isBinary: await isBinaryFile(paths.workingPath),
    isImage: false,
    isPDF: false,
    isText: false,
  };

  if (file.isBinary) {
    const type = await fileTypeFromFile(paths.workingPath);
    if (type) {
      if (type?.mime.startsWith('image')) {
        file.isImage = true;
      } else if (type?.mime === 'application/pdf') {
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
    const extension = path.extname(paths.workingPath).substring(1);
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

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);

    const paths = getPaths(req.params[0], res.locals);

    try {
      const stats = await fs.lstat(paths.workingPath);
      if (stats.isDirectory()) {
        res.send(
          PublicQuestionFileBrowser({
            resLocals: res.locals,
            paths,
            isFile: false,
            directoryListings: await browseDirectory({ paths }),
          }),
        );
      } else if (stats.isFile()) {
        res.send(
          PublicQuestionFileBrowser({
            resLocals: res.locals,
            paths,
            isFile: true,
            fileInfo: await browseFile({ paths }),
          }),
        );
      } else {
        throw new Error(
          `Invalid working path - ${paths.workingPath} is neither a directory nor a file`,
        );
      }
    } catch (err) {
      if (err.code === 'ENOENT' && paths.branch.length > 1) {
        res.redirect(`${req.baseUrl}/${encodePath(paths.branch.slice(-2)[0].path)}`);
        return;
      }

      throw err;
    }
  }),
);

export default router;
