const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/error');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { FileDeleteEditor, FileRenameEditor, FileUploadEditor } = require('../../lib/editors');
const { logger } = require('@prairielearn/logger');
const { contains } = require('@prairielearn/path-utils');
const fs = require('fs-extra');
const async = require('async');
const hljs = require('highlight.js');
const FileType = require('file-type');
const { isBinaryFile } = require('isbinaryfile');
const { encodePath } = require('../../lib/uri-util');
const editorUtil = require('../../lib/editorUtil');
const { default: AnsiUp } = require('ansi_up');
const { getCourseOwners } = require('../../lib/course');
const { getPathsCallback } = require('../../lib/instructorFiles');

function isHidden(item) {
  return item[0] === '.';
}

function browseDirectory(file_browser, callback) {
  async.waterfall(
    [
      (callback) => {
        fs.readdir(file_browser.paths.workingPath, (err, filenames) => {
          if (ERR(err, callback)) return;
          callback(null, filenames);
        });
      },
      async (filenames) => {
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
                  editable &&
                  file_browser.has_course_permission_edit &&
                  !file_browser.example_course,
                canUpload: file_browser.has_course_permission_edit && !file_browser.example_course,
                canDownload: true, // we already know the user is a course Viewer (checked on GET)
                canRename:
                  movable &&
                  file_browser.has_course_permission_edit &&
                  !file_browser.example_course,
                canDelete:
                  movable &&
                  file_browser.has_course_permission_edit &&
                  !file_browser.example_course,
                canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) =>
                  contains(invalidRootPath, filepath),
                ),
                sync_errors: sync_data.errors,
                sync_errors_ansified: ansiUp.ansi_to_html(sync_data.errors),
                sync_warnings: sync_data.warnings,
                sync_warnings_ansified: ansiUp.ansi_to_html(sync_data.warnings),
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
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
}

function browseFile(file_browser, callback) {
  async.waterfall(
    [
      async () => {
        const isBinary = await isBinaryFile(file_browser.paths.workingPath);
        file_browser.isBinary = isBinary;
        if (isBinary) {
          const type = await FileType.fromFile(file_browser.paths.workingPath);
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
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;

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
        canRename:
          movable && file_browser.has_course_permission_edit && !file_browser.example_course,
        canDelete:
          movable && file_browser.has_course_permission_edit && !file_browser.example_course,
        canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) =>
          contains(invalidRootPath, filepath),
        ),
      };
      callback(null);
    },
  );
}

