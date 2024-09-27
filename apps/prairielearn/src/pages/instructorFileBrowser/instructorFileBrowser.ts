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

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { getCourseOwners } from '../../lib/course.js';
import * as editorUtil from '../../lib/editorUtil.js';
import { FileDeleteEditor, FileRenameEditor, FileUploadEditor } from '../../lib/editors.js';
import { getPaths, type InstructorFilePaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';

import {
  type DirectoryListings,
  type DirectoryEntryDirectory,
  type DirectoryEntryFile,
  type FileInfo,
  InstructorFileBrowser,
} from './instructorFileBrowser.html.js';

const router = Router();

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
        const editable = !(await isBinaryFile(filepath));
        const movable = !paths.cannotMove.includes(filepath);
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
          canEdit: editable && paths.hasEditPermission,
          canUpload: paths.hasEditPermission,
          canDownload: true, // we already know the user is a course Viewer (checked on GET)
          canRename: movable && paths.hasEditPermission,
          canDelete: movable && paths.hasEditPermission,
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
    if (!res.locals.authz_data.has_course_permission_view) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get view permissions.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          courseOwners,
          pageTitle: 'Files',
          requiredPermissions: 'Viewer',
        }),
      );
      return;
    }

    const paths = getPaths(req.params[0], res.locals);

    try {
      const stats = await fs.lstat(paths.workingPath);
      if (stats.isDirectory()) {
        res.send(
          InstructorFileBrowser({
            resLocals: res.locals,
            paths,
            isFile: false,
            directoryListings: await browseDirectory({ paths }),
          }),
        );
      } else if (stats.isFile()) {
        res.send(
          InstructorFileBrowser({
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

router.post(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
    }

    const paths = getPaths(req.params[0], res.locals);
    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'delete_file') {
      let deletePath: string;
      try {
        deletePath = path.join(res.locals.course.path, req.body.file_path);
      } catch {
        throw new Error(`Invalid file path: ${req.body.file_path}`);
      }
      const editor = new FileDeleteEditor({
        locals: res.locals,
        container,
        deletePath,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'rename_file') {
      let oldPath: string;
      try {
        oldPath = path.join(req.body.working_path, req.body.old_file_name);
      } catch {
        throw new Error(
          `Invalid old file path: ${req.body.working_path} / ${req.body.old_file_name}`,
        );
      }
      if (!req.body.new_file_name) {
        throw new Error(`Invalid new file name (was falsy): ${req.body.new_file_name}`);
      }
      if (
        !/^(?:[-A-Za-z0-9_]+|\.\.)(?:\/(?:[-A-Za-z0-9_]+|\.\.))*(?:\.[-A-Za-z0-9_]+)?$/.test(
          req.body.new_file_name,
        )
      ) {
        throw new Error(
          `Invalid new file name (did not match required pattern): ${req.body.new_file_name}`,
        );
      }
      let newPath: string;
      try {
        newPath = path.join(req.body.working_path, req.body.new_file_name);
      } catch {
        throw new Error(
          `Invalid new file path: ${req.body.working_path} / ${req.body.new_file_name}`,
        );
      }

      if (oldPath === newPath) {
        // The new file name is the same as old file name; do nothing.
        res.redirect(req.originalUrl);
        return;
      }

      const editor = new FileRenameEditor({
        locals: res.locals,
        container,
        oldPath,
        newPath,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(`${res.locals.urlPrefix}/edit_error/${serverJob.jobSequenceId}`);
        return;
      }
      if (req.body.was_viewing_file) {
        res.redirect(
          `${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodePath(
            path.relative(res.locals.course.path, newPath),
          )}`,
        );
      } else {
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'upload_file') {
      if (!req.file) throw new Error('No file uploaded');

      let filePath: string;
      if (req.body.file_path) {
        try {
          filePath = path.join(res.locals.course.path, req.body.file_path);
        } catch {
          throw new Error(`Invalid file path: ${req.body.file_path}`);
        }
      } else {
        try {
          filePath = path.join(req.body.working_path, req.file.originalname);
        } catch {
          throw new Error(`Invalid file path: ${req.body.working_path} / ${req.file.originalname}`);
        }
      }
      const editor = new FileUploadEditor({
        locals: res.locals,
        container,
        filePath,
        fileContents: req.file.buffer,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(`${res.locals.urlPrefix}/edit_error/${serverJob.jobSequenceId}`);
        return;
      }
      res.redirect(req.originalUrl);
    } else {
      throw new Error(`unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
