// @ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
import * as async from 'async';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
const debug = require('debug')('prairielearn:instructorFileEditor');
import * as serverJobs from '../../lib/server-jobs-legacy';
import { getErrorsAndWarningsForFilePath } from '../../lib/editorUtil';
import AnsiUp from 'ansi_up';
const sha256 = require('crypto-js/sha256');
import { b64EncodeUnicode, b64DecodeUnicode } from '../../lib/base64-util';
import { deleteFile, getFile, uploadFile } from '../../lib/file-store';
import { isBinaryFile } from 'isbinaryfile';
import * as modelist from 'ace-code/src/ext/modelist';
import { idsEqual } from '../../lib/id';
import { getPathsCallback } from '../../lib/instructorFiles';
import { getCourseOwners } from '../../lib/course';
import { logger } from '@prairielearn/logger';
import { FileModifyEditor } from '../../lib/editors';

const router = express.Router();
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
  getPathsCallback(req, res, (err, paths) => {
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
      authnUserId: res.locals.authn_user.user_id,
      courseID: res.locals.course.id,
      coursePath: paths.coursePath,
      dirName: path.dirname(relPath),
      fileName: path.basename(relPath),
      fileNameForDisplay: path.normalize(relPath),
      aceMode: modelist.getModeForPath(relPath).mode,
      jobSequence: /** @type {any} */ (null),
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
          fileEdit.diskContents = b64EncodeUnicode(contents.toString('utf8'));
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

          const data = await getErrorsAndWarningsForFilePath(res.locals.course.id, relPath);
          const ansiUp = new AnsiUp();
          fileEdit.sync_errors = data.errors;
          fileEdit.sync_errors_ansified = ansiUp.ansi_to_html(fileEdit.sync_errors);
          fileEdit.sync_warnings = data.warnings;
          fileEdit.sync_warnings_ansified = ansiUp.ansi_to_html(fileEdit.sync_warnings);
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        if (fileEdit && fileEdit.jobSequence?.status === 'Running') {
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

        if (fileEdit.jobSequence) {
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

            debug('Found a job sequence');
            debug(` saveAttempted=${job.data.saveAttempted}`);
            debug(` saveSucceeded=${job.data.saveSucceeded}`);
            debug(` syncAttempted=${job.data.syncAttempted}`);
            debug(` syncSucceeded=${job.data.syncSucceeded}`);

            // We check for the presence of a `saveSucceeded` key to know if
            // the edit was saved (i.e., written to disk in the case of no git,
            // or written to disk and then pushed in the case of git). If this
            // key exists, its value will be true.
            if (job.data.saveSucceeded) {
              fileEdit.didSave = true;

              // We check for the presence of a `syncSucceeded` key to know
              // if the sync was successful. If this key exists, its value will
              // be true. Note that the cause of sync failure could be a file
              // other than the one being edited.
              //
              // By "the sync" we mean "the sync after a successfully saved
              // edit." Remember that, if using git, we pull before we push.
              // So, if we error on save, then we still try to sync whatever
              // was pulled from the remote repository, even though changes
              // made by the edit will have been discarded. We ignore this
              // in the UI for now.
              if (job.data.syncSucceeded) {
                fileEdit.didSync = true;
              }
            }
          }
        }

        if (fileEdit.editID) {
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

  getPathsCallback(req, res, (err, paths) => {
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
        container,
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
                  authnUserID: res.locals.authn_user.user_id,
                  courseID: res.locals.course.id,
                  dirName: paths.workingDirectory,
                  fileName: paths.workingFilename,
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
      return next(error.make(400, `unknown __action: ${req.body.__action}`));
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
      await deleteFile(row.file_id, fileEdit.userID);
    }
  }

  if (fileEdit.editID) {
    debug('Read contents of file edit');
    const result = await getFile(fileEdit.fileID);
    const contents = b64EncodeUnicode(result.contents.toString('utf8'));
    fileEdit.editContents = contents;
    fileEdit.editHash = getHash(fileEdit.editContents);

    debug(`Remove file_id=${fileEdit.fileID} from file store`);
    await deleteFile(fileEdit.fileID, fileEdit.userID);
  }
}

async function updateJobSequenceId(edit_id, job_sequence_id) {
  await sqldb.queryAsync(sql.update_job_sequence_id, {
    id: edit_id,
    job_sequence_id,
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
    await deleteFile(row.file_id, fileEdit.userID);
  }

  debug('Write contents to file store');
  const fileID = await uploadFile({
    display_filename: fileEdit.fileName,
    contents: Buffer.from(b64DecodeUnicode(fileEdit.editContents), 'utf8'),
    type: 'instructor_file_edit',
    assessment_id: null,
    assessment_instance_id: null,
    instance_question_id: null,
    user_id: fileEdit.userID,
    authn_user_id: fileEdit.authnUserID,
  });
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

export default router;
