const ERR = require('async-stacktrace');
const _ = require('lodash');
const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const namedLocks = require('../lib/named-locks');
const syncFromDisk = require('../sync/syncFromDisk');
const courseUtil = require('../lib/courseUtil');
const requireFrontend = require('../lib/require-frontend');
const config = require('../lib/config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../prairielib/error');
const fs = require('fs-extra');
const async = require('async');
const { v4: uuidv4 } = require('uuid');
const sha256 = require('crypto-js/sha256');
const util = require('util');
const chunks = require('./chunks');
const { escapeRegExp } = require('../prairielib/util');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

function contains(parentPath, childPath) {
  const relPath = path.relative(parentPath, childPath);
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}

class Editor {
  constructor(params) {
    this.authz_data = params.locals.authz_data;
    this.course = params.locals.course;
    this.user = params.locals.user;
    this.course_instance = params.locals.course_instance;
    this.assessment = params.locals.assessment;
    this.assessment_set = params.locals.assessment_set;
    this.question = params.locals.question;
  }

  write(callback) {
    callback(new Error('write must be defined in a subclass'));
  }

  canEdit(callback) {
    // Do not allow users to edit without permission
    if (!this.authz_data.has_course_permission_edit) {
      return callback(error.make(403, 'Access denied (must be course editor)'));
    }

    // Do not allow users to edit the exampleCourse
    if (this.course.example_course) {
      return callback(new Error(`Access denied (cannot edit the example course)`));
    }

    callback(null);
  }

