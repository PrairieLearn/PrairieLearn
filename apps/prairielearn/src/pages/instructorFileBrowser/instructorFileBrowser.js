// @ts-check
import * as path from 'node:path';

import { AnsiUp } from 'ansi_up';
import * as async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs-extra';
import hljs from 'highlight.js';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';
import { contains } from '@prairielearn/path-utils';

import { getCourseOwners } from '../../lib/course.js';
import * as editorUtil from '../../lib/editorUtil.js';
import { FileDeleteEditor, FileRenameEditor, FileUploadEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';

const router = Router();

/**
 * @param {string} item
 */
function isHidden(item) {
  return item[0] === '.';
}

async function browseDirectory(file_browser) {
  const filenames = await fs.readdir(file_browser.paths.workingPath);
  const ansiUp = new AnsiUp();
  const all_files = await async.mapLimit(
    filenames
      .sort()
      .map((name, index) => ({ name, index }))
      .filter((f) => !isHidden(f.name)),
    3,
    async (file) => {
      const filepath = path.join(file_browser.paths.workingPath, file.name);
      const stats = await fs.lstat(filepath);
      if (stats.isFile()) {
        const editable = !(await isBinaryFile(filepath));
        const movable = !file_browser.paths.cannotMove.includes(filepath);
        const relative_path = path.relative(file_browser.paths.coursePath, filepath);
        const sync_data = await editorUtil.getErrorsAndWarningsForFilePath(
          file_browser.paths.courseId,
          relative_path,
        );
        return {
          id: file.index,
          name: file.name,
          isFile: true,
          encodedName: encodePath(file.name),
          path: relative_path,
          encodedPath: encodePath(path.relative(file_browser.paths.coursePath, filepath)),
          dir: file_browser.paths.workingPath,
          canEdit:
            editable && file_browser.has_course_permission_edit && !file_browser.example_course,
          canUpload: file_browser.has_course_permission_edit && !file_browser.example_course,
          canDownload: true, // we already know the user is a course Viewer (checked on GET)
          canRename:
            movable && file_browser.has_course_permission_edit && !file_browser.example_course,
          canDelete:
            movable && file_browser.has_course_permission_edit && !file_browser.example_course,
          canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
          sync_errors: sync_data.errors,
          sync_errors_ansified: ansiUp.ansi_to_html(sync_data.errors ?? ''),
          sync_warnings: sync_data.warnings,
          sync_warnings_ansified: ansiUp.ansi_to_html(sync_data.warnings ?? ''),
        };
      } else if (stats.isDirectory()) {
        return {
          id: file.index,
          name: file.name,
          isDirectory: true,
          encodedName: encodePath(file.name),
          path: path.relative(file_browser.paths.coursePath, filepath),
          encodedPath: encodePath(path.relative(file_browser.paths.coursePath, filepath)),
          canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
        };
      } else {
        return null;
      }
    },
  );
  file_browser.files = all_files.filter((f) => f?.isFile);
  file_browser.dirs = all_files.filter((f) => f?.isDirectory);
}

async function browseFile(file_browser) {
  const isBinary = await isBinaryFile(file_browser.paths.workingPath);
  file_browser.isBinary = isBinary;
  if (isBinary) {
    const type = await fileTypeFromFile(file_browser.paths.workingPath);
    if (type) {
      if (type?.mime.startsWith('image')) {
        file_browser.isImage = true;
      } else if (type?.mime === 'application/pdf') {
        file_browser.isPDF = true;
      }
    }
  } else {
    // This is probably a text file. If it's is larger that 1MB, don't
    // attempt to read it; treat it like an opaque binary file.
    const { size } = await fs.stat(file_browser.paths.workingPath);
    if (size > 1 * 1024 * 1024) {
      file_browser.isBinary = true;
      return;
    }

    file_browser.isText = true;

    const contents = await fs.readFile(file_browser.paths.workingPath);
    const stringifiedContents = contents.toString('utf8');

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
    let language = null;
    const extension = path.extname(file_browser.paths.workingPath).substring(1);
    if (!['ml', 'ls'].includes(extension) && hljs.getLanguage(extension)) {
      language = extension;
    } else {
      const result = hljs.highlightAuto(stringifiedContents.slice(0, 2000));
      language = result.language;
    }
    file_browser.contents = hljs.highlight(stringifiedContents, {
      language: language ?? 'plaintext',
    }).value;
  }

  const filepath = file_browser.paths.workingPath;
  const movable = !file_browser.paths.cannotMove.includes(filepath);
  file_browser.file = {
    id: 0,
    name: path.basename(file_browser.paths.workingPath),
    encodedName: encodePath(path.basename(file_browser.paths.workingPath)),
    path: path.relative(file_browser.paths.coursePath, filepath),
    encodedPath: encodePath(path.relative(file_browser.paths.coursePath, filepath)),
    dir: path.dirname(file_browser.paths.workingPath),
    canEdit:
      file_browser.isText &&
      file_browser.has_course_permission_edit &&
      !file_browser.example_course,
    canUpload: file_browser.has_course_permission_edit && !file_browser.example_course,
    canDownload: true, // we already know the user is a course Viewer (checked on GET)
    canRename: movable && file_browser.has_course_permission_edit && !file_browser.example_course,
    canDelete: movable && file_browser.has_course_permission_edit && !file_browser.example_course,
    canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) =>
      contains(invalidRootPath, filepath),
    ),
  };
}

router.get(
  '/*',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_view) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get view permissions.
      getCourseOwners(res.locals.course.id)
        .then((owners) => {
          res.locals.course_owners = owners;
          res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
        })
        .catch((err) => next(err));
      return;
    }

    let file_browser = {
      has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
      example_course: res.locals.course.example_course,
    };

    file_browser.paths = getPaths(req, res);

    try {
      const stats = await fs.lstat(file_browser.paths.workingPath);
      if (stats.isDirectory()) {
        file_browser.isFile = false;
        await browseDirectory(file_browser);
      } else if (stats.isFile()) {
        file_browser.isFile = true;
        await browseFile(file_browser);
      } else {
        throw new Error(
          `Invalid working path - ${file_browser.paths.workingPath} is neither a directory nor a file`,
        );
      }
    } catch (err) {
      if (/** @type {any} */ (err).code === 'ENOENT' && file_browser.paths.branch.length > 1) {
        res.redirect(`${req.baseUrl}/${encodePath(file_browser.paths.branch.slice(-2)[0].path)}`);
        return;
      }

      throw err;
    }

    res.locals.file_browser = file_browser;
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/*',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
    }

    const paths = getPaths(req, res);
    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'delete_file') {
      let deletePath;
      try {
        deletePath = path.join(res.locals.course.path, req.body.file_path);
      } catch (err) {
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
      } catch (err) {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'rename_file') {
      let oldPath;
      try {
        oldPath = path.join(req.body.working_path, req.body.old_file_name);
      } catch (err) {
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
      let newPath;
      try {
        newPath = path.join(req.body.working_path, req.body.new_file_name);
      } catch (err) {
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
      } catch (err) {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
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

      let filePath;
      if (req.body.file_path) {
        try {
          filePath = path.join(res.locals.course.path, req.body.file_path);
        } catch (err) {
          throw new Error(`Invalid file path: ${req.body.file_path}`);
        }
      } else {
        try {
          filePath = path.join(req.body.working_path, req.file.originalname);
        } catch (err) {
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
      } catch (err) {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }
      res.redirect(req.originalUrl);
    } else {
      throw new Error('unknown __action: ' + req.body.__action);
    }
  }),
);

export default router;
