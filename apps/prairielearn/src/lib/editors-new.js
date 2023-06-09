const ERR = require('async-stacktrace');
const _ = require('lodash');
const { createServerJob } = require('./server-jobs');
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

/**
 * @param {any} course
 * @param {string} startGitHash
 * @param {string} endGitHash
 * @param {import('./server-jobs').ServerJob} job
 */
async function syncCourseFromDisk(course, startGitHash, endGitHash, job) {
  const result = await syncFromDisk.syncDiskToSqlWithLock(course.path, course.id, job);

  if (config.chunksGenerator) {
    const chunkChanges = await chunks.updateChunksForCourse({
      coursePath: course.path,
      courseId: course.id,
      courseData: result.courseData,
      oldHash: startGitHash,
      newHash: endGitHash,
    });
    chunks.logChunkChangesToJob(chunkChanges, job);
  }

  await courseUtil.updateCourseCommitHashAsync();

  if (result.hadJsonErrors) {
    throw new Error('One or more JSON files contained errors and were unable to be synced');
  }

  await util.promisify(requireFrontend.undefQuestionServers)(course.path, job);
}

async function cleanAndResetRepository(course, env, job) {
  await job.exec('git', ['clean', '-fdx'], { cwd: this.course.path, env });
  await job.exec('git', ['reset', '--hard', `origin/${this.course.branch}`], {
    cwd: course.path,
    env,
  });
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

            const lockName = `coursedir:${options.courseDir}`;
            await namedLocks.doWithLock(lockName, { timeout: 5000 }, async () => {
              const startGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(this.course);

              if (config.fileEditorUseGit) {
                await cleanAndResetRepository(this.course, gitEnv, job);
              }

              try {
                job.info('Write changes to disk');
                await util.promisify(this.write).bind(this)();
              } catch (err) {
                if (config.fileEditorUseGit) {
                  await cleanAndResetRepository(this.course, gitEnv, job);
                }

                throw err;
              }

              if (!config.fileEditorUseGit) {
                const endGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(this.course);
                await syncCourseFromDisk(this.course, startGitHash, endGitHash, job);
                return;
              }

              try {
                await job.exec('git', ['add', ...this.pathsToAdd], {
                  cwd: this.course.path,
                  env: gitEnv,
                });
                await job.exec(
                  'git',
                  [
                    '-c',
                    `user.name="${this.user.name}"`,
                    '-c',
                    `user.email="${this.user.uid}"`,
                    'commit',
                    '-m',
                    this.commitMessage,
                  ],
                  {
                    cwd: this.course.path,
                    env: gitEnv,
                  }
                );
              } catch (err) {
                await cleanAndResetRepository(this.course, gitEnv, job);
                throw err;
              }

              try {
                await job.exec('git', ['push'], {
                  cwd: this.course.path,
                  env: gitEnv,
                });
              } catch (err) {
                // In the original implementation, we would *only* reset the
                // repo state. AFAICT, it should be safe to do both a clean
                // and reset if the push fails?
                await cleanAndResetRepository(this.course, gitEnv, job);
                throw err;
              }

              // Note that we perform a second `git clean` after pushing, as the
              // write operations may have left some empty directories behind.
              // This would most likely occur during a rename.
              await cleanAndResetRepository(this.course, gitEnv, job);

              const endGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(this.course);
              await syncCourseFromDisk(this.course, startGitHash, endGitHash, job);
            });
          });
        },
      ],
      (err) => {
        callback(err, jobSequenceId);
      }
    );
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
