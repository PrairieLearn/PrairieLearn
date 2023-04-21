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
const { callbackify } = require('util');
const { logger } = require('@prairielearn/logger');
const { contains } = require('@prairielearn/path-utils');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('@prairielearn/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
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

  // This is a hack because we do not have a standard for how to serve
  // page-specific client-side code. I would normally have done this with
  // a route parameter, but all routes are being mapped to file paths, so
  // I am using a query string instead.
  if (req.query.serve) {
    if (req.query.serve === 'client') {
      debug('Responding to request for /instructorFileEditorClient.js');
      res.sendFile(path.join(__dirname, './instructorFileEditorClient.js'));
      return;
    } else {
      return next(new Error(`Invalid query: serve=${req.query.serve}`));
    }
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
      })
    );
  }

  // Do not allow users to edit files outside the course
  const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
  const relPath = path.relative(fileEdit.coursePath, fullPath);
  debug(
    `Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`
  );
  if (!contains(fileEdit.coursePath, fullPath)) {
    return next(
      error.make(400, `attempting to edit file outside course directory: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      })
    );
  }

  async.waterfall(
    [
      (callback) => {
        debug('Read from db');
        readEdit(fileEdit, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        debug('Read from disk');
        fs.readFile(fullPath, (err, contents) => {
          if (ERR(err, callback)) return;
          fileEdit.diskContents = b64Util.b64EncodeUnicode(contents.toString('utf8'));
          fileEdit.diskHash = getHash(fileEdit.diskContents);
          callback(null, contents);
        });
      },
      (contents, callback) => {
        isBinaryFile(contents).then(
          (result) => {
            debug(`isBinaryFile: ${result}`);
            if (result) {
              debug('found a binary file');
              callback(new Error('Cannot edit binary file'));
            } else {
              debug('found a text file');
              callback(null);
            }
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null); // should never get here
          }
        );
      },
      (callback) => {
        if (fileEdit.jobSequenceId == null) {
          callback(null);
        } else {
          debug('Read job sequence');
          serverJobs.getJobSequenceWithFormattedOutput(
            fileEdit.jobSequenceId,
            res.locals.course.id,
            (err, job_sequence) => {
              if (ERR(err, callback)) return;
              fileEdit.jobSequence = job_sequence;
              callback(null);
            }
          );
        }
      },
      (callback) => {
        callbackify(editorUtil.getErrorsAndWarningsForFilePath)(
          res.locals.course.id,
          relPath,
          (err, data) => {
            if (ERR(err, callback)) return;
            const ansiUp = new AnsiUp();
            fileEdit.sync_errors = data.errors;
            fileEdit.sync_errors_ansified = ansiUp.ansi_to_html(fileEdit.sync_errors);
            fileEdit.sync_warnings = data.warnings;
            fileEdit.sync_warnings_ansified = ansiUp.ansi_to_html(fileEdit.sync_warnings);
            callback(null);
          }
        );
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
        fileEdit.jobSequence.jobs.forEach((item) => {
          if (item.type === 'git_push' && item.status === 'Error') {
            fileEdit.failedPush = true;
          }
        });
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
    }
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
      })
    );
  }

  // Do not allow users to edit files outside the course
  const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
  const relPath = path.relative(fileEdit.coursePath, fullPath);
  debug(
    `Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`
  );
  if (!contains(fileEdit.coursePath, fullPath)) {
    return next(
      error.make(400, `attempting to edit file outside course directory: ${workingPath}`, {
        locals: res.locals,
        body: req.body,
      })
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
          }
        )
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
        res.locals.course_instance.short_name
      );
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath
      )}`;
    } else if (res.locals.navPage === 'assessment') {
      const rootPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid
      );
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath
      )}`;
    } else if (res.locals.navPage === 'question') {
      const rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
      fileEdit.commitMessage = `${path.basename(rootPath)}: edit ${path.relative(
        rootPath,
        fullPath
      )}`;
    } else {
      const rootPath = res.locals.course.path;
      fileEdit.commitMessage = `edit ${path.relative(rootPath, fullPath)}`;
    }

    async.series(
      [
        (callback) => {
          debug('Write edit to db');
          createEdit(fileEdit, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug('Write edit to disk (also push and sync if necessary)');
          fileEdit.needToSync = path.extname(fileEdit.fileName) === '.json';
          saveAndSync(fileEdit, res.locals, (err) => {
            // If there is an error, log it and pass null to the callback.
            if (ERR(err, (err) => logger.info(err))) {
              callback(null);
              return;
            }
            callback(null);
          });
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      }
    );
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

function getHash(contents) {
  return sha256(contents).toString();
}

function readEdit(fileEdit, callback) {
  async.series(
    [
      (callback) => {
        const params = {
          user_id: fileEdit.userID,
          course_id: fileEdit.courseID,
          dir_name: fileEdit.dirName,
          file_name: fileEdit.fileName,
        };
        debug(`Looking for previously saved drafts`);
        sqldb.query(sql.select_file_edit, params, (err, result) => {
          if (ERR(err, callback)) return;
          if (result.rows.length > 0) {
            debug(
              `Found ${result.rows.length} saved drafts, the first of which has id ${result.rows[0].id}`
            );
            if (result.rows[0].age < 24) {
              fileEdit.editID = result.rows[0].id;
              fileEdit.origHash = result.rows[0].orig_hash;
              fileEdit.didSave = result.rows[0].did_save;
              fileEdit.didSync = result.rows[0].did_sync;
              fileEdit.jobSequenceId = result.rows[0].job_sequence_id;
              fileEdit.fileID = result.rows[0].file_id;
              debug(`Draft: did_save=${fileEdit.didSave}, did_sync=${fileEdit.didSync}`);
            } else {
              debug(`Rejected this draft, which had age ${result.rows[0].age} >= 24 hours`);
            }
          } else {
            debug(`Found no saved drafts`);
          }
          callback(null);
        });
      },
      (callback) => {
        // We are choosing to soft-delete all drafts *before* reading the
        // contents of whatever draft we found, because we don't want to get
        // in a situation where the user is trapped with an unreadable draft.
        // We accept the possibility that a draft will occasionally be lost.
        const params = {
          user_id: fileEdit.userID,
          course_id: fileEdit.courseID,
          dir_name: fileEdit.dirName,
          file_name: fileEdit.fileName,
        };
        sqldb.query(sql.soft_delete_file_edit, params, (err, result) => {
          if (ERR(err, callback)) return;
          debug(`Deleted ${result.rowCount} previously saved drafts`);
          if (result.rowCount > 0) {
            result.rows.forEach((row) => {
              if (idsEqual(row.file_id, fileEdit.fileID)) {
                debug(
                  `Defer removal of file_id=${row.file_id} from file store until after reading contents`
                );
              } else {
                debug(`Remove file_id=${row.file_id} from file store`);
                deleteEditFromFileStore(row.file_id, fileEdit.userID, (err) => {
                  if (ERR(err, callback)) return;
                });
              }
            });
          }
          callback(null);
        });
      },
      (callback) => {
        if ('editID' in fileEdit) {
          debug('Read contents of file edit');
          readEditContents(fileEdit, (err, contents) => {
            if (ERR(err, callback)) return;
            fileEdit.editContents = contents;
            fileEdit.editHash = getHash(fileEdit.editContents);
            callback(null);
          });
        } else {
          callback(null);
        }
      },
      (callback) => {
        if ('fileID' in fileEdit) {
          debug(`Remove file_id=${fileEdit.fileID} from file store`);
          deleteEditFromFileStore(fileEdit.fileID, fileEdit.userID, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        } else {
          callback(null);
        }
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
}

function readEditContents(fileEdit, callback) {
  callbackify(async () => {
    const result = await fileStore.get(fileEdit.fileID);
    return b64Util.b64EncodeUnicode(result.contents.toString('utf8'));
  })(callback);
}

function updateJobSequenceId(fileEdit, job_sequence_id, callback) {
  sqldb.query(
    sql.update_job_sequence_id,
    {
      id: fileEdit.editID,
      job_sequence_id: job_sequence_id,
    },
    (err) => {
      if (ERR(err, callback)) return;
      debug(`Update file edit id=${fileEdit.editID}: job_sequence_id=${job_sequence_id}`);
      callback(null);
    }
  );
}

function updateDidSave(fileEdit, callback) {
  sqldb.query(
    sql.update_did_save,
    {
      id: fileEdit.editID,
    },
    (err) => {
      if (ERR(err, callback)) return;
      debug(`Update file edit id=${fileEdit.editID}: did_save=true`);
      callback(null);
    }
  );
}

function updateDidSync(fileEdit, callback) {
  sqldb.query(
    sql.update_did_sync,
    {
      id: fileEdit.editID,
    },
    (err) => {
      if (ERR(err, callback)) return;
      debug(`Update file edit id=${fileEdit.editID}: did_sync=true`);
      callback(null);
    }
  );
}

function deleteEditFromFileStore(file_id, authn_user_id, callback) {
  callbackify(async () => {
    await fileStore.delete(file_id, authn_user_id);
  })(callback);
}

function createEdit(fileEdit, callback) {
  async.series(
    [
      (callback) => {
        const params = {
          user_id: fileEdit.userID,
          course_id: fileEdit.courseID,
          dir_name: fileEdit.dirName,
          file_name: fileEdit.fileName,
        };
        sqldb.query(sql.soft_delete_file_edit, params, (err, result) => {
          if (ERR(err, callback)) return;
          debug(`Deleted ${result.rowCount} previously saved drafts`);
          if (result.rowCount > 0) {
            result.rows.forEach((row) => {
              debug(`Remove file_id=${row.file_id} from file store`);
              deleteEditFromFileStore(row.file_id, fileEdit.userID, (err) => {
                if (ERR(err, callback)) return;
              });
            });
          }
          callback(null);
        });
      },
      (callback) => {
        debug('Write contents to file edit');
        writeEdit(fileEdit, (err, fileID) => {
          if (ERR(err, callback)) return;
          fileEdit.fileID = fileID;
          fileEdit.didWriteEdit = true;
          callback(null);
        });
      },
      (callback) => {
        const params = {
          user_id: fileEdit.userID,
          course_id: fileEdit.courseID,
          dir_name: fileEdit.dirName,
          file_name: fileEdit.fileName,
          orig_hash: fileEdit.origHash,
          file_id: fileEdit.fileID,
        };
        debug(
          `Insert file edit into db: ${params.user_id}, ${params.course_id}, ${params.dir_name}, ${params.file_name}`
        );
        sqldb.queryOneRow(sql.insert_file_edit, params, (err, result) => {
          if (ERR(err, callback)) return;
          fileEdit.editID = result.rows[0].id;
          debug(`Created file edit in database with id ${fileEdit.editID}`);
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
}

function writeEdit(fileEdit, callback) {
  callbackify(async () => {
    const fileID = await fileStore.upload(
      fileEdit.fileName,
      Buffer.from(b64Util.b64DecodeUnicode(fileEdit.editContents), 'utf8'),
      'instructor_file_edit',
      null,
      null,
      fileEdit.userID, // TODO: could distinguish between user_id and authn_user_id,
      fileEdit.userID //       although I don't think there's any need to do so
    );
    debug(`writeEdit(): wrote file edit to file store with file_id=${fileID}`);
    return fileID;
  })(callback);
}

function saveAndSync(fileEdit, locals, callback) {
  const options = {
    course_id: locals.course.id,
    user_id: locals.user.user_id,
    authn_user_id: locals.authz_data.authn_user.user_id,
    type: 'sync',
    description: 'Save and sync an in-browser edit to a file',
    courseDir: locals.course.path,
  };

  serverJobs.createJobSequence(options, (err, job_sequence_id) => {
    // Return immediately if we fail to create a job sequence
    if (ERR(err, callback)) return;

    let gitEnv = process.env;
    if (config.gitSshCommand != null) {
      gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
    }

    let courseLock;
    let jobSequenceHasFailed = false;
    let startGitHash = null;
    let endGitHash = null;

    const _updateJobSequenceId = () => {
      debug(`${job_sequence_id}: _updateJobSequenceId`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'update_job_sequence_id',
        description: 'Add job sequence id to edit in database',
        job_sequence_id: job_sequence_id,
        on_success: _lock,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        debug('Add job sequence id to edit in database');
        updateJobSequenceId(fileEdit, job_sequence_id, (err) => {
          if (err) {
            job.fail(err);
          } else {
            job.verbose('Marked edit with job sequence id');
            job.succeed();
          }
        });
      });
    };

    const _lock = () => {
      debug(`${job_sequence_id}: _lock`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'lock',
        description: 'Lock',
        job_sequence_id: job_sequence_id,
        on_success: _getStartGitHash,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        const lockName = 'coursedir:' + options.courseDir;
        job.verbose(`Trying lock ${lockName}`);
        namedLocks.waitLock(lockName, { timeout: 5000 }, (err, lock) => {
          if (err) {
            job.fail(err);
          } else if (lock == null) {
            job.verbose(`Did not acquire lock ${lockName}`);
            job.fail(
              new Error(
                `Another user is already syncing or modifying the course: ${options.courseDir}`
              )
            );
          } else {
            courseLock = lock;
            job.verbose(`Acquired lock ${lockName}`);
            job.succeed();
          }
          return;
        });
      });
    };

    const _getStartGitHash = () => {
      courseUtil.getOrUpdateCourseCommitHash(locals.course, (err, hash) => {
        ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
        startGitHash = hash;

        if (fileEdit.doPull) {
          _pullFromRemoteFetch();
        } else {
          _checkHash();
        }
      });
    };

    const _pullFromRemoteFetch = () => {
      debug(`${job_sequence_id}: _pullFromRemoteFetch`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'fetch_from_git',
        description: 'Fetch from remote git repository',
        command: 'git',
        arguments: ['fetch'],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _pullFromRemoteClean,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _pullFromRemoteClean = () => {
      debug(`${job_sequence_id}: _pullFromRemoteClean`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'clean_git_repo',
        description: 'Clean local files not in remote git repository',
        command: 'git',
        arguments: ['clean', '-fdx'],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _pullFromRemoteReset,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _pullFromRemoteReset = () => {
      debug(`${job_sequence_id}: _pullFromRemoteReset`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'reset_from_git',
        description: 'Reset state to remote git repository',
        command: 'git',
        arguments: ['reset', '--hard', `origin/${locals.course.branch}`],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _checkHash,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _checkHash = () => {
      debug(`${job_sequence_id}: _checkHash`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'check_hash',
        description: 'Check hash',
        job_sequence_id: job_sequence_id,
        on_success: _writeFile,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
        fs.readFile(fullPath, 'utf8', (err, contents) => {
          if (err) {
            job.fail(err);
          } else {
            fileEdit.diskHash = getHash(b64Util.b64EncodeUnicode(contents));
            if (fileEdit.origHash !== fileEdit.diskHash) {
              job.fail(new Error(`Another user made changes to the file you were editing.`));
            } else {
              job.verbose('No changes were made to the file since you started editing.');
              job.succeed();
            }
          }
        });
      });
    };

    const _writeFile = () => {
      debug(`${job_sequence_id}: _writeFile`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'write_file',
        description: 'Write saved draft to disk',
        job_sequence_id: job_sequence_id,
        on_success: config.fileEditorUseGit ? _unstage : _didSave,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        job.verbose('Trying to write file');
        const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
        fs.writeFile(fullPath, b64Util.b64DecodeUnicode(fileEdit.editContents), 'utf8', (err) => {
          if (err) {
            job.fail(err);
          } else {
            debug(`Wrote file to ${fullPath}`);
            job.verbose(`Wrote file to ${fullPath}`);
            job.succeed();
          }
        });
      });
    };

    const _unstage = function () {
      debug(`${job_sequence_id}: _unstage`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_reset',
        description: 'Unstage all changes',
        command: 'git',
        arguments: ['reset'],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _add,
        on_error: _cleanupAfterWrite,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _add = function () {
      debug(`${job_sequence_id}: _add`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_add',
        description: 'Stage changes to file being edited',
        command: 'git',
        arguments: ['add', path.join(fileEdit.dirName, fileEdit.fileName)],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _commit,
        on_error: _cleanupAfterWrite,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _commit = function () {
      debug(`${job_sequence_id}: _commit`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_commit',
        description: 'Commit changes',
        command: 'git',
        arguments: [
          '-c',
          `user.name="${fileEdit.user_name}"`,
          '-c',
          `user.email="${fileEdit.uid}"`,
          'commit',
          '-m',
          fileEdit.commitMessage,
        ],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _push,
        on_error: _cleanupAfterWrite,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _push = function () {
      debug(`${job_sequence_id}: _push`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_push',
        description: 'Push to remote',
        command: 'git',
        arguments: ['push'],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _didSave,
        on_error: _cleanupAfterCommit,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _didSave = () => {
      debug(`${job_sequence_id}: _didSave`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'did_save',
        description: 'Mark edit as saved',
        job_sequence_id: job_sequence_id,
        on_success: _unlock,
        on_error: _cleanup,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        debug('Mark edit as saved');
        updateDidSave(fileEdit, (err) => {
          if (err) {
            job.fail(err);
          } else {
            job.verbose('Marked edit as saved');
            job.succeed();
          }
        });
      });
    };

    const _unlock = () => {
      debug(`${job_sequence_id}: _unlock`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'unlock',
        description: 'Unlock',
        job_sequence_id: job_sequence_id,
        on_success: jobSequenceHasFailed ? _finishWithFailure : _getEndCommitHash,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        namedLocks.releaseLock(courseLock, (err) => {
          if (err) {
            job.fail(err);
          } else {
            job.verbose(`Released lock`);
            job.succeed();
          }
        });
      });
    };

    const _getEndCommitHash = () => {
      debug(`${job_sequence_id}: _updateCommitHash`);
      courseUtil.getCommitHash(locals.course.path, (err, hash) => {
        ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
        endGitHash = hash;
        if (fileEdit.needToSync || config.chunksGenerator) {
          // If we're using chunks, then always sync on edit. We need the sync
          // data to force-generate new chunks.
          _syncFromDisk();
        } else {
          _reloadQuestionServers();
        }
      });
    };

    const _syncFromDisk = () => {
      debug(`${job_sequence_id}: _syncFromDisk`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'sync_from_disk',
        description: 'Sync course',
        job_sequence_id: job_sequence_id,
        on_success: _reloadQuestionServers,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }
        syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, (err, result) => {
          if (err) {
            job.fail(err);
            return;
          }

          const updateCourseCommitHash = () => {
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
              if (err) {
                job.fail(err);
              } else {
                checkJsonErrors();
              }
            });
          };

          const checkJsonErrors = () => {
            if (result.hadJsonErrors) {
              job.fail('One or more JSON files contained errors and were unable to be synced');
            } else {
              job.succeed();
            }
          };

          if (config.chunksGenerator) {
            callbackify(chunks.updateChunksForCourse)(
              {
                coursePath: locals.course.path,
                courseId: locals.course.id,
                courseData: result.courseData,
                oldHash: startGitHash,
                newHash: endGitHash,
              },
              (err, chunkChanges) => {
                if (err) {
                  job.fail(err);
                } else {
                  chunks.logChunkChangesToJob(chunkChanges, job);
                  updateCourseCommitHash();
                }
              }
            );
          } else {
            updateCourseCommitHash();
          }
        });
      });
    };

    const _reloadQuestionServers = () => {
      debug(`${job_sequence_id}: _reloadQuestionServers`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'reload_question_servers',
        description: 'Reload server.js code (for v2 questions)',
        job_sequence_id: job_sequence_id,
        on_success: _didSync,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }
        const coursePath = locals.course.path;
        requireFrontend.undefQuestionServers(coursePath, job, (err) => {
          if (err) {
            job.fail(err);
          } else {
            job.succeed();
          }
        });
      });
    };

    const _didSync = () => {
      debug(`${job_sequence_id}: _didSync`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'did_sync',
        description: 'Mark edit as synced',
        job_sequence_id: job_sequence_id,
        on_success: _finishWithSuccess,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        debug('Mark edit as synced');
        updateDidSync(fileEdit, (err) => {
          if (err) {
            job.fail(err);
          } else {
            job.verbose('Marked edit as synced');
            job.succeed();
          }
        });
      });
    };

    const _cleanupAfterCommit = (id) => {
      debug(`Job id ${id} has failed (after git commit)`);
      jobSequenceHasFailed = true;
      debug(`${job_sequence_id}: _cleanupAfterCommit`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_reset',
        description: 'Roll back commit',
        command: 'git',
        arguments: ['reset', '--hard', 'HEAD~1'],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _unlock,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _cleanupAfterWrite = (id) => {
      debug(`Job id ${id} has failed (after write)`);
      jobSequenceHasFailed = true;
      debug(`${job_sequence_id}: _cleanupAfterWrite`);
      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: job_sequence_id,
        type: 'git_checkout',
        description: 'Git checkout to revert changes to file on disk',
        command: 'git',
        arguments: ['checkout', path.join(fileEdit.dirName, fileEdit.fileName)],
        working_directory: fileEdit.coursePath,
        env: gitEnv,
        on_success: _unlock,
        on_error: _finishWithFailure,
        no_job_sequence_update: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const _cleanup = (id) => {
      debug(`Job id ${id} has failed`);
      jobSequenceHasFailed = true;
      _unlock();
    };

    const _finishWithSuccess = () => {
      debug(`${job_sequence_id}: _finishWithSuccess`);

      const jobOptions = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: 'finish',
        description: 'Finish job sequence',
        job_sequence_id: job_sequence_id,
        last_in_sequence: true,
      };
      serverJobs.createJob(jobOptions, (err, job) => {
        if (ERR(err, (err) => logger.info(err))) {
          _finishWithFailure();
          return;
        }

        job.verbose('Finished with success');
        job.succeed();
        callback(null, job_sequence_id);
      });
    };

    const _finishWithFailure = () => {
      debug(`${job_sequence_id}: _finishWithFailure`);
      serverJobs.failJobSequence(job_sequence_id);
      callback(null, job_sequence_id);
    };

    _updateJobSequenceId();
  });
}

module.exports = router;
