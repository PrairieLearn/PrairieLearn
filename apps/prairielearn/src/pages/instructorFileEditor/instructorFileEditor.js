const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:instructorFileEditor');
const { contains } = require('@prairielearn/path-utils');
const serverJobs = require('../../lib/server-jobs-legacy');
const { createServerJob } = require('../../lib/server-jobs');
const namedLocks = require('@prairielearn/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const { config } = require('../../lib/config');
const editorUtil = require('../../lib/editorUtil');
const { default: AnsiUp } = require('ansi_up');
const sha256 = require('crypto-js/sha256');
const b64Util = require('../../lib/base64-util');
const fileStore = require('../../lib/file-store');
const { isBinaryFile } = require('isbinaryfile');
const modelist = require('ace-code/src/ext/modelist');
const { decodePath } = require('../../lib/uri-util');
const chunks = require('../../lib/chunks');
const { idsEqual } = require('../../lib/id');
const { getPaths } = require('../../lib/instructorFiles');
const { getLockNameForCoursePath } = require('../../lib/course');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/*', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  let workingPath;
  if (req.params[0]) {
    try {
      workingPath = decodePath(req.params[0]);
    } catch (err) {
      return next(new Error(`Invalid path: ${req.params[0]}`));
    }
  } else {
    return next(new Error(`No path`));
  }

  let fileEdit = {
    uuid: uuidv4(),
    userID: res.locals.user.user_id,
    courseID: res.locals.course.id,
    coursePath: res.locals.course.path,
    dirName: path.dirname(workingPath),
    fileName: path.basename(workingPath),
    fileNameForDisplay: path.normalize(workingPath),
    aceMode: modelist.getModeForPath(workingPath).mode,
  };

  // Do not allow users to edit the exampleCourse
  if (res.locals.course.example_course) {
    return next(
      error.make(400, `attempting to edit file inside example course: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }

  // Do not allow users to edit files outside the course
  const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
  const relPath = path.relative(fileEdit.coursePath, fullPath);
  debug(
    `Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`,
  );
  if (!contains(fileEdit.coursePath, fullPath)) {
    return next(
      error.make(400, `attempting to edit file outside course directory: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }

  async.waterfall(
    [
      async () => {
        debug('Read from db');
        await readEdit(fileEdit);

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
        debug('Job sequence is still running - redirect to status page');
        res.redirect(`${res.locals.urlPrefix}/jobSequence/${fileEdit.jobSequenceId}`);
        return;
      }

      fileEdit.alertChoice = false;

      if ('editID' in fileEdit) {
        // There is a recently saved draft ...
        fileEdit.alertResults = true;
        if (!fileEdit.didSave && fileEdit.editHash !== fileEdit.diskHash) {
          // ...that was not written to disk and that differs from what is on disk.
          fileEdit.alertChoice = true;
          fileEdit.hasSameHash = fileEdit.origHash === fileEdit.diskHash;
        }
      }

      if ('jobSequence' in fileEdit) {
        // New case: single job for the entire operation. We check the flag
        // we would have set when the job executed to determine if the push
        // succeeded or not.
        if (!fileEdit.jobSequence.legacy) {
          const job = fileEdit.jobSequence.jobs[0];

          // We check for presence of the `pushed` key to determine if we
          // attempted a push, and we check for the value to know if the push
          // succeeded or not.
          if (job.data.pushAttempted && !job.data.pushSucceeded) {
            fileEdit.failedPush = true;
          }
        } else {
          // TODO: remove legacy case here once this has been running in production
          // for a while.
          fileEdit.jobSequence.jobs.forEach((item) => {
            if (item.type === 'git_push' && item.status === 'Error') {
              fileEdit.failedPush = true;
            }
          });
        }
      }

      if (!fileEdit.alertChoice) {
        fileEdit.editContents = fileEdit.diskContents;
        fileEdit.origHash = fileEdit.diskHash;
      }

      getPaths(req, res, (err, paths) => {
        if (ERR(err, next)) return;
        res.locals.fileEdit = fileEdit;
        res.locals.fileEdit.paths = paths;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      });
    },
  );
});

router.post('/*', (req, res, next) => {
  debug(`Responding to post with action ${req.body.__action}`);
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }

  let workingPath;
  if (req.params[0]) {
    try {
      workingPath = decodePath(req.params[0]);
    } catch (err) {
      return next(new Error(`Invalid path: ${req.params[0]}`));
    }
  } else {
    return next(new Error(`No path`));
  }

  let fileEdit = {
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

  // Do not allow users to edit the exampleCourse
  if (res.locals.course.example_course) {
    return next(
      error.make(400, `attempting to edit file inside example course: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }

  // Do not allow users to edit files outside the course
  const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
  const relPath = path.relative(fileEdit.coursePath, fullPath);
  debug(
    `Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`,
  );
  if (!contains(fileEdit.coursePath, fullPath)) {
    return next(
      error.make(400, `attempting to edit file outside course directory: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }

  if (req.body.__action === 'save_and_sync' || req.body.__action === 'pull_and_save_and_sync') {
    debug('Save and sync');

    // The "Save and Sync" button is enabled only when changes have been made
    // to the file, so - in principle - it should never be the case that editHash
    // and origHash are the same. We will treat this is a catastrophic error.
    fileEdit.editHash = getHash(fileEdit.editContents);
    if (fileEdit.editHash === fileEdit.origHash) {
      return next(
        error.make(
          400,
          `attempting to save a file without having made any changes: ${workingPath}`,
          {
            locals: res.locals,
            body: req.body,
          },
        ),
      );
    }

    // Whether or not to pull from remote git repo before proceeding to save and sync
    fileEdit.doPull = req.body.__action === 'pull_and_save_and_sync';

    if (res.locals.navPage === 'course_admin') {
      const rootPath = res.locals.course.path;
      fileEdit.commitMessage = `edit ${path.relative(rootPath, fullPath)}`;
    } else if (res.locals.navPage === 'instance_admin') {
      const rootPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
      );
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath,
      )}`;
    } else if (res.locals.navPage === 'assessment') {
      const rootPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
      );
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath,
      )}`;
    } else if (res.locals.navPage === 'question') {
      const rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath,
      )}`;
    } else {
      const rootPath = res.locals.course.path;
      fileEdit.commitMessage = `edit ${path.relative(rootPath, fullPath)}`;
    }

    async.series(
      [
        async () => {
          debug('Write edit to db');
          await createEdit(fileEdit);

          debug('Write edit to disk (also push and sync if necessary)');
          fileEdit.needToSync = path.extname(fileEdit.fileName) === '.json';
          await saveAndSync(fileEdit, res.locals);
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      },
    );
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

function getHash(contents) {
  return sha256(contents).toString();
}

async function readEdit(fileEdit) {
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
      fileEdit.didSave = draftResult.rows[0].did_save;
      fileEdit.didSync = draftResult.rows[0].did_sync;
      fileEdit.jobSequenceId = draftResult.rows[0].job_sequence_id;
      fileEdit.fileID = draftResult.rows[0].file_id;
      debug(`Draft: did_save=${fileEdit.didSave}, did_sync=${fileEdit.didSync}`);
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

async function updateJobSequenceId(fileEdit, job_sequence_id) {
  await sqldb.queryAsync(sql.update_job_sequence_id, {
    id: fileEdit.editID,
    job_sequence_id: job_sequence_id,
  });
  debug(`Update file edit id=${fileEdit.editID}: job_sequence_id=${job_sequence_id}`);
}

async function updateDidSave(fileEdit) {
  await sqldb.queryAsync(sql.update_did_save, {
    id: fileEdit.editID,
  });
  debug(`Update file edit id=${fileEdit.editID}: did_save=true`);
}

async function updateDidSync(fileEdit) {
  await sqldb.queryAsync(sql.update_did_sync, {
    id: fileEdit.editID,
  });
  debug(`Update file edit id=${fileEdit.editID}: did_sync=true`);
}

async function createEdit(fileEdit) {
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

  debug('Write contents to file edit');
  const fileID = await writeEdit(fileEdit);
  fileEdit.fileID = fileID;
  fileEdit.didWriteEdit = true;

  const params = {
    user_id: fileEdit.userID,
    course_id: fileEdit.courseID,
    dir_name: fileEdit.dirName,
    file_name: fileEdit.fileName,
    orig_hash: fileEdit.origHash,
    file_id: fileEdit.fileID,
  };
  debug(
    `Insert file edit into db: ${params.user_id}, ${params.course_id}, ${params.dir_name}, ${params.file_name}`,
  );
  const result = await sqldb.queryOneRowAsync(sql.insert_file_edit, params);
  fileEdit.editID = result.rows[0].id;
  debug(`Created file edit in database with id ${fileEdit.editID}`);
}

async function writeEdit(fileEdit) {
  const fileID = await fileStore.upload(
    fileEdit.fileName,
    Buffer.from(b64Util.b64DecodeUnicode(fileEdit.editContents), 'utf8'),
    'instructor_file_edit',
    null,
    null,
    fileEdit.userID, // TODO: could distinguish between user_id and authn_user_id,
    fileEdit.userID, //       although I don't think there's any need to do so
  );
  debug(`writeEdit(): wrote file edit to file store with file_id=${fileID}`);
  return fileID;
}

async function saveAndSync(fileEdit, locals) {
  const serverJob = await createServerJob({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    type: 'sync',
    description: 'Save and sync an in-browser edit to a file',
  });

  await serverJob.execute(async (job) => {
    await updateJobSequenceId(fileEdit, serverJob.jobSequenceId);

    const gitEnv = process.env;
    if (config.gitSshCommand != null) {
      gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
    }

    const lockName = getLockNameForCoursePath(locals.course.path);
    await namedLocks.tryWithLock(
      lockName,
      {
        timeout: 5000,
        onNotAcquired: () => {
          job.fail(`Another user is already syncing or modifying this course.`);
        },
      },
      async () => {
        const startGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(locals.course);

        if (fileEdit.doPull) {
          await job.exec('git', ['fetch'], {
            cwd: locals.course.path,
            env: gitEnv,
          });
          await job.exec('git', ['clean', '-fdx'], {
            cwd: locals.course.path,
            env: gitEnv,
          });
          await job.exec('git', ['reset', '--hard', `origin/${locals.course.branch}`], {
            cwd: locals.course.path,
            env: gitEnv,
          });
        }

        const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
        const contents = await fs.readFile(fullPath, 'utf8');
        fileEdit.diskHash = getHash(b64Util.b64EncodeUnicode(contents));
        if (fileEdit.origHash !== fileEdit.diskHash) {
          job.fail(`Another user made changes to the file you were editing.`);
        }

        await fs.writeFile(fullPath, b64Util.b64DecodeUnicode(fileEdit.editContents), 'utf8');
        job.verbose(`Wrote changed to ${fullPath}`);

        if (config.fileEditorUseGit) {
          try {
            await job.exec('git', ['reset'], {
              cwd: locals.course.path,
              env: gitEnv,
            });
            await job.exec('git', ['add', path.join(fileEdit.dirName, fileEdit.fileName)], {
              cwd: locals.course.path,
              env: gitEnv,
            });
            await job.exec(
              'git',
              [
                '-c',
                `user.name="${fileEdit.user_name}"`,
                '-c',
                `user.email="${fileEdit.uid}"`,
                'commit',
                '-m',
                fileEdit.commitMessage,
              ],
              {
                cwd: locals.course.path,
                env: gitEnv,
              },
            );
          } catch (err) {
            await job.exec('git', ['checkout', path.join(fileEdit.dirName, fileEdit.fileName)], {
              cwd: locals.course.path,
              env: gitEnv,
            });
            throw err;
          }

          try {
            job.data.pushAttempted = true;

            await job.exec('git', ['push'], {
              cwd: locals.course.path,
              env: gitEnv,
            });

            // Remember that we successfully pushed. When a user views the file
            // editing page again, we'll check for this flag to know if we need
            // to display instructions for a failed push.
            job.data.pushSucceeded = true;
          } catch (err) {
            await job.exec('git', ['reset', '--hard', 'HEAD~1'], {
              cwd: locals.course.path,
              env: gitEnv,
            });
            throw err;
          }
        }

        await updateDidSave(fileEdit);
        job.verbose('Marked edit as saved');

        if (fileEdit.needToSync || config.chunksGenerator) {
          // If we're using chunks, then always sync on edit. We need the sync
          // data to force-generate new chunks.
          const result = await syncFromDisk.syncDiskToSqlWithLock(
            locals.course.path,
            locals.course.id,
            job,
          );

          if (config.chunksGenerator) {
            const endGitHash = await courseUtil.getCommitHashAsync(locals.course.path);
            const chunkChanges = await chunks.updateChunksForCourse({
              coursePath: locals.course.path,
              courseId: locals.course.id,
              courseData: result.courseData,
              oldHash: startGitHash,
              newHash: endGitHash,
            });
            chunks.logChunkChangesToJob(chunkChanges, job);
          }

          // Note that we deliberately don't actually write the updated commit hash
          // to the database until after chunks have been updated. This ensures
          // that if the chunks update fails, we'll try again next time.
          await courseUtil.updateCourseCommitHashAsync(locals.course);

          if (result.hadJsonErrors) {
            job.fail('One or more JSON files contained errors and were unable to be synced');
          }
        }

        await updateDidSync(fileEdit);
        job.verbose('Marked edit as synced');
      },
    );
  });
}

module.exports = router;