  doEdit(callback) {
    const options = {
      course_id: this.course.id,
      user_id: this.user.user_id,
      authn_user_id: this.authz_data.authn_user.user_id,
      type: 'sync',
      description: this.description,
      courseDir: this.course.path,
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
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
            _finishWithFailure();
            return;
          }

          const lockName = 'coursedir:' + options.courseDir;
          job.verbose(`Trying lock ${lockName}`);
          namedLocks.waitLock(lockName, { timeout: 5000 }, (err, lock) => {
            if (ERR(err, (e) => logger.error('Error in waitLock()', e))) {
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
        courseUtil.getOrUpdateCourseCommitHash(this.course, (err, hash) => {
          ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
          startGitHash = hash;

          if (config.fileEditorUseGit) {
            _clean(_write, _cleanup);
          } else {
            _write();
          }
        });
      };

      const _clean = (on_success, on_error) => {
        debug(`${job_sequence_id}: _clean`);
        const jobOptions = {
          course_id: options.course_id,
          user_id: options.user_id,
          authn_user_id: options.authn_user_id,
          job_sequence_id: job_sequence_id,
          type: 'clean_git_repo',
          description: 'Clean local files not in remote git repository',
          command: 'git',
          arguments: ['clean', '-fdx'],
          working_directory: this.course.path,
          env: gitEnv,
          on_success: () => {
            _reset(on_success, on_error);
          },
          on_error: on_error,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _reset = (on_success, on_error) => {
        debug(`${job_sequence_id}: _reset`);
        const jobOptions = {
          course_id: options.course_id,
          user_id: options.user_id,
          authn_user_id: options.authn_user_id,
          job_sequence_id: job_sequence_id,
          type: 'reset_from_git',
          description: 'Reset state to remote git repository',
          command: 'git',
          arguments: ['reset', '--hard', 'origin/master'],
          working_directory: this.course.path,
          env: gitEnv,
          on_success: on_success,
          on_error: on_error,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _write = () => {
        debug(`${job_sequence_id}: _write`);
        const jobOptions = {
          course_id: options.course_id,
          user_id: options.user_id,
          authn_user_id: options.authn_user_id,
          type: 'write',
          description: 'Write to disk',
          job_sequence_id: job_sequence_id,
          on_success: config.fileEditorUseGit ? _add : _syncFromDisk,
          on_error: config.fileEditorUseGit ? _cleanupAfterWrite : _cleanup,
          no_job_sequence_update: true,
        };
        serverJobs.createJob(jobOptions, (err, job) => {
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
            _finishWithFailure();
            return;
          }

          this.write((err) => {
            if (ERR(err, (e) => logger.error('Error in write()', e))) {
              job.fail(err);
            } else {
              job.succeed();
            }
          });
        });
      };

      const _add = () => {
        debug(`${job_sequence_id}: _add`);
        const jobOptions = {
          course_id: options.course_id,
          user_id: options.user_id,
          authn_user_id: options.authn_user_id,
          job_sequence_id: job_sequence_id,
          type: 'git_add',
          description: 'Stage changes',
          command: 'git',
          arguments: ['add'].concat(this.pathsToAdd),
          working_directory: this.course.path,
          env: gitEnv,
          on_success: _commit,
          on_error: _cleanupAfterWrite,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _commit = () => {
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
            `user.name="${this.user.name}"`,
            '-c',
            `user.email="${this.user.uid}"`,
            'commit',
            '-m',
            this.commitMessage,
          ],
          working_directory: this.course.path,
          env: gitEnv,
          on_success: _push,
          on_error: _cleanupAfterWrite,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _push = () => {
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
          working_directory: this.course.path,
          env: gitEnv,
          on_success: _updateCommitHash,
          on_error: _cleanupAfterCommit,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _updateCommitHash = () => {
        debug(`${job_sequence_id}: _updateCommitHash`);
        courseUtil.updateCourseCommitHash(this.course, (err, hash) => {
          ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
          endGitHash = hash;
          _syncFromDisk();
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
          on_error: _cleanup,
          no_job_sequence_update: true,
        };
        serverJobs.createJob(jobOptions, (err, job) => {
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
            _finishWithFailure();
            return;
          }
          syncFromDisk._syncDiskToSqlWithLock(
            this.course.path,
            this.course.id,
            job,
            (err, result) => {
              if (ERR(err, (e) => logger.error('Error in _syncDiskToSqlWithLock()', e))) {
                debug('_syncDiskToSqlWithLock(): failure');
                job.fail(err);
              } else {
                if (config.chunksGenerator) {
                  util.callbackify(chunks.updateChunksForCourse)(
                    {
                      coursePath: this.course.path,
                      courseId: this.course.id,
                      courseData: result.courseData,
                      oldHash: startGitHash,
                      newHash: endGitHash,
                    },
                    (err) => {
                      if (err) {
                        job.fail(err);
                        return;
                      }
                      job.succeed();
                    }
                  );
                } else {
                  job.succeed();
                }
              }
            }
          );
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
          on_success: _unlock,
          on_error: _cleanup,
          no_job_sequence_update: true,
        };
        serverJobs.createJob(jobOptions, (err, job) => {
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
            _finishWithFailure();
            return;
          }
          const coursePath = this.course.path;
          requireFrontend.undefQuestionServers(coursePath, job, (err) => {
            if (ERR(err, (e) => logger.error('Error in undefQuestionServers()', e))) {
              job.fail(err);
            } else {
              job.succeed();
            }
          });
        });
      };

      const _cleanupAfterCommit = (id) => {
        debug(`Job id ${id} has failed (after git commit)`);
        jobSequenceHasFailed = true;
        _reset(_unlock, _unlock);
      };

      const _cleanupAfterWrite = (id) => {
        debug(`Job id ${id} has failed (after write)`);
        jobSequenceHasFailed = true;
        _clean(_unlock, _unlock);
      };

      const _cleanup = (id) => {
        debug(`Job id ${id} has failed`);
        jobSequenceHasFailed = true;
        _unlock();
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
          on_success: jobSequenceHasFailed ? _finishWithFailure : _finishWithSuccess,
          on_error: _finishWithFailure,
          no_job_sequence_update: true,
        };
        serverJobs.createJob(jobOptions, (err, job) => {
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
            _finishWithFailure();
            return;
          }

          namedLocks.releaseLock(courseLock, (err) => {
            if (ERR(err, (e) => logger.error('Error in releaseLock()', e))) {
              job.fail(err);
            } else {
              job.verbose(`Released lock`);
              job.succeed();
            }
          });
        });
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
          if (ERR(err, (e) => logger.error('Error in createJob()', e))) {
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
        callback(new Error('edit failed'), job_sequence_id);
      };

      _lock();
    });
  }

  /**
   * Remove empty preceding subfolders for a question, assessment, etc. based on its ID.
   * This should be run after renames or deletes to prevent syncing issues.
   * @param rootDirectory Root directory that the items are being stored in.
   * @param id Item to delete root subfolders for, relative from the root directory.
   * @callback {function(err)} Function to call once this has finished.
   */
  removeEmptyPrecedingSubfolders(rootDirectory, id, callback) {
    const idSplit = id.split(path.sep);

    /* Start deleting subfolders in reverse order */
    const reverseFolders = idSplit.slice(0, -1).reverse();
    debug('Checking folders', reverseFolders);

    let seenNonemptyFolder = false;
    async.eachOfSeries(
      reverseFolders,
      (folder, index, callback) => {
        if (!seenNonemptyFolder) {
          const delPath = path.join(rootDirectory, ...idSplit.slice(0, idSplit.length - 1 - index));
          debug('Checking', delPath);

          fs.readdir(delPath, (err, files) => {
            if (ERR(err, callback)) return;

            /* Delete the subfolder if it's empty, otherwise stop here */
            if (files.length > 0) {
              debug(delPath, 'is nonempty, stopping here.');
              debug('Folder contains', files);
              seenNonemptyFolder = true;
              callback(null);
            } else {
              debug('No files, deleting', delPath);
              fs.remove(delPath, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
              });
            }
          });
        } else {
          callback(null);
        }
      },
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }

  /**
   * Get all existing shortnames, recursing on nonempty directories that do not contain
   * an ".info" file.
   * @param rootDirectory Directory to start searching from.
   * @param infoFile Name of the info file, will stop recursing once a directory contains this.
   * @param callback {function(err, files)} Function that is called once this has completed.
   */
  getExistingShortNames(rootDirectory, infoFile, callback) {
    let files = [];
    const walk = (relativeDir, callback) => {
      fs.readdir(path.join(rootDirectory, relativeDir), (err, directories) => {
        if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
          /* If the directory doesn't exist, then we have nothing to load */
          return callback(null);
        }
        if (ERR(err, callback)) return;

        /* For each subdirectory, try to find an Info file */
        async.each(
          directories,
          (dir, callback) => {
            /* Relative path to the current folder */
            const subdirPath = path.join(relativeDir, dir);
            /* Absolute path to the info file */
            const infoPath = path.join(rootDirectory, subdirPath, infoFile);
            fs.access(infoPath, (err) => {
              if (!err) {
                /* Info file exists, we can use this directory */
                files.push(subdirPath);
                callback(null);
              } else {
                /* No info file, let's try recursing */
                walk(subdirPath, (err) => {
                  if (ERR(err, callback)) return;
                  callback(null);
                });
              }
            });
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      });
    };

    return walk('', (err) => {
      if (ERR(err, callback)) return;
      debug('getExistingShortNames() returning', files);
      callback(null, files);
    });
  }

  getNamesForCopy(oldShortName, shortNames, oldLongName, longNames) {
    function getBaseShortName(oldname) {
      const found = oldname.match(new RegExp(`^(.*)_copy[0-9]+$`));
      if (found) {
        return found[1];
      } else {
        return oldname;
      }
    }

    function getBaseLongName(oldname) {
      if (!_.isString(oldname)) return 'Unknown';
      debug(oldname);
      const found = oldname.match(new RegExp(`^(.*) \\(copy [0-9]+\\)$`));
      debug(found);
      if (found) {
        return found[1];
      } else {
        return oldname;
      }
    }

    function getNumberShortName(basename, oldnames) {
      let number = 1;
      oldnames.forEach((oldname) => {
        const found = oldname.match(new RegExp(`^${escapeRegExp(basename)}_copy([0-9]+)$`));
        if (found) {
          const foundNumber = parseInt(found[1]);
          if (foundNumber >= number) {
            number = foundNumber + 1;
          }
        }
      });
      return number;
    }

    function getNumberLongName(basename, oldnames) {
      let number = 1;
      oldnames.forEach((oldname) => {
        if (!_.isString(oldname)) return;
        const found = oldname.match(new RegExp(`^${escapeRegExp(basename)} \\(copy ([0-9]+)\\)$`));
        if (found) {
          const foundNumber = parseInt(found[1]);
          if (foundNumber >= number) {
            number = foundNumber + 1;
          }
        }
      });
      return number;
    }

    const baseShortName = getBaseShortName(oldShortName);
    const baseLongName = getBaseLongName(oldLongName);
    const numberShortName = getNumberShortName(baseShortName, shortNames);
    const numberLongName = getNumberLongName(baseLongName, longNames);
    const number = numberShortName > numberLongName ? numberShortName : numberLongName;
    return {
      shortName: `${baseShortName}_copy${number}`,
      longName: `${baseLongName} (copy ${number})`,
    };
  }

  getNamesForAdd(shortNames, longNames) {
    function getNumberShortName(oldnames) {
      let number = 1;
      oldnames.forEach((oldname) => {
        const found = oldname.match(new RegExp(`^New_([0-9]+)$`));
        if (found) {
          const foundNumber = parseInt(found[1]);
          if (foundNumber >= number) {
            number = foundNumber + 1;
          }
        }
      });
      return number;
    }

    function getNumberLongName(oldnames) {
      let number = 1;
      oldnames.forEach((oldname) => {
        if (!_.isString(oldname)) return;
        const found = oldname.match(new RegExp(`^New \\(([0-9]+)\\)$`));
        if (found) {
          const foundNumber = parseInt(found[1]);
          if (foundNumber >= number) {
            number = foundNumber + 1;
          }
        }
      });
      return number;
    }

    const numberShortName = getNumberShortName(shortNames);
    const numberLongName = getNumberLongName(longNames);
    const number = numberShortName > numberLongName ? numberShortName : numberLongName;
    return {
      shortName: `New_${number}`,
      longName: `New (${number})`,
    };
  }
}

class AssessmentCopyEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid}`;
  }

  write(callback) {
    debug('AssessmentCopyEditor: write()');
    const assessmentsPath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments'
    );
    async.waterfall(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_assessments_with_course_instance,
            { course_instance_id: this.course_instance.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'title');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(assessmentsPath, 'infoAssessment.json', (err, filenames) => {
            if (ERR(err, callback)) return;
            this.oldNamesShort = filenames;
            callback(null);
          });
        },
        (callback) => {
          debug(`Generate TID and Title`);
          let names = this.getNamesForCopy(
            this.assessment.tid,
            this.oldNamesShort,
            this.assessment.title,
            this.oldNamesLong
          );
          this.tid = names.shortName;
          this.assessmentTitle = names.longName;
          this.assessmentPath = path.join(assessmentsPath, this.tid);
          this.pathsToAdd = [this.assessmentPath];
          this.commitMessage = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid} to ${this.tid}`;
          callback(null);
        },
        (callback) => {
          const fromPath = path.join(assessmentsPath, this.assessment.tid);
          const toPath = this.assessmentPath;
          debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
          fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`Read infoAssessment.json`);
          fs.readJson(path.join(this.assessmentPath, 'infoAssessment.json'), (err, infoJson) => {
            if (ERR(err, callback)) return;
            callback(null, infoJson);
          });
        },
        (infoJson, callback) => {
          debug(`Write infoAssessment.json with new title and uuid`);
          infoJson.title = this.assessmentTitle;
          this.uuid = uuidv4(); // <-- store uuid so we can find the new assessment in the DB
          infoJson.uuid = this.uuid;
          fs.writeJson(
            path.join(this.assessmentPath, 'infoAssessment.json'),
            infoJson,
            { spaces: 4 },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class AssessmentDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
  }

  write(callback) {
    debug('AssessmentDeleteEditor: write()');
    const deletePath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments'
    );
    fs.remove(path.join(deletePath, this.assessment.tid), (err) => {
      if (ERR(err, callback)) return;
      this.removeEmptyPrecedingSubfolders(deletePath, this.assessment.tid, (err) => {
        if (ERR(err, callback)) return;
        this.pathsToAdd = [path.join(deletePath, this.assessment.tid)];
        this.commitMessage = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
        callback(null);
      });
    });
  }
}

class AssessmentRenameEditor extends Editor {
  constructor(params) {
    super(params);
    this.tid_new = params.tid_new;
    this.description = `${this.course_instance.short_name}: rename assessment ${this.assessment.tid}`;
  }

  canEdit(callback) {
    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('AssessmentRenameEditor: write()');
    const basePath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments'
    );
    const oldPath = path.join(basePath, this.assessment.tid);
    const newPath = path.join(basePath, this.tid_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    fs.move(oldPath, newPath, { overwrite: false }, (err) => {
      if (ERR(err, callback)) return;
      this.removeEmptyPrecedingSubfolders(basePath, this.course_instance.short_name, (err) => {
        if (ERR(err, callback)) return;
        this.pathsToAdd = [oldPath, newPath];
        this.commitMessage = `${this.course_instance.short_name}: rename assessment ${this.assessment.tid} to ${this.tid_new}`;
        callback(null);
      });
    });
  }
}

class AssessmentAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `${this.course_instance.short_name}: add assessment`;
  }

