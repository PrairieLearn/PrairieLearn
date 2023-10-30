// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const { logger } = require('@prairielearn/logger');
const { contains } = require('@prairielearn/path-utils');
const { createServerJob } = require('./server-jobs');
const namedLocks = require('@prairielearn/named-locks');
const syncFromDisk = require('../sync/syncFromDisk');
const courseUtil = require('../lib/courseUtil');
const { config } = require('../lib/config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');
const fs = require('fs-extra');
const async = require('async');
const { v4: uuidv4 } = require('uuid');
const sha256 = require('crypto-js/sha256');
const chunks = require('./chunks');
const { EXAMPLE_COURSE_PATH } = require('./paths');
const { escapeRegExp } = require('@prairielearn/sanitize');
const sqldb = require('@prairielearn/postgres');
const { getLockNameForCoursePath } = require('./course');

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @param {any} course
 * @param {string} startGitHash
 * @param {import('./server-jobs').ServerJob} job
 */
async function syncCourseFromDisk(course, startGitHash, job) {
  const endGitHash = await courseUtil.getCommitHashAsync(course.path);

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

  await courseUtil.updateCourseCommitHashAsync(course);

  if (result.hadJsonErrors) {
    throw new Error('One or more JSON files contained errors and were unable to be synced');
  }
}

