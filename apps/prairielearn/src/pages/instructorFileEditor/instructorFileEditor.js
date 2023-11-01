const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const serverJobs = require('../../lib/server-jobs-legacy');
const editorUtil = require('../../lib/editorUtil');
const { default: AnsiUp } = require('ansi_up');
const sha256 = require('crypto-js/sha256');
const b64Util = require('../../lib/base64-util');
const fileStore = require('../../lib/file-store');
const { isBinaryFile } = require('isbinaryfile');
const modelist = require('ace-code/src/ext/modelist');
const { idsEqual } = require('../../lib/id');
const { getCourseOwners } = require('../../lib/course');
const { getPaths } = require('../../lib/instructorFiles');
const { logger } = require('@prairielearn/logger');
const { FileModifyEditor } = require('../../lib/editors');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/*', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_edit) {
    // Access denied, but instead of sending them to an error page, we'll show
    // them an explanatory message and prompt them to get edit permissions.
    getCourseOwners(res.locals.course.id)
      .then((owners) => {
        res.locals.course_owners = owners;
        res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => next(err));
    return;
  }

  // Do not allow users to edit the exampleCourse
  if (res.locals.course.example_course) {
    res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    return;
  }

  // Do not allow users to edit files in bad locations (e.g., outside the
  // current course, outside the current course instance, etc.). Do this by
  // wrapping everything in getPaths, which throws an error on a bad path.
  getPaths(req, res, (err, paths) => {
    if (ERR(err, next)) return;

    // We could also check if the file exists, if the file actually is a
    // file and not a directory, if the file is non-binary, etc., and try
    // to give a graceful error message on the edit page rather than send
    // the user to an error page.
    //
    // We won't do that, on the assumption that most users get to an edit
    // page through our UI, which already tries to prevent letting users
    // go where they should not.

    const fullPath = paths.workingPath;
    const relPath = paths.workingPathRelativeToCourse;
    let fileEdit = {
      uuid: uuidv4(),
      userID: res.locals.user.user_id,
      courseID: res.locals.course.id,
      coursePath: paths.coursePath,
      dirName: path.dirname(relPath),
      fileName: path.basename(relPath),
      fileNameForDisplay: path.normalize(relPath),
      aceMode: modelist.getModeForPath(relPath).mode,
    };

    debug(
      `Edit file in browser\n` +
        ` fileName: ${fileEdit.fileName}\n` +
        ` coursePath: ${fileEdit.coursePath}\n` +
        ` fullPath: ${fullPath}\n` +
        ` relPath: ${relPath}`,
    );

    async.waterfall(
      [
        async () => {
          debug('Read from db');
          await readDraftEdit(fileEdit);

          debug('Read from disk');
          const contents = await fs.readFile(fullPath);
          fileEdit.diskContents = b64Util.b64EncodeUnicode(contents.toString('utf8'));
          fileEdit.diskHash = getHash(fileEdit.diskContents);

          const binary = await isBinaryFile(contents);
          debug(`isBinaryFile: ${binary}`);
          if (binary) {
            debug('found a binary file');
            throw new Error('Cannot edit binary file');
          } else {
            debug('found a text file');
          }

          if (fileEdit.jobSequenceId != null) {
            debug('Read job sequence');
            fileEdit.jobSequence = await serverJobs.getJobSequenceWithFormattedOutputAsync(
              fileEdit.jobSequenceId,
              res.locals.course.id,
            );
          }

          const data = await editorUtil.getErrorsAndWarningsForFilePath(
            res.locals.course.id,
            relPath,
          );
          const ansiUp = new AnsiUp();
          fileEdit.sync_errors = data.errors;
          fileEdit.sync_errors_ansified = ansiUp.ansi_to_html(fileEdit.sync_errors);
          fileEdit.sync_warnings = data.warnings;
          fileEdit.sync_warnings_ansified = ansiUp.ansi_to_html(fileEdit.sync_warnings);
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        if ('jobSequence' in fileEdit && fileEdit.jobSequence.status === 'Running') {
          // Because of the redirect, if the job sequence ends up failing to save,
          // then the corresponding draft will be lost (all drafts are soft-deleted
          // from the database on readDraftEdit).
          debug('Job sequence is still running - redirect to status page');
          res.redirect(`${res.locals.urlPrefix}/jobSequence/${fileEdit.jobSequenceId}`);
          return;
        }

        fileEdit.alertChoice = false;
        fileEdit.didSave = false;
        fileEdit.didSync = false;

        if ('jobSequence' in fileEdit) {
          // No draft is older than 24 hours, so it is safe to assume that no
          // job sequence is legacy... but, just in case, we will check and log
          // a warning if we find one. We will treat the corresponding draft as
          // if it was neither saved nor synced.
          if (fileEdit.jobSequence.legacy) {
            debug('Found a legacy job sequence');
            logger.warn(
              `Found a legacy job sequence (id=${fileEdit.jobSequenceId}) ` +
                `in a file edit (id=${fileEdit.editID})`,
            );
          } else {
            const job = fileEdit.jobSequence.jobs[0];

            debug(
              `Found a job sequence: ` +
                `syncAttempted=${job.data.syncAttempted}, ` +
                `syncSucceeded=${job.data.syncSucceeded}`,
            );

            // We check for the presence of a `syncAttempted` key to know if
            // we attempted a sync (if it exists, its value will be true). If
            // a sync was attempted, then the edit must have been saved (i.e,
            // written to disk in the case of no git, or written to disk and
            // then pushed in the case of git).
            if (job.data.syncAttempted) {
              fileEdit.didSave = true;

              // We check for the presence of a `syncSucceeded` key to know
              // if the sync was successful (if it exists, its value will be
              // true). Note that the cause of sync failure could be a file
              // other than the one being edited.
              if (job.data.syncSucceeded) {
                fileEdit.didSync = true;
              }
            }
          }
        }

        if ('editID' in fileEdit) {
          // There is a recently saved draft ...
          fileEdit.alertResults = true;
          if (!fileEdit.didSave && fileEdit.editHash !== fileEdit.diskHash) {
            // ...that was not written to disk and that differs from what is on disk.
            fileEdit.alertChoice = true;
            fileEdit.hasSameHash = fileEdit.origHash === fileEdit.diskHash;
          }
        }

        if (!fileEdit.alertChoice) {
          fileEdit.editContents = fileEdit.diskContents;
          fileEdit.origHash = fileEdit.diskHash;
        }

        res.locals.fileEdit = fileEdit;
        res.locals.fileEdit.paths = paths;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      },
    );
  });
});

router.post('/*', (req, res, next) => {
  debug('POST /');
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be a course Editor)'));
  }
  getPaths(req, res, (err, paths) => {
    if (ERR(err, next)) return;
    const container = {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    };

    // NOTE: All actions are meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

    if (req.body.__action === 'save_and_sync') {
      debug('Save and sync');

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: container,
        filePath: paths.workingPath,
        editContents: req.body.file_edit_contents,
        origHash: req.body.file_edit_orig_hash,
      });
      editor.shouldEdit((err, yes) => {
        if (ERR(err, next)) return;
        if (!yes) return res.redirect(req.originalUrl);
        editor.canEdit((err) => {
          if (ERR(err, next)) return;
          let editID = null;
          let jobSequenceID = null;
          async.series(
            [
              async () => {
                debug('Write draft file edit to db and to file store');
                const fileEdit = {
                  userID: res.locals.user.user_id,
                  courseID: res.locals.course.id,
                  dirName: req.body.file_edit_dir_name,
                  fileName: req.body.file_edit_file_name,
                  origHash: req.body.file_edit_orig_hash,
                  coursePath: res.locals.course.path,
                  uid: res.locals.user.uid,
                  user_name: res.locals.user.name,
                  editContents: req.body.file_edit_contents,
                };
                editID = await writeDraftEdit(fileEdit);
              },
              (callback) => {
                editor.doEdit((err, job_sequence_id) => {
                  // An error here should be logged but not passed on,
                  // because the UI will look at the job_sequence_id.
                  ERR(err, (e) => logger.error('Error in doEdit()', e));
                  jobSequenceID = job_sequence_id;
                  callback(null);
                });
              },
              async () => {
                await updateJobSequenceId(editID, jobSequenceID);
              },
            ],
            (err) => {
              if (ERR(err, next)) return;
              res.redirect(req.originalUrl);
            },
          );
        });
      });
    } else {
      return next(new Error('unknown __action: ' + req.body.__action));
    }
  });
});

function getHash(contents) {
  return sha256(contents).toString();
}

async function readDraftEdit(fileEdit) {
  debug(`Looking for previously saved drafts`);
  const draftResult = await sqldb.queryAsync(sql.select_file_edit, {
    user_id: fileEdit.userID,
    course_id: fileEdit.courseID,
    dir_name: fileEdit.dirName,
    file_name: fileEdit.fileName,
  });
  if (draftResult.rows.length > 0) {
    debug(
      `Found ${draftResult.rows.length} saved drafts, the first of which has id ${draftResult.rows[0].id}`,
    );
    if (draftResult.rows[0].age < 24) {
      fileEdit.editID = draftResult.rows[0].id;
      fileEdit.origHash = draftResult.rows[0].orig_hash;
      fileEdit.jobSequenceId = draftResult.rows[0].job_sequence_id;
      fileEdit.fileID = draftResult.rows[0].file_id;
    } else {
      debug(`Rejected this draft, which had age ${draftResult.rows[0].age} >= 24 hours`);
    }
  } else {
    debug(`Found no saved drafts`);
  }

  // We are choosing to soft-delete all drafts *before* reading the
  // contents of whatever draft we found, because we don't want to get
  // in a situation where the user is trapped with an unreadable draft.
  // We accept the possibility that a draft will occasionally be lost.
  const result = await sqldb.queryAsync(sql.soft_delete_file_edit, {
    user_id: fileEdit.userID,
    course_id: fileEdit.courseID,
    dir_name: fileEdit.dirName,
    file_name: fileEdit.fileName,
  });
  debug(`Deleted ${result.rowCount} previously saved drafts`);
  for (const row of result.rows) {
    if (idsEqual(row.file_id, fileEdit.fileID)) {
      debug(`Defer removal of file_id=${row.file_id} from file store until after reading contents`);
    } else {
      debug(`Remove file_id=${row.file_id} from file store`);
      await fileStore.delete(row.file_id, fileEdit.userID);
    }
  }

  if ('editID' in fileEdit) {
    debug('Read contents of file edit');
    const result = await fileStore.get(fileEdit.fileID);
    const contents = b64Util.b64EncodeUnicode(result.contents.toString('utf8'));
    fileEdit.editContents = contents;
    fileEdit.editHash = getHash(fileEdit.editContents);

    debug(`Remove file_id=${fileEdit.fileID} from file store`);
    await fileStore.delete(fileEdit.fileID, fileEdit.userID);
  }
}

async function updateJobSequenceId(edit_id, job_sequence_id) {
  await sqldb.queryAsync(sql.update_job_sequence_id, {
    id: edit_id,
    job_sequence_id: job_sequence_id,
  });
  debug(`Update file edit id=${edit_id}: job_sequence_id=${job_sequence_id}`);
}

async function writeDraftEdit(fileEdit) {
  const deletedFileEdits = await sqldb.queryAsync(sql.soft_delete_file_edit, {
    user_id: fileEdit.userID,
    course_id: fileEdit.courseID,
    dir_name: fileEdit.dirName,
    file_name: fileEdit.fileName,
  });
  debug(`Deleted ${deletedFileEdits.rowCount} previously saved drafts`);
  for (const row of deletedFileEdits.rows) {
    debug(`Remove file_id=${row.file_id} from file store`);
    await fileStore.delete(row.file_id, fileEdit.userID);
  }

  debug('Write contents to file store');
  const fileID = await fileStore.upload(
    fileEdit.fileName,
    Buffer.from(b64Util.b64DecodeUnicode(fileEdit.editContents), 'utf8'),
    'instructor_file_edit',
    null,
    null,
    fileEdit.userID, // TODO: could distinguish between user_id and authn_user_id,
    fileEdit.userID, //       although I don't think there's any need to do so
  );
  debug(`Wrote file_id=${fileID} to file store`);

  const params = {
    user_id: fileEdit.userID,
    course_id: fileEdit.courseID,
    dir_name: fileEdit.dirName,
    file_name: fileEdit.fileName,
    orig_hash: fileEdit.origHash,
    file_id: fileID,
  };
  debug(
    `Insert file edit into db: ${params.user_id}, ${params.course_id}, ${params.dir_name}, ${params.file_name}`,
  );
  const result = await sqldb.queryOneRowAsync(sql.insert_file_edit, params);
  const editID = result.rows[0].id;
  debug(`Created file edit in database with id ${editID}`);
  return editID;
}

module.exports = router;
