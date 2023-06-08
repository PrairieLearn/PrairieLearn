const ERR = require('async-stacktrace');
const _ = require('lodash');
const { logger } = require('@prairielearn/logger');
const { createServerJob } = require('./server-jobs');
const serverJobs = require('./server-jobs-legacy');
const namedLocks = require('@prairielearn/named-locks');
const syncFromDisk = require('../sync/syncFromDisk');
const courseUtil = require('../lib/courseUtil');
const requireFrontend = require('../lib/require-frontend');
const { config } = require('../lib/config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');
const fs = require('fs-extra');
const async = require('async');
const util = require('util');
const chunks = require('./chunks');
const { escapeRegExp } = require('@prairielearn/sanitize');

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

    let jobSequenceId = null;
    async.waterfall(
      [
        async () => {
          const serverJob = await createServerJob({
            courseId: this.course.id,
            userId: this.user.user_id,
            authnUserId: this.authz_data.authn_user.user_id,
            type: 'sync',
            description: this.description,
          });
          jobSequenceId = serverJob.jobSequenceId;

          // We deliberately use `execute` instead of `executeInBackground` here
          // because we want edits to complete during the request during which
          // they are made.
          await serverJob.execute(async (job) => {
            const gitEnv = process.env;
            if (config.gitSshCommand != null) {
              gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
            }

            const lockName = 'coursedir:' + options.courseDir;
            await namedLocks.doWithLock(lockName, { timeout: 5000 }, async () => {
              const startGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(this.course);

              if (config.fileEditorUseGit) {
                await job.exec('git', ['clean', '-fdx'], { cwd: this.course.path, env: gitEnv });
                await job.exec('git', ['reset', '--hard', `origin/${this.course.branch}`], {
                  cwd: this.course.path,
                  env: gitEnv,
                });
              }

              try {
                await util.promisify(this.write).bind(this)();
              } catch (err) {
                // TODO?
                console.error(err);
              }
            });
          });
        },
      ],
      (err) => {
        callback(err, jobSequenceId);
      }
    );

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
          arguments: ['reset', '--hard', `origin/${this.course.branch}`],
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
          on_success: _getEndCommitHash,
          on_error: _cleanupAfterCommit,
          no_job_sequence_update: true,
        };
        serverJobs.spawnJob(jobOptions);
      };

      const _getEndCommitHash = () => {
        debug(`${job_sequence_id}: _updateCommitHash`);
        courseUtil.getCommitHash(this.course.path, (err, hash) => {
          ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
          endGitHash = hash;

          // Note that we perform a second `git clean` after writing to disk, as
          // the write operations may have left some empty directories behind.
          // This would most likely occur during a rename.
          _clean(_syncFromDisk, _cleanup);
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
                return;
              }

              const updateCourseCommitHash = () => {
                courseUtil.updateCourseCommitHash(this.course, (err) => {
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
                util.callbackify(chunks.updateChunksForCourse)(
                  {
                    coursePath: this.course.path,
                    courseId: this.course.id,
                    courseData: result.courseData,
                    oldHash: startGitHash,
                    newHash: endGitHash,
                  },
                  (err, chunkChanges) => {
                    if (err) {
                      job.fail(err);
                      return;
                    }
                    chunks.logChunkChangesToJob(chunkChanges, job);
                    updateCourseCommitHash();
                  }
                );
              } else {
                updateCourseCommitHash();
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

    // Start deleting subfolders in reverse order
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

            // Delete the subfolder if it's empty, otherwise stop here
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
          // If the directory doesn't exist, then we have nothing to load
          return callback(null);
        }
        if (ERR(err, callback)) return;

        // For each subdirectory, try to find an Info file
        async.each(
          directories,
          (dir, callback) => {
            // Relative path to the current folder
            const subdirPath = path.join(relativeDir, dir);
            // Absolute path to the info file
            const infoPath = path.join(rootDirectory, subdirPath, infoFile);
            fs.access(infoPath, (err) => {
              if (!err) {
                // Info file exists, we can use this directory
                files.push(subdirPath);
                callback(null);
              } else {
                // No info file, let's try recursing
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

module.exports.Editor = Editor;