async function cleanAndResetRepository(course, env, job) {
  await job.exec('git', ['clean', '-fdx'], { cwd: course.path, env });
  await job.exec('git', ['reset', '--hard', `origin/${course.branch}`], {
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
    this.description = null;
    this.pathsToAdd = null;
    this.commitMessage = null;
  }

  async write() {
    throw new Error('write must be defined in a subclass');
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
    let jobSequenceId = null;
    async.series(
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

          // We deliberately use `executeUnsafe` here because we want to wait
          // for the edit to complete during the request during which it was
          // made. We use `executeUnsafe` instead of `execute` because we want
          // errors to be thrown and handled by the caller.
          await serverJob.executeUnsafe(async (job) => {
            const gitEnv = process.env;
            if (config.gitSshCommand != null) {
              gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
            }

            const lockName = getLockNameForCoursePath(this.course.path);
            await namedLocks.doWithLock(lockName, { timeout: 5000 }, async () => {
              const startGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(this.course);

              if (config.fileEditorUseGit) {
                await cleanAndResetRepository(this.course, gitEnv, job);
              }

              try {
                job.info('Write changes to disk');
                await this.write();
              } catch (err) {
                if (config.fileEditorUseGit) {
                  await cleanAndResetRepository(this.course, gitEnv, job);
                }

                throw err;
              }

              if (!config.fileEditorUseGit) {
                await syncCourseFromDisk(this.course, startGitHash, job);
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
                  },
                );
              } catch (err) {
                await cleanAndResetRepository(this.course, gitEnv, job);
                throw err;
              }

              try {
                job.data.pushAttempted = true;

                await job.exec('git', ['push'], {
                  cwd: this.course.path,
                  env: gitEnv,
                });

                // We'll look for this flag on the `editError` page to know if
                // we need to display instructions to recover from a failed push.
                job.data.pushSucceeded = true;
              } finally {
                // Regardless of whether we error, we'll do a clean and reset:
                //
                // If pushing succeeded, the clean will remove any empty directories
                // that might have been left behind by operations like renames.
                //
                // If pushing errored, the reset will get us back to a known good state.
                await cleanAndResetRepository(this.course, gitEnv, job);
              }

              job.data.syncAttempted = true;

              await syncCourseFromDisk(this.course, startGitHash, job);

              // As with `job.data.pushSucceeded` above, we'll check this flag
              // on the `editError` page to know if syncing failed so we can
              // display appropriate instructions.
              job.data.syncSucceeded = true;
            });
          });
        },
      ],
      (err) => {
        callback(err, jobSequenceId);
      },
    );
  }

  /**
   * Remove empty preceding subfolders for a question, assessment, etc. based on its ID.
   * This should be run after renames or deletes to prevent syncing issues.
   * @param {string} rootDirectory Root directory that the items are being stored in.
   * @param {string} id Item to delete root subfolders for, relative from the root directory.
   */
  async removeEmptyPrecedingSubfolders(rootDirectory, id) {
    const idSplit = id.split(path.sep);

    // Start deleting subfolders in reverse order
    const reverseFolders = idSplit.slice(0, -1).reverse();
    debug('Checking folders', reverseFolders);

    let seenNonemptyFolder = false;
    for (const [index] of reverseFolders.entries()) {
      if (!seenNonemptyFolder) {
        const delPath = path.join(rootDirectory, ...idSplit.slice(0, idSplit.length - 1 - index));
        debug('Checking', delPath);

        const files = await fs.readdir(delPath);

        // Delete the subfolder if it's empty, otherwise stop here
        if (files.length > 0) {
          debug(delPath, 'is nonempty, stopping here.');
          debug('Folder contains', files);
          seenNonemptyFolder = true;
        } else {
          debug('No files, deleting', delPath);
          await fs.remove(delPath);
        }
      }
    }
  }

  /**
   * Get all existing shortnames, recursing on nonempty directories that do not contain
   * an ".info" file.
   * @param rootDirectory Directory to start searching from.
   * @param infoFile Name of the info file, will stop recursing once a directory contains this.
   */
  async getExistingShortNames(rootDirectory, infoFile) {
    let files = [];
    const walk = async (relativeDir) => {
      const directories = await fs.readdir(path.join(rootDirectory, relativeDir)).catch((err) => {
        // If the directory doesn't exist, then we have nothing to load
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
          return /** @type {string[]} */ ([]);
        }
        throw err;
      });

      // For each subdirectory, try to find an Info file
      await async.each(directories, async (dir) => {
        // Relative path to the current folder
        const subdirPath = path.join(relativeDir, dir);
        // Absolute path to the info file
        const infoPath = path.join(rootDirectory, subdirPath, infoFile);
        const hasInfoFile = await fs.pathExists(infoPath);
        if (hasInfoFile) {
          // Info file exists, we can use this directory
          files.push(subdirPath);
        } else {
          // No info file, let's try recursing
          await walk(subdirPath);
        }
      });
    };

    await walk('');
    debug('getExistingShortNames() returning', files);
    return files;
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

  async write() {
    debug('AssessmentCopyEditor: write()');
    const assessmentsPath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_assessments_with_course_instance, {
      course_instance_id: this.course_instance.id,
    });
    const oldNamesLong = _.map(result.rows, 'title');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(assessmentsPath, 'infoAssessment.json');

    debug(`Generate TID and Title`);
    let names = this.getNamesForCopy(
      this.assessment.tid,
      oldNamesShort,
      this.assessment.title,
      oldNamesLong,
    );
    const tid = names.shortName;
    const assessmentTitle = names.longName;
    const assessmentPath = path.join(assessmentsPath, tid);
    this.pathsToAdd = [assessmentPath];
    this.commitMessage = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid} to ${tid}`;

    const fromPath = path.join(assessmentsPath, this.assessment.tid);
    const toPath = assessmentPath;
    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug(`Read infoAssessment.json`);
    const infoJson = await fs.readJson(path.join(assessmentPath, 'infoAssessment.json'));

    debug(`Write infoAssessment.json with new title and uuid`);
    infoJson.title = assessmentTitle;
    this.uuid = uuidv4(); // <-- store uuid so we can find the new assessment in the DB
    infoJson.uuid = this.uuid;
    await fs.writeJson(path.join(assessmentPath, 'infoAssessment.json'), infoJson, {
      spaces: 4,
    });
  }
}

class AssessmentDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
  }

  async write() {
    debug('AssessmentDeleteEditor: write()');
    const deletePath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );
    await fs.remove(path.join(deletePath, this.assessment.tid));
    await this.removeEmptyPrecedingSubfolders(deletePath, this.assessment.tid);
    this.pathsToAdd = [path.join(deletePath, this.assessment.tid)];
    this.commitMessage = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
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

  async write() {
    debug('AssessmentRenameEditor: write()');
    const basePath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );
    const oldPath = path.join(basePath, this.assessment.tid);
    const newPath = path.join(basePath, this.tid_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(basePath, this.course_instance.short_name);
    this.pathsToAdd = [oldPath, newPath];
    this.commitMessage = `${this.course_instance.short_name}: rename assessment ${this.assessment.tid} to ${this.tid_new}`;
  }
}

class AssessmentAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `${this.course_instance.short_name}: add assessment`;
  }

  async write() {
    debug('AssessmentAddEditor: write()');
    const assessmentsPath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_assessments_with_course_instance, {
      course_instance_id: this.course_instance.id,
    });
    const oldNamesLong = _.map(result.rows, 'title');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(assessmentsPath, 'infoAssessment.json');

    debug(`Generate TID and Title`);
    let names = this.getNamesForAdd(oldNamesShort, oldNamesLong);
    const tid = names.shortName;
    const assessmentTitle = names.longName;
    const assessmentPath = path.join(assessmentsPath, tid);
    this.pathsToAdd = [assessmentPath];
    this.commitMessage = `${this.course_instance.short_name}: add assessment ${tid}`;

    debug(`Write infoAssessment.json`);

    this.uuid = uuidv4(); // <-- store uuid so we can find the new assessment in the DB

    let infoJson = {
      uuid: this.uuid,
      type: 'Homework',
      title: assessmentTitle,
      set: 'Homework',
      number: '1',
      allowAccess: [],
      zones: [],
    };

    // We use outputJson to create the directory this.assessmentsPath if it
    // does not exist (which it shouldn't). We use the file system flag 'wx'
    // to throw an error if `assessmentPath` already exists.
    await fs.outputJson(path.join(assessmentPath, 'infoAssessment.json'), infoJson, {
      spaces: 4,
      flag: 'wx',
    });
  }
}

class CourseInstanceCopyEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Copy course instance ${this.course_instance.short_name}`;
  }

  async write() {
    debug('CourseInstanceCopyEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_course_instances_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = _.map(result.rows, 'long_name');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(
      courseInstancesPath,
      'infoCourseInstance.json',
    );

    debug(`Generate short_name and long_name`);
    let names = this.getNamesForCopy(
      this.course_instance.short_name,
      oldNamesShort,
      this.course_instance.long_name,
      oldNamesLong,
    );
    this.short_name = names.shortName;
    this.long_name = names.longName;
    this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
    this.pathsToAdd = [this.courseInstancePath];
    this.commitMessage = `copy course instance ${this.course_instance.short_name} to ${this.short_name}`;

    const fromPath = path.join(courseInstancesPath, this.course_instance.short_name);
    const toPath = this.courseInstancePath;
    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug(`Read infoCourseInstance.json`);
    const infoJson = await fs.readJson(
      path.join(this.courseInstancePath, 'infoCourseInstance.json'),
    );

    debug(`Write infoCourseInstance.json with new longName and uuid`);
    infoJson.longName = this.long_name;
    this.uuid = uuidv4(); // <-- store uuid so we can find the new course instance in the DB
    infoJson.uuid = this.uuid;
    await fs.writeJson(path.join(this.courseInstancePath, 'infoCourseInstance.json'), infoJson, {
      spaces: 4,
    });
  }
}

class CourseInstanceDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Delete course instance ${this.course_instance.short_name}`;
  }

  async write() {
    debug('CourseInstanceDeleteEditor: write()');
    const deletePath = path.join(this.course.path, 'courseInstances');
    await fs.remove(path.join(deletePath, this.course_instance.short_name));
    await this.removeEmptyPrecedingSubfolders(deletePath, this.course_instance.short_name);
    this.pathsToAdd = [path.join(deletePath, this.course_instance.short_name)];
    this.commitMessage = `delete course instance ${this.course_instance.short_name}`;
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

  async write() {
    debug('CourseInstanceRenameEditor: write()');
    const oldPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name);
    const newPath = path.join(this.course.path, 'courseInstances', this.ciid_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(
      path.join(this.course.path, 'courseInstances'),
      this.course_instance.short_name,
    );

    this.pathsToAdd = [oldPath, newPath];
    this.commitMessage = `rename course instance ${this.course_instance.short_name} to ${this.ciid_new}`;
  }
}

class CourseInstanceAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Add course instance`;
  }

  async write() {
    debug('CourseInstanceAddEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_course_instances_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = _.map(result.rows, 'long_name');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(
      courseInstancesPath,
      'infoCourseInstance.json',
    );

    debug(`Generate short_name and long_name`);
    let names = this.getNamesForAdd(oldNamesShort, oldNamesLong);
    this.short_name = names.shortName;
    this.long_name = names.longName;
    this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
    this.pathsToAdd = [this.courseInstancePath];
    this.commitMessage = `add course instance ${this.short_name}`;

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
    await fs.outputJson(path.join(this.courseInstancePath, 'infoCourseInstance.json'), infoJson, {
      spaces: 4,
      flag: 'wx',
    });
  }
}

class QuestionAddEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Add question`;
  }

  async write() {
    debug('QuestionAddEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_questions_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = _.map(result.rows, 'title');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

    debug(`Generate qid and title`);
    let names = this.getNamesForAdd(oldNamesShort, oldNamesLong);
    this.qid = names.shortName;
    this.questionTitle = names.longName;
    this.questionPath = path.join(questionsPath, this.qid);
    this.pathsToAdd = [this.questionPath];
    this.commitMessage = `add question ${this.qid}`;

    const fromPath = path.join(EXAMPLE_COURSE_PATH, 'questions', 'demo', 'calculation');
    const toPath = this.questionPath;
    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug(`Read info.json`);
    const infoJson = await fs.readJson(path.join(this.questionPath, 'info.json'));

    debug(`Write info.json with new title and uuid`);
    infoJson.title = this.questionTitle;
    this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
    infoJson.uuid = this.uuid;
    await fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, { spaces: 4 });
  }
}

class QuestionDeleteEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Delete question ${this.question.qid}`;
  }

  async write() {
    debug('QuestionDeleteEditor: write()');
    await fs.remove(path.join(this.course.path, 'questions', this.question.qid));
    await this.removeEmptyPrecedingSubfolders(
      path.join(this.course.path, 'questions'),
      this.question.qid,
    );
    this.pathsToAdd = [path.join(this.course.path, 'questions', this.question.qid)];
    this.commitMessage = `delete question ${this.question.qid}`;
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

  async write() {
    debug('QuestionRenameEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');
    const oldPath = path.join(questionsPath, this.question.qid);
    const newPath = path.join(questionsPath, this.qid_new);

    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(questionsPath, this.question.qid);
    this.pathsToAdd = [oldPath, newPath];
    this.commitMessage = `rename question ${this.question.qid} to ${this.qid_new}`;

    debug(`Find all assessments (in all course instances) that contain ${this.question.qid}`);
    const result = await sqldb.queryAsync(sql.select_assessments_with_question, {
      question_id: this.question.id,
    });
    const assessments = result.rows;

    debug(
      `For each assessment, read/write infoAssessment.json to replace ${this.question.qid} with ${this.qid_new}`,
    );
    for (const assessment of assessments) {
      let infoPath = path.join(
        this.course.path,
        'courseInstances',
        assessment.course_instance_directory,
        'assessments',
        assessment.assessment_directory,
        'infoAssessment.json',
      );
      this.pathsToAdd.push(infoPath);

      debug(`Read ${infoPath}`);
      const infoJson = await fs.readJson(infoPath);

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
        logger.info(`Should have but did not find ${this.question.qid} in ${infoPath}`);
      }
      debug(`Write ${infoPath}`);
      await fs.writeJson(infoPath, infoJson, { spaces: 4 });
    }
  }
}

class QuestionCopyEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Copy question ${this.question.qid}`;
  }

  async write() {
    debug('QuestionCopyEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_questions_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = _.map(result.rows, 'title');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

    debug(`Generate qid and title`);
    let names = this.getNamesForCopy(
      this.question.qid,
      oldNamesShort,
      this.question.title,
      oldNamesLong,
    );
    this.qid = names.shortName;
    this.questionTitle = names.longName;
    this.questionPath = path.join(questionsPath, this.qid);
    this.pathsToAdd = [this.questionPath];
    this.commitMessage = `copy question ${this.question.qid} to ${this.qid}`;

    const fromPath = path.join(questionsPath, this.question.qid);
    const toPath = this.questionPath;
    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug(`Read info.json`);
    const infoJson = await fs.readJson(path.join(this.questionPath, 'info.json'));

    debug(`Write info.json with new title and uuid`);
    infoJson.title = this.questionTitle;
    this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
    infoJson.uuid = this.uuid;
    await fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, { spaces: 4 });
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

  async write() {
    debug('QuestionTransferEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    debug(`Get title of question that is being copied`);
    const sourceInfoJson = await fs.readJson(path.join(this.from_path, 'info.json'));
    this.from_title = sourceInfoJson.title || 'Empty Title';

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_questions_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = _.map(result.rows, 'title');

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

    debug(`Generate qid and title`);
    if (oldNamesShort.includes(this.from_qid) || oldNamesLong.includes(this.from_title)) {
      let names = this.getNamesForCopy(this.from_qid, oldNamesShort, this.from_title, oldNamesLong);
      this.qid = names.shortName;
      this.questionTitle = names.longName;
    } else {
      this.qid = this.from_qid;
      this.questionTitle = this.from_title;
    }
    this.questionPath = path.join(questionsPath, this.qid);
    this.pathsToAdd = [this.questionPath];
    this.commitMessage = `copy question ${this.from_qid} (from course ${this.from_course_short_name}) to ${this.qid}`;

    const fromPath = this.from_path;
    const toPath = this.questionPath;
    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug(`Read info.json`);
    const infoJson = await fs.readJson(path.join(this.questionPath, 'info.json'));

    debug(`Write info.json with new title and uuid`);
    infoJson.title = this.questionTitle;
    this.uuid = uuidv4(); // <-- store uuid so we can find the new question in the DB
    infoJson.uuid = this.uuid;
    await fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, { spaces: 4 });
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
      this.deletePath,
    )}`;
  }

  canEdit(callback) {
    if (!contains(this.container.rootPath, this.deletePath)) {
      const err = error.makeWithInfo(
        'Invalid file path',

        `<p>The path of the file to delete</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
          `<p>must be inside the root directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`,
      );
      return callback(err);
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.deletePath),
    );
    if (found) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The path of the file to delete</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
          `<p>must <em>not</em> be inside the directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`,
      );
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  async write() {
    debug('FileDeleteEditor: write()');
    // This will silently do nothing if deletePath no longer exists.
    await fs.remove(this.deletePath);
    this.pathsToAdd = [this.deletePath];
    this.commitMessage = this.description;
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
      this.oldPath,
    )} to ${path.relative(this.container.rootPath, this.newPath)}`;
  }

  canEdit(callback) {
    debug('FileRenameEditor: canEdit()');
    if (!contains(this.container.rootPath, this.oldPath)) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file's old path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
          `<p>must be inside the root directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`,
      );
      return callback(err);
    }

    if (!contains(this.container.rootPath, this.newPath)) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file's new path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
          `<p>must be inside the root directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`,
      );
      return callback(err);
    }

    let found;

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.oldPath),
    );
    if (found) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file's old path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
          `<p>must <em>not</em> be inside the directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`,
      );
      return callback(err);
    }

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.newPath),
    );
    if (found) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file's new path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
          `<p>must <em>not</em> be inside the directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`,
      );
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  async write() {
    debug('FileRenameEditor: write()');

    debug(`ensure path exists`);
    await fs.ensureDir(path.dirname(this.newPath));

    debug(`rename file`);
    await fs.rename(this.oldPath, this.newPath);
    this.pathsToAdd = [this.oldPath, this.newPath];
    this.commitMessage = this.description;
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
      this.filePath,
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
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.filePath}</pre></div>` +
          `<p>must be inside the root directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`,
      );
      return callback(err);
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.filePath),
    );
    if (found) {
      const err = error.makeWithInfo(
        'Invalid file path',
        `<p>The file path</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.filePath}</pre></div>` +
          `<p>must <em>not</em> be inside the directory</p>` +
          `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`,
      );
      return callback(err);
    }

    super.canEdit((err) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  }

  async write() {
    debug('FileUploadEditor: write()');

    debug(`ensure path exists`);
    await fs.ensureDir(path.dirname(this.filePath));

    debug(`write file`);
    await fs.writeFile(this.filePath, this.fileContents);
    this.pathsToAdd = [this.filePath];
    this.commitMessage = this.description;
  }
}

class CourseInfoEditor extends Editor {
  constructor(params) {
    super(params);
    this.description = `Create infoCourse.json`;
  }

  async write() {
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
    await fs.writeJson(infoPath, infoJson, { spaces: 4, flag: 'wx' });

    this.pathsToAdd = [infoPath];
    this.commitMessage = `create infoCourse.json`;
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