  write(callback) {
    debug('AssessmentAddEditor: write()');
    const assessmentsPath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments'
    );
    async.series(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_assessments_with_course_instance,
            { course_instance_id: this.course_instance.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'title');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(assessmentsPath, 'infoAssessment.json', (err, filenames) => {
            if (ERR(err, callback)) return;
            this.oldNamesShort = filenames;
            callback(null);
          });
        },
        (callback) => {
          debug(`Generate TID and Title`);
          let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
          this.tid = names.shortName;
          this.assessmentTitle = names.longName;
          this.assessmentPath = path.join(assessmentsPath, this.tid);
          this.pathsToAdd = [this.assessmentPath];
          this.commitMessage = `${this.course_instance.short_name}: add assessment ${this.tid}`;
          callback(null);
        },
        (callback) => {
          debug(`Write infoAssessment.json`);

          this.uuid = uuidv4(); // <-- store uuid so we can find the new assessment in the DB

          let infoJson = {
            uuid: this.uuid,
            type: 'Homework',
            title: this.assessmentTitle,
            set: 'Homework',
            number: '1',
            allowAccess: [],
            zones: [],
          };

          // We use outputJson to create the directory this.assessmentsPath if it
          // does not exist (which it shouldn't). We use the file system flag 'wx'
          // to throw an error if this.assessmentPath already exists.
          fs.outputJson(
            path.join(this.assessmentPath, 'infoAssessment.json'),
            infoJson,
            { spaces: 4, flag: 'wx' },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class CourseInstanceCopyEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Copy course instance ${this.course_instance.short_name}`;
  }

  write(callback) {
    debug('CourseInstanceCopyEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');
    async.waterfall(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_course_instances_with_course,
            { course_id: this.course.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'long_name');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(
            courseInstancesPath,
            'infoCourseInstance.json',
            (err, filenames) => {
              if (ERR(err, callback)) return;
              this.oldNamesShort = filenames;
              callback(null);
            }
          );
        },
        (callback) => {
          debug(`Generate short_name and long_name`);
          let names = this.getNamesForCopy(
            this.course_instance.short_name,
            this.oldNamesShort,
            this.course_instance.long_name,
            this.oldNamesLong
          );
          this.short_name = names.shortName;
          this.long_name = names.longName;
          this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
          this.pathsToAdd = [this.courseInstancePath];
          this.commitMessage = `copy course instance ${this.course_instance.short_name} to ${this.short_name}`;
          callback(null);
        },
        (callback) => {
          const fromPath = path.join(courseInstancesPath, this.course_instance.short_name);
          const toPath = this.courseInstancePath;
          debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
          fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`Read infoCourseInstance.json`);
          fs.readJson(
            path.join(this.courseInstancePath, 'infoCourseInstance.json'),
            (err, infoJson) => {
              if (ERR(err, callback)) return;
              callback(null, infoJson);
            }
          );
        },
        (infoJson, callback) => {
          debug(`Write infoCourseInstance.json with new longName and uuid`);
          infoJson.longName = this.long_name;
          this.uuid = uuidv4(); // <-- store uuid so we can find the new course instance in the DB
          infoJson.uuid = this.uuid;
          fs.writeJson(
            path.join(this.courseInstancePath, 'infoCourseInstance.json'),
            infoJson,
            { spaces: 4 },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class CourseInstanceDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Delete course instance ${this.course_instance.short_name}`;
  }

  write(callback) {
    debug('CourseInstanceDeleteEditor: write()');
    const deletePath = path.join(this.course.path, 'courseInstances');
    fs.remove(path.join(deletePath, this.course_instance.short_name), (err) => {
      if (ERR(err, callback)) return;
      this.removeEmptyPrecedingSubfolders(deletePath, this.course_instance.short_name, (err) => {
        if (ERR(err, callback)) return;
        this.pathsToAdd = [path.join(deletePath, this.course_instance.short_name)];
        this.commitMessage = `delete course instance ${this.course_instance.short_name}`;
        callback(null);
      });
    });
  }
}

class CourseInstanceRenameEditor extends Editor {
  constructor(params) {
    super(params);
    this.ciid_new = params.ciid_new;
    this.description = `Rename course instance ${this.course_instance.short_name}`;
  }