router.get('/*', function (req, res, next) {
  debug('GET /');
  if (!res.locals.authz_data.has_course_permission_view) {
    // Access denied, but instead of sending them to an error page, we'll show
    // them an explanatory message and prompt them to get view permissions.
    getCourseOwners(res.locals.course.id)
      .then((owners) => {
        res.locals.course_owners = owners;
        res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => next(err));
    return;
  }

  let file_browser = {
    has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
    example_course: res.locals.course.example_course,
  };
  async.waterfall(
    [
      (callback) => {
        debug('get paths');
        getPathsCallback(req, res, (err, paths) => {
          if (ERR(err, callback)) return;
          file_browser.paths = paths;
          callback(null);
        });
      },
      (callback) => {
        fs.lstat(file_browser.paths.workingPath, (err, stats) => {
          if (ERR(err, callback)) return;
          callback(null, stats);
        });
      },
      (stats, callback) => {
        if (stats.isDirectory()) {
          file_browser.isFile = false;
          browseDirectory(file_browser, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        } else if (stats.isFile()) {
          file_browser.isFile = true;
          browseFile(file_browser, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        } else {
          callback(
            new Error(
              `Invalid working path - ${file_browser.paths.workingPath} is neither a directory nor a file`,
            ),
          );
        }
      },
    ],
    (err) => {
      if (err) {
        if (err.code === 'ENOENT' && file_browser.paths.branch.length > 1) {
          res.redirect(`${req.baseUrl}/${encodePath(file_browser.paths.branch.slice(-2)[0].path)}`);
          return;
        } else {
          return ERR(err, next);
        }
      }
      res.locals.file_browser = file_browser;
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    },
  );
});

router.post('/*', function (req, res, next) {
  debug('POST /');
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be a course Editor)'));
  }
  getPathsCallback(req, res, (err, paths) => {
    if (ERR(err, next)) return;
    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'delete_file') {
      debug('Delete file');
      let deletePath;
      try {
        deletePath = path.join(res.locals.course.path, req.body.file_path);
      } catch (err) {
        return next(new Error(`Invalid file path: ${req.body.file_path}`));
      }
      const editor = new FileDeleteEditor({
        locals: res.locals,
        container,
        deletePath,
      });
      editor.canEdit((err) => {
        if (ERR(err, next)) return;
        editor.doEdit((err, job_sequence_id) => {
          if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
          } else {
            res.redirect(req.originalUrl);
          }
        });
      });
    } else if (req.body.__action === 'rename_file') {
      debug('Rename file');
      let oldPath;
      try {
        oldPath = path.join(req.body.working_path, req.body.old_file_name);
      } catch (err) {
        return next(
          new Error(`Invalid old file path: ${req.body.working_path} / ${req.body.old_file_name}`),
        );
      }
      if (!req.body.new_file_name) {
        return next(new Error(`Invalid new file name (was falsy): ${req.body.new_file_name}`));
      }
      if (
        !/^(?:[-A-Za-z0-9_]+|\.\.)(?:\/(?:[-A-Za-z0-9_]+|\.\.))*(?:\.[-A-Za-z0-9_]+)?$/.test(
          req.body.new_file_name,
        )
      ) {
        return next(
          new Error(
            `Invalid new file name (did not match required pattern): ${req.body.new_file_name}`,
          ),
        );
      }
      let newPath;
      try {
        newPath = path.join(req.body.working_path, req.body.new_file_name);
      } catch (err) {
        return next(
          new Error(`Invalid new file path: ${req.body.working_path} / ${req.body.new_file_name}`),
        );
      }
      if (oldPath === newPath) {
        debug('The new file name is the same as old file name - do nothing');
        res.redirect(req.originalUrl);
      } else {
        const editor = new FileRenameEditor({
          locals: res.locals,
          container,
          oldPath,
          newPath,
        });
        editor.canEdit((err) => {
          if (ERR(err, next)) return;
          editor.doEdit((err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
              res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
              if (req.body.was_viewing_file) {
                res.redirect(
                  `${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodePath(
                    path.relative(res.locals.course.path, newPath),
                  )}`,
                );
              } else {
                res.redirect(req.originalUrl);
              }
            }
          });
        });
      }
    } else if (req.body.__action === 'upload_file') {
      debug('Upload file');
      let filePath;
      if (req.body.file_path) {
        debug('should replace old file');
        try {
          filePath = path.join(res.locals.course.path, req.body.file_path);
        } catch (err) {
          return next(new Error(`Invalid file path: ${req.body.file_path}`));
        }
      } else {
        debug('should add a new file');
        try {
          filePath = path.join(req.body.working_path, req.file.originalname);
        } catch (err) {
          return next(
            new Error(`Invalid file path: ${req.body.working_path} / ${req.file.originalname}`),
          );
        }
      }
      const editor = new FileUploadEditor({
        locals: res.locals,
        container,
        filePath,
        fileContents: req.file.buffer,
      });
      editor.shouldEdit((err, yes) => {
        if (ERR(err, next)) return;
        if (!yes) return res.redirect(req.originalUrl);
        editor.canEdit((err) => {
          if (ERR(err, next)) return;
          editor.doEdit((err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
              res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
              res.redirect(req.originalUrl);
            }
          });
        });
      });
    } else {
      return next(new Error('unknown __action: ' + req.body.__action));
    }
  });
});

module.exports = router;