  canEdit(callback) {
    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('CourseInstanceRenameEditor: write()');
    const oldPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name);
    const newPath = path.join(this.course.path, 'courseInstances', this.ciid_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    fs.move(oldPath, newPath, { overwrite: false }, (err) => {
      if (ERR(err, callback)) return;
      this.removeEmptyPrecedingSubfolders(
        path.join(this.course.path, 'courseInstances'),
        this.course_instance.short_name,
        (err) => {
          if (ERR(err, callback)) return;

          this.pathsToAdd = [oldPath, newPath];
          this.commitMessage = `rename course instance ${this.course_instance.short_name} to ${this.ciid_new}`;
          callback(null);
        }
      );
    });
  }
}

class CourseInstanceAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Add course instance`;
  }

  write(callback) {
    debug('CourseInstanceAddEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');
    async.waterfall(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_course_instances_with_course,
            { course_id: this.course.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'long_name');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(
            courseInstancesPath,
            'infoCourseInstance.json',
            (err, filenames) => {
              if (ERR(err, callback)) return;
              this.oldNamesShort = filenames;
              callback(null);
            }
          );
        },
        (callback) => {
          debug(`Generate short_name and long_name`);
          let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
          this.short_name = names.shortName;
          this.long_name = names.longName;
          this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
          this.pathsToAdd = [this.courseInstancePath];
          this.commitMessage = `add course instance ${this.short_name}`;
          callback(null);
        },
        (callback) => {
          debug(`Write infoCourseInstance.json`);

          this.uuid = uuidv4(); // <-- store uuid so we can find the new course instance in the DB

          let infoJson = {
            uuid: this.uuid,
            longName: this.long_name,
            allowAccess: [],
          };

          // We use outputJson to create the directory this.courseInstancePath if it
          // does not exist (which it shouldn't). We use the file system flag 'wx' to
          // throw an error if this.courseInstancePath already exists.
          fs.outputJson(
            path.join(this.courseInstancePath, 'infoCourseInstance.json'),
            infoJson,
            { spaces: 4, flag: 'wx' },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class QuestionAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Add question`;
  }

  write(callback) {
    debug('QuestionAddEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');
    async.waterfall(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_questions_with_course,
            { course_id: this.course.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'title');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(questionsPath, 'info.json', (err, filenames) => {
            if (ERR(err, callback)) return;
            this.oldNamesShort = filenames;
            callback(null);
          });
        },
        (callback) => {
          debug(`Generate qid and title`);
          let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
          this.qid = names.shortName;
          this.questionTitle = names.longName;
          this.questionPath = path.join(questionsPath, this.qid);
          this.pathsToAdd = [this.questionPath];
          this.commitMessage = `add question ${this.qid}`;
          callback(null);
        },
        (callback) => {
          const fromPath = path.join(
            __dirname,
            '..',
            'exampleCourse',
            'questions',
            'demo',
            'calculation'
          );
          const toPath = this.questionPath;
          debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
          fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`Read info.json`);
          fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
            if (ERR(err, callback)) return;
            callback(null, infoJson);
          });
        },
        (infoJson, callback) => {
          debug(`Write info.json with new title and uuid`);
          infoJson.title = this.questionTitle;
          this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
          infoJson.uuid = this.uuid;
          fs.writeJson(
            path.join(this.questionPath, 'info.json'),
            infoJson,
            { spaces: 4 },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class QuestionDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Delete question ${this.question.qid}`;
  }

  write(callback) {
    debug('QuestionDeleteEditor: write()');
    fs.remove(path.join(this.course.path, 'questions', this.question.qid), (err) => {
      if (ERR(err, callback)) return;
      this.removeEmptyPrecedingSubfolders(
        path.join(this.course.path, 'questions'),
        this.question.qid,
        (err) => {
          if (ERR(err, callback)) return;
          this.pathsToAdd = [path.join(this.course.path, 'questions', this.question.qid)];
          this.commitMessage = `delete question ${this.question.qid}`;
          callback(null);
        }
      );
    });
  }
}

class QuestionRenameEditor extends Editor {
  constructor(params) {
    super(params);
    this.qid_new = params.qid_new;
    this.description = `Rename question ${this.question.qid}`;
  }

  canEdit(callback) {
    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('QuestionRenameEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');
    async.waterfall(
      [
        (callback) => {
          const oldPath = path.join(questionsPath, this.question.qid);
          const newPath = path.join(questionsPath, this.qid_new);
          debug(`Move files\n from ${oldPath}\n to ${newPath}`);
          fs.move(oldPath, newPath, { overwrite: false }, (err) => {
            if (ERR(err, callback)) return;
            this.removeEmptyPrecedingSubfolders(questionsPath, this.question.qid, (err) => {
              if (ERR(err, callback)) return;
              this.pathsToAdd = [oldPath, newPath];
              this.commitMessage = `rename question ${this.question.qid} to ${this.qid_new}`;
              callback(null);
            });
          });
        },
        (callback) => {
          debug(`Find all assessments (in all course instances) that contain ${this.question.qid}`);
          sqldb.query(
            sql.select_assessments_with_question,
            { question_id: this.question.id },
            function (err, result) {
              if (ERR(err, callback)) return;
              callback(null, result.rows);
            }
          );
        },
        (assessments, callback) => {
          debug(
            `For each assessment, read/write infoAssessment.json to replace ${this.question.qid} with ${this.qid_new}`
          );
          async.eachSeries(
            assessments,
            (assessment, callback) => {
              let infoPath = path.join(
                this.course.path,
                'courseInstances',
                assessment.course_instance_directory,
                'assessments',
                assessment.assessment_directory,
                'infoAssessment.json'
              );
              this.pathsToAdd.push(infoPath);
              async.waterfall(
                [
                  (callback) => {
                    debug(`Read ${infoPath}`);
                    fs.readJson(infoPath, (err, infoJson) => {
                      if (ERR(err, callback)) return;
                      callback(null, infoJson);
                    });
                  },
                  (infoJson, callback) => {
                    debug(`Find/replace QID in ${infoPath}`);
                    let found = false;
                    infoJson.zones.forEach((zone) => {
                      zone.questions.forEach((question) => {
                        if (question.alternatives) {
                          question.alternatives.forEach((alternative) => {
                            if (alternative.id === this.question.qid) {
                              alternative.id = this.qid_new;
                              found = true;
                            }
                          });
                        } else if (question.id === this.question.qid) {
                          question.id = this.qid_new;
                          found = true;
                        }
                      });
                    });
                    if (!found) {
                      logger.info(
                        `Should have but did not find ${this.question.qid} in ${infoPath}`
                      );
                    }
                    debug(`Write ${infoPath}`);
                    fs.writeJson(infoPath, infoJson, { spaces: 4 }, (err) => {
                      if (ERR(err, callback)) return;
                      callback(null);
                    });
                  },
                ],
                (err) => {
                  if (ERR(err, callback)) return;
                  callback(null);
                }
              );
            },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class QuestionCopyEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Copy question ${this.question.qid}`;
  }

  write(callback) {
    debug('QuestionCopyEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');
    async.waterfall(
      [
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_questions_with_course,
            { course_id: this.course.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'title');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(questionsPath, 'info.json', (err, filenames) => {
            if (ERR(err, callback)) return;
            this.oldNamesShort = filenames;
            callback(null);
          });
        },
        (callback) => {
          debug(`Generate qid and title`);
          let names = this.getNamesForCopy(
            this.question.qid,
            this.oldNamesShort,
            this.question.title,
            this.oldNamesLong
          );
          this.qid = names.shortName;
          this.questionTitle = names.longName;
          this.questionPath = path.join(questionsPath, this.qid);
          this.pathsToAdd = [this.questionPath];
          this.commitMessage = `copy question ${this.question.qid} to ${this.qid}`;
          callback(null);
        },
        (callback) => {
          const fromPath = path.join(questionsPath, this.question.qid);
          const toPath = this.questionPath;
          debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
          fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`Read info.json`);
          fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
            if (ERR(err, callback)) return;
            callback(null, infoJson);
          });
        },
        (infoJson, callback) => {
          debug(`Write info.json with new title and uuid`);
          infoJson.title = this.questionTitle;
          this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
          infoJson.uuid = this.uuid;
          fs.writeJson(
            path.join(this.questionPath, 'info.json'),
            infoJson,
            { spaces: 4 },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class QuestionTransferEditor extends Editor {
  constructor(params) {
    super(params);
    this.from_qid = params.from_qid;
    this.from_course_short_name = params.from_course_short_name;
    this.from_path = params.from_path;
    this.description = `Copy question ${this.from_qid} from course ${this.from_course_short_name}`;
  }

  write(callback) {
    debug('QuestionTransferEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');
    async.waterfall(
      [
        (callback) => {
          debug(`Get title of question that is being copied`);
          fs.readJson(path.join(this.from_path, 'info.json'), (err, infoJson) => {
            if (ERR(err, callback)) return;
            this.from_title = infoJson.title || 'Empty Title';
            callback(null);
          });
        },
        (callback) => {
          debug('Get all existing long names');
          sqldb.query(
            sql.select_questions_with_course,
            { course_id: this.course.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              this.oldNamesLong = _.map(result.rows, 'title');
              callback(null);
            }
          );
        },
        (callback) => {
          debug('Get all existing short names');
          this.getExistingShortNames(questionsPath, 'info.json', (err, filenames) => {
            if (ERR(err, callback)) return;
            this.oldNamesShort = filenames;
            callback(null);
          });
        },
        (callback) => {
          debug(`Generate qid and title`);
          if (
            this.oldNamesShort.includes(this.from_qid) ||
            this.oldNamesLong.includes(this.from_title)
          ) {
            let names = this.getNamesForCopy(
              this.from_qid,
              this.oldNamesShort,
              this.from_title,
              this.oldNamesLong
            );
            this.qid = names.shortName;
            this.questionTitle = names.longName;
          } else {
            this.qid = this.from_qid;
            this.questionTitle = this.from_title;
          }
          this.questionPath = path.join(questionsPath, this.qid);
          this.pathsToAdd = [this.questionPath];
          this.commitMessage = `copy question ${this.from_qid} (from course ${this.from_course_short_name}) to ${this.qid}`;
          callback(null);
        },
        (callback) => {
          const fromPath = this.from_path;
          const toPath = this.questionPath;
          debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
          fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`Read info.json`);
          fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
            if (ERR(err, callback)) return;
            callback(null, infoJson);
          });
        },
        (infoJson, callback) => {
          debug(`Write info.json with new title and uuid`);
          infoJson.title = this.questionTitle;
          this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
          infoJson.uuid = this.uuid;
          fs.writeJson(
            path.join(this.questionPath, 'info.json'),
            infoJson,
            { spaces: 4 },
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  }
}

class FileDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.container = params.container;
    this.deletePath = params.deletePath;
    if (this.course.path === this.container.rootPath) {
      this.prefix = '';
    } else {
      this.prefix = `${path.basename(this.container.rootPath)}: `;
    }
    this.description = `${this.prefix}delete ${path.relative(
      this.container.rootPath,
      this.deletePath
    )}`;
  }

  canEdit(callback) {
    if (!contains(this.container.rootPath, this.deletePath)) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The path of the file to delete</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
        `<p>must be inside the root directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
      return callback(err);
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.deletePath)
    );
    if (found) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The path of the file to delete</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
        `<p>must <em>not</em> be inside the directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('FileDeleteEditor: write()');
    // This will silently do nothing if deletePath no longer exists.
    fs.remove(this.deletePath, (err) => {
      if (ERR(err, callback)) return;
      this.pathsToAdd = [this.deletePath];
      this.commitMessage = this.description;
      callback(null);
    });
  }
}

class FileRenameEditor extends Editor {
  constructor(params) {
    super(params);
    this.container = params.container;
    this.oldPath = params.oldPath;
    this.newPath = params.newPath;
    if (this.course.path === this.container.rootPath) {
      this.prefix = '';
    } else {
      this.prefix = `${path.basename(this.container.rootPath)}: `;
    }
    this.description = `${this.prefix}rename ${path.relative(
      this.container.rootPath,
      this.oldPath
    )} to ${path.relative(this.container.rootPath, this.newPath)}`;
  }

  canEdit(callback) {
    debug('FileRenameEditor: canEdit()');
    if (!contains(this.container.rootPath, this.oldPath)) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file's old path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
        `<p>must be inside the root directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
      return callback(err);
    }

    if (!contains(this.container.rootPath, this.newPath)) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file's new path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
        `<p>must be inside the root directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
      return callback(err);
    }

    let found;

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.oldPath)
    );
    if (found) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file's old path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
        `<p>must <em>not</em> be inside the directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
      return callback(err);
    }

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.newPath)
    );
    if (found) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file's new path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
        `<p>must <em>not</em> be inside the directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('FileRenameEditor: write()');
    async.series(
      [
        (callback) => {
          debug(`ensure path exists`);
          fs.ensureDir(path.dirname(this.newPath), (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`rename file`);
          fs.rename(this.oldPath, this.newPath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [this.oldPath, this.newPath];
            this.commitMessage = this.description;
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
}

class FileUploadEditor extends Editor {
  constructor(params) {
    super(params);
    this.container = params.container;
    this.filePath = params.filePath;
    this.fileContents = params.fileContents;
    if (this.course.path === this.container.rootPath) {
      this.prefix = '';
    } else {
      this.prefix = `${path.basename(this.container.rootPath)}: `;
    }
    this.description = `${this.prefix}upload ${path.relative(
      this.container.rootPath,
      this.filePath
    )}`;
  }

  getHashFromBuffer(buffer) {
    return sha256(buffer.toString('utf8')).toString();
  }

  shouldEdit(callback) {
    debug('look for old contents');
    fs.readFile(this.filePath, (err, contents) => {
      if (err) {
        if (err.code === 'ENOENT') {
          debug('no old contents, so continue with upload');
          callback(null, true);
        } else {
          ERR(err, callback);
        }
      } else {
        debug('get hash of old contents and of new contents');
        const oldHash = this.getHashFromBuffer(contents);
        const newHash = this.getHashFromBuffer(this.fileContents);
        debug('oldHash: ' + oldHash);
        debug('newHash: ' + newHash);
        if (oldHash === newHash) {
          debug('new contents are the same as old contents, so abort upload');
          callback(null, false);
        } else {
          debug('new contents are different from old contents, so continue with upload');
          callback(null, true);
        }
      }
    });
  }

  canEdit(callback) {
    if (!contains(this.container.rootPath, this.filePath)) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
        `<p>must be inside the root directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
      return callback(err);
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.filePath)
    );
    if (found) {
      let err = new Error('Invalid file path');
      err.info =
        `<p>The file path</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
        `<p>must <em>not</em> be inside the directory</p>` +
        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  write(callback) {
    debug('FileUploadEditor: write()');
    async.series(
      [
        (callback) => {
          debug(`ensure path exists`);
          fs.ensureDir(path.dirname(this.filePath), (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          debug(`write file`);
          fs.writeFile(this.filePath, this.fileContents, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [this.filePath];
            this.commitMessage = this.description;
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
}

class CourseInfoEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Create infoCourse.json`;
  }

  write(callback) {
    debug('CourseInfoEditor: write()');
    const infoPath = path.join(this.course.path, 'infoCourse.json');

    let infoJson = {
      uuid: uuidv4(),
      name: path.basename(this.course.path),
      title: path.basename(this.course.path),
      options: {
        useNewQuestionRenderer: true,
      },
      tags: [],
      topics: [],
    };

    // This will error if:
    // - this.course.path does not exist (use of writeJson)
    // - infoPath does exist (use of 'wx')
    fs.writeJson(infoPath, infoJson, { spaces: 4, flag: 'wx' }, (err) => {
      if (ERR(err, callback)) return;

      this.pathsToAdd = [infoPath];
      this.commitMessage = `create infoCourse.json`;

      callback(null);
    });
  }
}

module.exports = {
  AssessmentCopyEditor,
  AssessmentDeleteEditor,
  AssessmentRenameEditor,
  AssessmentAddEditor,
  CourseInstanceCopyEditor,
  CourseInstanceDeleteEditor,
  CourseInstanceRenameEditor,
  CourseInstanceAddEditor,
  QuestionCopyEditor,
  QuestionDeleteEditor,
  QuestionRenameEditor,
  QuestionAddEditor,
  QuestionTransferEditor,
  FileDeleteEditor,
  FileRenameEditor,
  FileUploadEditor,
  CourseInfoEditor,
};
