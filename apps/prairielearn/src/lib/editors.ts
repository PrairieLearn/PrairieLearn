import assert from 'node:assert';
import * as path from 'path';

import { type Temporal } from '@js-temporal/polyfill';
import * as async from 'async';
import sha256 from 'crypto-js/sha256.js';
import debugfn from 'debug';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { escapeRegExp } from '@prairielearn/sanitize';

import {
  getCourseCommitHash,
  getLockNameForCoursePath,
  getOrUpdateCourseCommitHash,
  updateCourseCommitHash,
} from '../models/course.js';
import * as courseDB from '../sync/course-db.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';

import * as b64Util from './base64-util.js';
import { logChunkChangesToJob, updateChunksForCourse } from './chunks.js';
import { config } from './config.js';
import {
  type Assessment,
  type Course,
  type CourseInstance,
  type Question,
  type User,
} from './db-types.js';
import { EXAMPLE_COURSE_PATH } from './paths.js';
import { formatJsonWithPrettier } from './prettier.js';
import { type ServerJob, type ServerJobExecutor, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:editors');

async function syncCourseFromDisk(
  course: Course,
  startGitHash: string,
  job: ServerJob,
  courseData?: courseDB.CourseData,
) {
  const endGitHash = await getCourseCommitHash(course.path);

  const syncResult = await syncFromDisk.syncDiskToSqlWithLock(
    course.id,
    course.path,
    job,
    courseData,
  );

  if (syncResult.status === 'sharing_error') {
    throw new Error('Sync completely failed due to invalid question sharing edit.');
  }

  if (config.chunksGenerator) {
    const chunkChanges = await updateChunksForCourse({
      coursePath: course.path,
      courseId: course.id,
      courseData: syncResult.courseData,
      oldHash: startGitHash,
      newHash: endGitHash,
    });
    logChunkChangesToJob(chunkChanges, job);
  }

  await updateCourseCommitHash(course);

  if (syncResult.hadJsonErrors) {
    throw new Error('One or more JSON files contained errors and were unable to be synced');
  }
}

async function cleanAndResetRepository(
  course: Course,
  revision: string,
  env: NodeJS.ProcessEnv,
  job: ServerJob,
) {
  job.info('Clean local files not in remote git repository');
  await job.exec('git', ['clean', '-fdx'], { cwd: course.path, env });
  job.info('Reset state to remote git repository');
  await job.exec('git', ['reset', '--hard', revision], {
    cwd: course.path,
    env,
  });
}

export function getUniqueNames({
  shortNames,
  longNames,
  shortName = 'New',
  longName = 'New',
}: {
  shortNames: string[];
  longNames: string[];
  /**
   * Defaults to 'New' because this function previously only handled the case where the shortName was 'New'
   * Long name is matched case-sensitively
   */
  shortName?: string;
  /**
   * Defaults to 'New' because this function previously only handled the case where the longName was 'New'
   * Short name is always matched case-insensitively, as it is generally used to construct file paths
   */
  longName?: string;
}): { shortName: string; longName: string } {
  function getNumberShortName(oldShortNames: string[]): number {
    let numberOfMostRecentCopy = 1;

    const shortNameCompare = shortName.toLowerCase();

    oldShortNames.forEach((oldShortName) => {
      // shortName is a copy of oldShortName if:
      // it matches (case-sensitively), or
      // if oldShortName matches {shortName}_{number from 0-9}

      const oldShortNameCompare = oldShortName.toLowerCase();
      const found =
        shortNameCompare === oldShortNameCompare ||
        oldShortNameCompare.match(new RegExp(`^${shortNameCompare}_([0-9]+)$`));
      if (found) {
        const foundNumber = shortNameCompare === oldShortNameCompare ? 1 : parseInt(found[1]);
        if (foundNumber >= numberOfMostRecentCopy) {
          numberOfMostRecentCopy = foundNumber + 1;
        }
      }
    });
    return numberOfMostRecentCopy;
  }

  function getNumberLongName(oldLongNames: string[]): number {
    let numberOfMostRecentCopy = 1;
    // longName is a copy of oldLongName if:
    // it matches exactly, or
    // if oldLongName matches {longName} ({number from 0-9})

    oldLongNames.forEach((oldLongName) => {
      if (typeof oldLongName !== 'string') return;
      const found =
        oldLongName === longName || oldLongName.match(new RegExp(`^${longName} \\(([0-9]+)\\)$`));
      if (found) {
        const foundNumber = oldLongName === longName ? 1 : parseInt(found[1]);
        if (foundNumber >= numberOfMostRecentCopy) {
          numberOfMostRecentCopy = foundNumber + 1;
        }
      }
    });
    return numberOfMostRecentCopy;
  }

  const numberShortName = getNumberShortName(shortNames);
  const numberLongName = getNumberLongName(longNames);
  const number = numberShortName > numberLongName ? numberShortName : numberLongName;

  if (number === 1 && shortName !== 'New' && longName !== 'New') {
    // If there are no existing copies, and the shortName/longName aren't the default ones, no number is needed at the end of the names
    return {
      shortName,
      longName,
    };
  } else {
    // If there are existing copies, a number is needed at the end of the names
    return {
      shortName: `${shortName}_${number}`,
      longName: `${longName} (${number})`,
    };
  }
}

/**
 * Returns the new value if it differs from the default value. Otherwise, returns undefined.
 * This is helpful for setting JSON properties that we only want to write to if they are different
 * than the default value.
 */
export function propertyValueWithDefault(existingValue, newValue, defaultValue) {
  if (existingValue === undefined) {
    if (newValue !== defaultValue) {
      return newValue;
    }
  } else {
    if (existingValue !== defaultValue && newValue === defaultValue) {
      return undefined;
    } else {
      return newValue;
    }
  }
}

interface BaseEditorOptions<ResLocals = object> {
  locals: {
    authz_data: Record<string, any>;
    course: Course;
    user: User;
  } & ResLocals;
}

interface BaseEditorOptionsInternal extends BaseEditorOptions {
  description: string;
}

interface WriteResult {
  pathsToAdd: string[];
  commitMessage: string;
}

export abstract class Editor {
  protected authz_data: Record<string, any>;
  protected course: Course;
  protected user: User;
  public readonly description: string;

  protected constructor(params: BaseEditorOptionsInternal) {
    this.authz_data = params.locals.authz_data;
    this.course = params.locals.course;
    this.user = params.locals.user;
    this.description = params.description;
  }

  /**
   * Write changes to disk. Returns an object with that paths that `git` should
   * add and the commit message that should be used.
   *
   * If no files were changed, return null.
   */
  abstract write(): Promise<WriteResult | null>;

  assertCanEdit() {
    // Do not allow users to edit without permission
    if (!this.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    // Do not allow users to edit the exampleCourse
    if (this.course.example_course) {
      throw new HttpStatusError(403, 'Access denied (cannot edit the example course)');
    }
  }

  async prepareServerJob() {
    this.assertCanEdit();
    const serverJob = await createServerJob({
      courseId: this.course.id,
      userId: this.user.user_id,
      authnUserId: this.authz_data.authn_user.user_id,
      type: 'sync',
      description: this.description,
    });
    return serverJob;
  }

  async executeWithServerJob(serverJob: ServerJobExecutor) {
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
        const startGitHash = await getOrUpdateCourseCommitHash(this.course);

        if (!config.fileEditorUseGit) {
          // If we are not using git (e.g., if we are running locally), then we:
          //
          // - Write changes to disk
          // - Sync changes from disk
          //
          // Either the job ends with a thrown error or with the return statement.

          job.info('Write changes to disk');
          job.data.saveAttempted = true;
          await this.write();
          job.data.saveSucceeded = true;

          job.info('Sync changes from disk');
          job.data.syncAttempted = true;
          await syncCourseFromDisk(this.course, startGitHash, job);
          job.data.syncSucceeded = true;

          return;
        }

        // If we are using git (e.g., if we are running in production), then we:
        //
        // - Clean and reset the repository
        // - Write changes to disk
        // - Commit changes to the repository
        // - Push to remote
        //   - If the push fails, pull from remote, clean, reset, write, commit, and push
        // - Clean and reset the repository
        // - Sync changes from disk
        //
        // Note that we only fetch from the remote if the push fails. This avoids an
        // expensive `fetch` operation in the majority of cases where the local course
        // repository is up to date with the remote. If the push fails, we assume that
        // the remote has changes that we need to pull in before we can push.
        //
        // If anything goes wrong in the write or push, we make sure to clean/reset
        // (removing changes made by this edit) and sync (because changes were made
        // by the pull) before we error and exit.

        // Safety check: make sure the course has a defined branch and repository.
        if (!this.course.branch || !this.course.repository) {
          job.fail('Git repository or branch are not set for this course. Exiting...');
          return;
        }

        job.info('Update to latest remote origin address');
        await job.exec('git', ['remote', 'set-url', 'origin', this.course.repository], {
          cwd: this.course.path,
          env: gitEnv,
        });

        await cleanAndResetRepository(this.course, `origin/${this.course.branch}`, gitEnv, job);

        const writeAndCommitChanges = async () => {
          job.data.saveAttempted = true;

          job.info('Write changes to disk');
          const writeResult = await this.write();

          if (!writeResult) {
            job.info('No files were changed');
            return;
          }

          job.info('Commit changes');
          await job.exec('git', ['add', ...writeResult.pathsToAdd], {
            cwd: this.course.path,
            env: gitEnv,
          });
          await job.exec(
            'git',
            [
              '-c',
              `user.name="${this.user.name}"`,
              '-c',
              `user.email="${this.user.email || this.user.uid}"`,
              'commit',
              '-m',
              writeResult.commitMessage,
            ],
            {
              cwd: this.course.path,
              env: gitEnv,
            },
          );
        };

        let courseData: courseDB.CourseData | undefined;
        try {
          await writeAndCommitChanges();

          await cleanAndResetRepository(this.course, 'HEAD', gitEnv, job);
          // Before pushing the changes, ensure that we don't allow someone
          // to put their course into an invalid state by deleting a shared
          // question or otherwise breaking the invariants we rely upon for
          // question sharing.
          const possibleCourseData = await courseDB.loadFullCourse(
            this.course.id,
            this.course.path,
          );
          const sharingConfigurationValid = await syncFromDisk.checkSharingConfigurationValid(
            this.course.id,
            possibleCourseData,
            logger,
          );
          if (!sharingConfigurationValid) {
            await cleanAndResetRepository(this.course, startGitHash, gitEnv, job);
            throw new Error('Invalid sharing operation, reverted to last known good state.');
          }

          try {
            job.info('Push changes to remote git repository');
            await job.exec('git', ['push'], {
              cwd: this.course.path,
              env: gitEnv,
            });
            job.data.saveSucceeded = true;

            // If we were able to push the change to GitHub, we can safely
            // use the course data that we already loaded from disk because
            // we can be sure that there weren't any further changes to the
            // files on disk. This helps keep syncing fast by avoiding loading
            // all course JSON files twice.
            //
            // If pushing fails, we'll need to incorporate the latest changes
            // from the remote repository, so we'll have to load the latest
            // course data from disk after we do so.
            courseData = possibleCourseData;
          } catch {
            job.info('Failed to push changes to remote git repository');
            job.info('Pulling changes from remote git repository and trying again');

            job.info('Fetch from remote git repository');
            await job.exec('git', ['fetch'], {
              cwd: this.course.path,
              env: gitEnv,
            });

            // This will both discard the commit we made locally and also pull
            // in any new changes from the remote.
            await cleanAndResetRepository(this.course, `origin/${this.course.branch}`, gitEnv, job);

            await writeAndCommitChanges();

            try {
              job.info('Push changes to remote git repository');
              await job.exec('git', ['push'], {
                cwd: this.course.path,
                env: gitEnv,
              });
              job.data.saveSucceeded = true;
            } finally {
              // Clean up to remove any empty directories that might have been
              // left behind by operations like renames. This will also ensure
              // that we get back to a good state if the changes couldn't be
              // pushed to the remote.
              await cleanAndResetRepository(
                this.course,
                `origin/${this.course.branch}`,
                gitEnv,
                job,
              );
            }
          }
        } finally {
          // Whether or not we error, we'll sync the course.
          //
          // If pushing succeeded, then we will be syncing the changes made
          // by this edit.
          //
          // If pushing (or anything before pushing) failed, then we will be
          // syncing the changes we pulled from the remote git repository.
          job.info('Sync changes from disk');
          job.data.syncAttempted = true;
          await syncCourseFromDisk(this.course, startGitHash, job, courseData);
          job.data.syncSucceeded = true;
        }
      });
    });
  }

  /**
   * Remove empty preceding subfolders for a question, assessment, etc. based on its ID.
   * This should be run after renames or deletes to prevent syncing issues.
   * @param rootDirectory Root directory that the items are being stored in.
   * @param id Item to delete root subfolders for, relative from the root directory.
   */
  async removeEmptyPrecedingSubfolders(rootDirectory: string, id: string) {
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
  async getExistingShortNames(rootDirectory: string, infoFile: string) {
    const files: string[] = [];
    const walk = async (relativeDir) => {
      const directories = await fs.readdir(path.join(rootDirectory, relativeDir)).catch((err) => {
        // If the directory doesn't exist, then we have nothing to load
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
          return [] as string[];
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

  getNamesForCopy(
    oldShortName: string,
    shortNames: string[],
    oldLongName: string | null,
    longNames: string[],
  ): { shortName: string; longName: string } {
    function getBaseShortName(oldname: string): string {
      const found = oldname.match(new RegExp('^(.*)_copy[0-9]+$'));
      if (found) {
        return found[1];
      } else {
        return oldname;
      }
    }

    function getBaseLongName(oldname: string | null): string {
      if (typeof oldname !== 'string') return 'Unknown';
      debug(oldname);
      const found = oldname.match(new RegExp('^(.*) \\(copy [0-9]+\\)$'));
      debug(found);
      if (found) {
        return found[1];
      } else {
        return oldname;
      }
    }

    function getNumberShortName(basename: string, oldnames: string[]): number {
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

    function getNumberLongName(basename: string, oldnames: string[]): number {
      let number = 1;
      oldnames.forEach((oldname) => {
        if (typeof oldname !== 'string') return;
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
}

export class AssessmentCopyEditor extends Editor {
  private assessment: Assessment;
  private course_instance: CourseInstance;

  public readonly uuid: string;

  constructor(
    params: BaseEditorOptions<{ course_instance: CourseInstance; assessment: Assessment }>,
  ) {
    const { course_instance, assessment } = params.locals;

    super({
      ...params,
      description: `${course_instance.short_name}: Copy assessment ${assessment.tid}`,
    });

    this.assessment = assessment;
    this.course_instance = course_instance;

    this.uuid = uuidv4();
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');
    assert(this.assessment.tid, 'assessment.tid is required');

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
    const oldNamesLong = result.rows.map((row) => row.title);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(assessmentsPath, 'infoAssessment.json');

    debug('Generate TID and Title');
    const names = this.getNamesForCopy(
      this.assessment.tid,
      oldNamesShort,
      this.assessment.title,
      oldNamesLong,
    );
    const tid = names.shortName;
    const assessmentTitle = names.longName;
    const assessmentPath = path.join(assessmentsPath, tid);

    const fromPath = path.join(assessmentsPath, this.assessment.tid);
    const toPath = assessmentPath;

    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug('Read infoAssessment.json');
    const infoJson = await fs.readJson(path.join(assessmentPath, 'infoAssessment.json'));

    delete infoJson['shareSourcePublicly'];

    debug('Write infoAssessment.json with new title and uuid');
    infoJson.title = assessmentTitle;
    infoJson.uuid = this.uuid;

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
    await fs.writeFile(path.join(assessmentPath, 'infoAssessment.json'), formattedJson);

    return {
      pathsToAdd: [assessmentPath],
      commitMessage: `${this.course_instance.short_name}: copy assessment ${this.assessment.tid} to ${tid}`,
    };
  }
}

export class AssessmentDeleteEditor extends Editor {
  private course_instance: CourseInstance;
  private assessment: Assessment;

  constructor(
    params: BaseEditorOptions<{ course_instance: CourseInstance; assessment: Assessment }>,
  ) {
    const { course_instance, assessment } = params.locals;

    super({
      ...params,
      description: `${course_instance.short_name}: Delete assessment ${assessment.tid}`,
    });

    this.course_instance = course_instance;
    this.assessment = assessment;
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');
    assert(this.assessment.tid, 'assessment.tid is required');

    debug('AssessmentDeleteEditor: write()');
    const deletePath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );
    await fs.remove(path.join(deletePath, this.assessment.tid));
    await this.removeEmptyPrecedingSubfolders(deletePath, this.assessment.tid);

    return {
      pathsToAdd: [path.join(deletePath, this.assessment.tid)],
      commitMessage: `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`,
    };
  }
}

export class AssessmentRenameEditor extends Editor {
  private tid_new: string;
  private course_instance: CourseInstance;
  private assessment: Assessment;

  constructor(
    params: BaseEditorOptions<{ course_instance: CourseInstance; assessment: Assessment }> & {
      tid_new: string;
    },
  ) {
    const { course_instance, assessment } = params.locals;

    super({
      ...params,
      description: `${course_instance.short_name}: Rename assessment ${assessment.tid}`,
    });

    this.tid_new = params.tid_new;
    this.course_instance = course_instance;
    this.assessment = assessment;
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');
    assert(this.assessment.tid, 'assessment.tid is required');

    debug('AssessmentRenameEditor: write()');
    const assessmentsPath = path.join(
      this.course.path,
      'courseInstances',
      this.course_instance.short_name,
      'assessments',
    );
    const oldPath = path.normalize(path.join(assessmentsPath, this.assessment.tid));
    const newPath = path.normalize(path.join(assessmentsPath, this.tid_new));

    // Skip editing if the paths are the same.
    if (oldPath === newPath) return null;

    // Ensure that the assessment folder path is fully contained in the assessments directory
    if (!contains(assessmentsPath, newPath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The updated path of the assessments folder</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${newPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${assessmentsPath}</pre>
          </div>
        `,
      });
    }

    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(assessmentsPath, this.assessment.tid);

    return {
      pathsToAdd: [oldPath, newPath],
      commitMessage: `${this.course_instance.short_name}: rename assessment ${this.assessment.tid} to ${this.tid_new}`,
    };
  }
}

export class AssessmentAddEditor extends Editor {
  private course_instance: CourseInstance;

  public readonly uuid: string;
  private aid: string;
  private title: string;
  private type: 'Homework' | 'Exam';
  private set: string;
  private module?: string;

  constructor(
    params: BaseEditorOptions<{ course_instance: CourseInstance }> & {
      aid: string;
      title: string;
      type: 'Homework' | 'Exam';
      set: string;
      module?: string;
    },
  ) {
    const { course_instance } = params.locals;

    super({
      ...params,
      description: `${course_instance.short_name}: Add assessment`,
    });

    this.course_instance = course_instance;

    this.uuid = uuidv4();

    this.aid = params.aid;
    this.title = params.title;
    this.type = params.type;
    this.set = params.set;
    this.module = params.module;
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');

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
    const oldNamesLong = result.rows.map((row) => row.title);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(assessmentsPath, 'infoAssessment.json');

    debug('Generate TID and Title');
    const { shortName: tid, longName: assessmentTitle } = getUniqueNames({
      shortNames: oldNamesShort,
      longNames: oldNamesLong,
      shortName: this.aid,
      longName: this.title,
    });

    const assessmentPath = path.join(assessmentsPath, tid);

    // Ensure that the assessment folder path is fully contained in the assessments directory
    if (!contains(assessmentsPath, assessmentPath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The path of the assessments folder to add</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${assessmentPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${assessmentsPath}</pre>
          </div>
        `,
      });
    }

    debug('Write infoAssessment.json');

    const infoJson = {
      uuid: this.uuid,
      type: this.type,
      title: assessmentTitle,
      set: this.set,
      module: this.module,
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

    return {
      pathsToAdd: [assessmentPath],
      commitMessage: `${this.course_instance.short_name}: add assessment ${tid}`,
    };
  }
}

export class CourseInstanceCopyEditor extends Editor {
  private course_instance: CourseInstance;

  public readonly uuid: string;

  constructor(params: BaseEditorOptions<{ course_instance: CourseInstance }>) {
    const { course_instance } = params.locals;

    super({
      ...params,
      description: `Copy course instance ${course_instance.short_name}`,
    });

    this.course_instance = course_instance;

    this.uuid = uuidv4();
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');

    debug('CourseInstanceCopyEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_course_instances_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = result.rows.map((row) => row.long_name);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(
      courseInstancesPath,
      'infoCourseInstance.json',
    );

    debug('Generate short_name and long_name');
    const names = this.getNamesForCopy(
      this.course_instance.short_name,
      oldNamesShort,
      this.course_instance.long_name,
      oldNamesLong,
    );
    const short_name = names.shortName;
    const courseInstancePath = path.join(courseInstancesPath, short_name);

    const fromPath = path.join(courseInstancesPath, this.course_instance.short_name);
    const toPath = courseInstancePath;

    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug('Read infoCourseInstance.json');
    const infoJson = await fs.readJson(path.join(courseInstancePath, 'infoCourseInstance.json'));

    debug('Write infoCourseInstance.json with new longName and uuid');
    infoJson.longName = names.longName;
    infoJson.uuid = this.uuid;

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
    await fs.writeFile(path.join(courseInstancePath, 'infoCourseInstance.json'), formattedJson);

    return {
      pathsToAdd: [courseInstancePath],
      commitMessage: `copy course instance ${this.course_instance.short_name} to ${short_name}`,
    };
  }
}

export class CourseInstanceDeleteEditor extends Editor {
  private course_instance: CourseInstance;

  constructor(params: BaseEditorOptions<{ course_instance: CourseInstance }>) {
    const { course_instance } = params.locals;

    super({
      ...params,
      description: `Delete course instance ${course_instance.short_name}`,
    });

    this.course_instance = course_instance;
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');

    debug('CourseInstanceDeleteEditor: write()');
    const deletePath = path.join(this.course.path, 'courseInstances');
    await fs.remove(path.join(deletePath, this.course_instance.short_name));
    await this.removeEmptyPrecedingSubfolders(deletePath, this.course_instance.short_name);

    return {
      pathsToAdd: [path.join(deletePath, this.course_instance.short_name)],
      commitMessage: `delete course instance ${this.course_instance.short_name}`,
    };
  }
}

export class CourseInstanceRenameEditor extends Editor {
  private ciid_new: string;
  private course_instance: CourseInstance;

  constructor(
    params: BaseEditorOptions<{ course_instance: CourseInstance }> & { ciid_new: string },
  ) {
    const {
      locals: { course_instance },
      ciid_new,
    } = params;

    super({
      ...params,
      description: `Rename course instance ${course_instance.short_name} to ${ciid_new}`,
    });

    this.ciid_new = ciid_new;
    this.course_instance = course_instance;
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');

    debug('CourseInstanceRenameEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');
    const oldPath = path.join(courseInstancesPath, this.course_instance.short_name);
    const newPath = path.join(courseInstancesPath, this.ciid_new);

    // Skip editing if the paths are the same.
    if (oldPath === newPath) return null;

    // Ensure that the updated course instance folder path is fully contained in the course instances directory
    if (!contains(courseInstancesPath, newPath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The updated path of the course instance folder</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${newPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${courseInstancesPath}</pre>
          </div>
        `,
      });
    }

    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(
      path.join(this.course.path, 'courseInstances'),
      this.course_instance.short_name,
    );

    return {
      pathsToAdd: [oldPath, newPath],
      commitMessage: `rename course instance ${this.course_instance.short_name} to ${this.ciid_new}`,
    };
  }
}

export class CourseInstanceAddEditor extends Editor {
  public readonly uuid: string;
  private short_name: string;
  private long_name: string;
  private start_access_date?: Temporal.ZonedDateTime;
  private end_access_date?: Temporal.ZonedDateTime;

  constructor(
    params: BaseEditorOptions & {
      short_name: string;
      long_name: string;
      start_access_date?: Temporal.ZonedDateTime;
      end_access_date?: Temporal.ZonedDateTime;
    },
  ) {
    super({
      ...params,
      description: 'Add course instance',
    });

    this.uuid = uuidv4();

    this.short_name = params.short_name;
    this.long_name = params.long_name;

    if (
      params.start_access_date &&
      params.end_access_date &&
      params.start_access_date.epochMilliseconds > params.end_access_date.epochMilliseconds
    ) {
      throw new HttpStatusError(400, 'Start date must be before end date');
    }

    this.start_access_date = params.start_access_date;
    this.end_access_date = params.end_access_date;
  }

  async write() {
    debug('CourseInstanceAddEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_course_instances_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = result.rows.map((row) => row.long_name);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(
      courseInstancesPath,
      'infoCourseInstance.json',
    );

    debug('Generate short_name and long_name');
    const { shortName, longName } = getUniqueNames({
      shortNames: oldNamesShort,
      longNames: oldNamesLong,
      shortName: this.short_name,
      longName: this.long_name,
    });

    const courseInstancePath = path.join(courseInstancesPath, shortName);

    // Ensure that the new course instance folder path is fully contained in the course instances directory
    if (!contains(courseInstancesPath, courseInstancePath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The path of the course instance folder to add</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${courseInstancePath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${courseInstancesPath}</pre>
          </div>
        `,
      });
    }

    debug('Write infoCourseInstance.json');

    let allowAccess: { startDate?: string; endDate?: string } | undefined = undefined;

    if (this.start_access_date || this.end_access_date) {
      allowAccess = {
        startDate: this.start_access_date
          ? formatDate(
              new Date(this.start_access_date.epochMilliseconds),
              this.course.display_timezone,
              {
                includeTz: false,
              },
            )
          : undefined,
        endDate: this.end_access_date
          ? formatDate(
              new Date(this.end_access_date.epochMilliseconds),
              this.course.display_timezone,
              {
                includeTz: false,
              },
            )
          : undefined,
      };
    }

    const infoJson = {
      uuid: this.uuid,
      longName,
      allowAccess: allowAccess !== undefined ? [allowAccess] : [],
    };

    // We use outputJson to create the directory this.courseInstancePath if it
    // does not exist (which it shouldn't). We use the file system flag 'wx' to
    // throw an error if this.courseInstancePath already exists.
    await fs.outputJson(path.join(courseInstancePath, 'infoCourseInstance.json'), infoJson, {
      spaces: 4,
      flag: 'wx',
    });

    return {
      pathsToAdd: [courseInstancePath],
      commitMessage: `add course instance ${shortName}`,
    };
  }
}

export class QuestionAddEditor extends Editor {
  public readonly uuid: string;

  private qid?: string;
  private title?: string;
  private template_qid?: string;
  private files?: Record<string, string>;
  private isDraft?: boolean;

  constructor(
    params: BaseEditorOptions & {
      qid?: string;
      title?: string;
      template_qid?: string;
      files?: Record<string, string>;
      isDraft?: boolean;
    },
  ) {
    super({
      ...params,
      description: 'Add question',
    });

    this.uuid = uuidv4();
    this.qid = params.qid;
    this.title = params.title;
    this.template_qid = params.template_qid;
    this.files = params.files;
    this.isDraft = params.isDraft;
  }

  async write() {
    debug('QuestionAddEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    const { qid, title } = await run(async () => {
      if (!(this.qid && this.title) && this.isDraft) {
        let draftNumber = await sqldb.queryRow(
          sql.update_draft_number,
          { course_id: this.course.id },
          z.number(),
        );

        while (fs.existsSync(path.join(questionsPath, '__drafts__', `draft_${draftNumber}`))) {
          //increment and sync to postgres
          draftNumber = await sqldb.queryRow(
            sql.update_draft_number,
            { course_id: this.course.id },
            z.number(),
          );
        }

        return { qid: `__drafts__/draft_${draftNumber}`, title: `draft #${draftNumber}` };
      }

      debug('Get all existing long names');
      const result = await sqldb.queryAsync(sql.select_questions_with_course, {
        course_id: this.course.id,
      });
      const oldNamesLong = result.rows.map((row) => row.title);

      debug('Get all existing short names');
      const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

      debug('Generate qid and title');
      const { shortName, longName } = getUniqueNames({
        shortNames: oldNamesShort,
        longNames: oldNamesLong,
        shortName: this.qid,
        longName: this.title,
      });

      return { qid: shortName, title: longName };
    });

    const newQuestionPath = path.join(questionsPath, qid);

    // Ensure that the question folder path is fully contained in the questions directory of the course
    if (!contains(questionsPath, newQuestionPath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The path of the question folder to add</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${newQuestionPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${questionsPath}</pre>
          </div>
        `,
      });
    }

    if (this.template_qid) {
      const exampleCourseQuestionsPath = path.join(EXAMPLE_COURSE_PATH, 'questions');
      const fromPath = path.join(exampleCourseQuestionsPath, this.template_qid);

      // Ensure that the template_qid folder path is fully contained in the example course questions directory
      if (!contains(exampleCourseQuestionsPath, fromPath)) {
        throw new AugmentedError('Invalid folder path', {
          info: html`
            <p>The path of the template question folder</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${fromPath}</pre>
            </div>
            <p>must be inside the root directory</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${exampleCourseQuestionsPath}</pre>
            </div>
          `,
        });
      }

      // Ensure that the question folder path is fully contained in the questions directory of the course
      if (!contains(questionsPath, newQuestionPath)) {
        throw new AugmentedError('Invalid folder path', {
          info: html`
            <p>The path of the question folder to add</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${newQuestionPath}</pre>
            </div>
            <p>must be inside the root directory</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${questionsPath}</pre>
            </div>
          `,
        });
      }

      debug(`Copy template\n from ${fromPath}\n to ${newQuestionPath}`);
      await fs.copy(fromPath, newQuestionPath, { overwrite: false, errorOnExist: true });

      debug('Read info.json');
      const infoJson = await fs.readJson(path.join(newQuestionPath, 'info.json'));

      debug('Write info.json with the new title and uuid');
      infoJson.title = this.title;
      infoJson.uuid = this.uuid;

      // Reset the topic.
      infoJson.topic = 'Default';

      // Delete values that might not make sense in the target course.
      delete infoJson.tags;
      delete infoJson.shareSourcePublicly;
      delete infoJson.sharingSets;
      delete infoJson.sharePublicly;

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));

      await fs.writeFile(path.join(newQuestionPath, 'info.json'), formattedJson);
    } else {
      debug(`Create an empty question at ${newQuestionPath}`);

      const newQuestionInfoFilePath = path.join(newQuestionPath, 'info.json');
      const newQuestionHtmlFilePath = path.join(newQuestionPath, 'question.html');
      const newQuestionScriptFilePath = path.join(newQuestionPath, 'server.py');

      const data = {
        uuid: this.uuid,
        title,
        topic: 'Default',
        type: 'v3',
      };

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(data));

      await fs.ensureDir(newQuestionPath);
      await fs.writeFile(newQuestionInfoFilePath, formattedJson);
      await fs.ensureFile(newQuestionHtmlFilePath);
      await fs.ensureFile(newQuestionScriptFilePath);
    }

    if (this.files != null) {
      debug('Remove template files when file texts provided');
      await fs.remove(path.join(newQuestionPath, 'question.html'));
      await fs.remove(path.join(newQuestionPath, 'server.py'));

      if ('info.json' in this.files) {
        await fs.remove(path.join(newQuestionPath, 'info.json'));
      }

      debug('Load files from text');
      for (const file of Object.keys(this.files)) {
        const newPath = path.join(newQuestionPath, file);

        // Ensure that files are fully contained in the question directory.
        if (contains(newQuestionPath, newPath)) {
          await fs.writeFile(newPath, this.files[file]);
        } else {
          throw new AugmentedError('Invalid file path', {
            info: html`
              <p>The path of the file to add</p>
              <div class="container">
                <pre class="bg-dark text-white rounded p-2">${newPath}</pre>
              </div>
              <p>must be inside the root directory</p>
              <div class="container">
                <pre class="bg-dark text-white rounded p-2">${newQuestionPath}</pre>
              </div>
            `,
          });
        }
      }
    }
    return {
      pathsToAdd: [newQuestionPath],
      commitMessage: `add question ${qid}`,
    };
  }
}

export class QuestionModifyEditor extends Editor {
  private question: Question;
  private origHash: string;
  private files: Record<string, string | null>;

  constructor(
    params: BaseEditorOptions<{ question: Question }> & {
      files: Record<string, string | null>;
    },
  ) {
    const {
      locals: { question },
      files,
    } = params;

    super({
      ...params,
      description: `Modify question ${question.qid}`,
    });

    this.question = question;
    this.files = files;
  }

  async write() {
    assert(this.question.qid, 'question.qid is required');

    const questionPath = path.join(this.course.path, 'questions', this.question.qid);

    // Validate that all file paths don't escape the question directory.
    for (const filePath of Object.keys(this.files)) {
      if (!contains(questionPath, filePath)) {
        throw new Error(`Invalid file path: ${filePath}`);
      }
    }

    // Note that we deliberately only modify files that were provided. We don't
    // try to delete "excess" files that aren't in the `files` object because the
    // user might have added extra files of their own, e.g. in the `tests` or
    // `clientFilesQuestion` directory. We don't want to remove them, and we also
    // don't want to mandate that the caller must always read all existing files
    // and provide them in the `files` object.
    for (const [filePath, contents] of Object.entries(this.files)) {
      const resolvedPath = path.join(questionPath, filePath);
      if (contents === null) {
        await fs.remove(resolvedPath);
      } else {
        await fs.writeFile(resolvedPath, b64Util.b64DecodeUnicode(contents));
      }
    }

    return {
      pathsToAdd: [questionPath],
      commitMessage: this.description,
    };
  }
}

export class QuestionDeleteEditor extends Editor {
  private questions: Question[];

  constructor(params: BaseEditorOptions & { questions: Question | Question[] }) {
    let questions: Question[];

    if (Array.isArray(params.questions)) {
      questions = params.questions;
    } else {
      questions = [params.questions];
    }

    super({
      ...params,
      description:
        questions.length === 1
          ? `Delete question ${questions[0].qid}`
          : `Delete questions ${questions.map((x) => x.qid).join(', ')}`,
    });

    this.questions = questions;
  }

  async write() {
    debug('QuestionDeleteEditor: write()');

    for (const question of this.questions) {
      // This shouldn't happen in practice; this is just to satisfy TypeScript.
      assert(question.qid, 'question.qid is required');

      await fs.remove(path.join(this.course.path, 'questions', question.qid));
      await this.removeEmptyPrecedingSubfolders(
        path.join(this.course.path, 'questions'),
        question.qid,
      );
    }

    return {
      pathsToAdd: this.questions.flatMap((question) =>
        question.qid !== null ? path.join(this.course.path, 'questions', question.qid) : [],
      ),
      commitMessage:
        this.questions.length === 1
          ? `delete question ${this.questions[0].qid}`
          : `delete questions (${this.questions.map((x) => x.qid).join(', ')})`,
    };
  }
}

export class QuestionRenameEditor extends Editor {
  private qid_new: string;
  private question: Question;

  constructor(params: BaseEditorOptions<{ question: Question }> & { qid_new: string }) {
    const {
      locals: { question },
      qid_new,
    } = params;

    super({
      ...params,
      description: `Rename question ${question.qid}`,
    });

    this.qid_new = qid_new;
    this.question = question;
  }

  async write() {
    assert(this.question.qid, 'question.qid is required');

    debug('QuestionRenameEditor: write()');

    const questionsPath = path.join(this.course.path, 'questions');
    const oldPath = path.join(questionsPath, this.question.qid);
    const newPath = path.join(questionsPath, this.qid_new);

    // Skip editing if the paths are the same.
    if (oldPath === newPath) return null;

    // Ensure that the updated question folder path is fully contained in the questions directory
    if (!contains(questionsPath, newPath)) {
      throw new AugmentedError('Invalid folder path', {
        info: html`
          <p>The updated path of the question folder</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${newPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${questionsPath}</pre>
          </div>
        `,
      });
    }

    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(questionsPath, this.question.qid);

    debug(`Find all assessments (in all course instances) that contain ${this.question.qid}`);
    const result = await sqldb.queryAsync(sql.select_assessments_with_question, {
      question_id: this.question.id,
    });
    const assessments = result.rows;

    const pathsToAdd = [oldPath, newPath];

    debug(
      `For each assessment, read/write infoAssessment.json to replace ${this.question.qid} with ${this.qid_new}`,
    );
    for (const assessment of assessments) {
      const infoPath = path.join(
        this.course.path,
        'courseInstances',
        assessment.course_instance_directory,
        'assessments',
        assessment.assessment_directory,
        'infoAssessment.json',
      );
      pathsToAdd.push(infoPath);

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
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
      await fs.writeFile(infoPath, formattedJson);
    }

    return {
      pathsToAdd,
      commitMessage: `rename question ${this.question.qid} to ${this.qid_new}`,
    };
  }
}

export class QuestionCopyEditor extends Editor {
  private question: Question;

  public readonly uuid: string;

  constructor(params: BaseEditorOptions<{ question: Question }>) {
    const {
      locals: { question },
    } = params;

    super({
      ...params,
      description: `Copy question ${question.qid}`,
    });

    this.question = question;

    this.uuid = uuidv4();
  }

  async write() {
    assert(this.question.qid, 'question.qid is required');

    debug('QuestionCopyEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_questions_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = result.rows.map((row) => row.title);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

    debug('Generate qid and title');
    const names = this.getNamesForCopy(
      this.question.qid,
      oldNamesShort,
      this.question.title,
      oldNamesLong,
    );
    const qid = names.shortName;
    const questionPath = path.join(questionsPath, qid);

    const fromPath = path.join(questionsPath, this.question.qid);
    const toPath = questionPath;

    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug('Read info.json');
    const infoJson = await fs.readJson(path.join(questionPath, 'info.json'));

    debug('Write info.json with new title and uuid');
    infoJson.title = names.longName;
    infoJson.uuid = this.uuid;

    // Even when copying a question within a course, we don't want to preserve
    // sharing settings because they cannot be undone
    delete infoJson['sharingSets'];
    delete infoJson['sharePublicly'];
    delete infoJson['shareSourcePublicly'];

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
    await fs.writeFile(path.join(questionPath, 'info.json'), formattedJson);

    return {
      pathsToAdd: [questionPath],
      commitMessage: `copy question ${this.question.qid} to ${qid}`,
    };
  }
}

export class QuestionTransferEditor extends Editor {
  private from_qid: string;
  private from_course: string;
  private from_path: string;

  public readonly uuid: string;

  constructor(
    params: BaseEditorOptions & {
      from_qid: string;
      from_course_short_name: Course['short_name'];
      from_path: string;
    },
  ) {
    const { from_qid, from_course_short_name, from_path } = params;

    const from_course =
      from_course_short_name == null ? 'unknown course' : `course ${from_course_short_name}`;

    super({
      ...params,
      description: `Copy question ${from_qid} from ${from_course}`,
    });

    this.from_qid = from_qid;
    this.from_path = from_path;

    this.uuid = uuidv4();
  }

  async write() {
    debug('QuestionTransferEditor: write()');
    const questionsPath = path.join(this.course.path, 'questions');

    debug('Get title of question that is being copied');
    const sourceInfoJson = await fs.readJson(path.join(this.from_path, 'info.json'));
    const from_title = sourceInfoJson.title || 'Empty Title';

    debug('Get all existing long names');
    const result = await sqldb.queryAsync(sql.select_questions_with_course, {
      course_id: this.course.id,
    });
    const oldNamesLong = result.rows.map((row) => row.title);

    debug('Get all existing short names');
    const oldNamesShort = await this.getExistingShortNames(questionsPath, 'info.json');

    debug('Generate qid and title');
    let qid = this.from_qid;
    let questionTitle = from_title;
    if (oldNamesShort.includes(this.from_qid) || oldNamesLong.includes(from_title)) {
      const names = this.getNamesForCopy(this.from_qid, oldNamesShort, from_title, oldNamesLong);
      qid = names.shortName;
      questionTitle = names.longName;
    }
    const questionPath = path.join(questionsPath, qid);

    const fromPath = this.from_path;
    const toPath = questionPath;

    debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug('Read info.json');
    const infoJson = await fs.readJson(path.join(questionPath, 'info.json'));

    debug('Write info.json with new title and uuid');
    infoJson.title = questionTitle;
    infoJson.uuid = this.uuid;

    // When transferring a question from an example/template course, drop the tags. They
    // are likely undesirable in the template course.
    if (this.course.example_course || this.course.template_course) {
      delete infoJson.tags;
    }

    // We do not want to preserve sharing settings when copying a question to another course
    delete infoJson['sharingSets'];
    delete infoJson['sharePublicly'];
    delete infoJson['shareSourcePublicly'];

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
    await fs.writeFile(path.join(questionPath, 'info.json'), formattedJson);

    return {
      pathsToAdd: [questionPath],
      commitMessage: `copy question ${this.from_qid} (from ${this.from_course}) to ${qid}`,
    };
  }
}

export class FileDeleteEditor extends Editor {
  private container: { rootPath: string; invalidRootPaths: string[] };
  private deletePath: string;

  constructor(
    params: BaseEditorOptions & {
      container: { rootPath: string; invalidRootPaths: string[] };
      deletePath: string;
    },
  ) {
    const {
      locals: { course },
      container,
      deletePath,
    } = params;

    let prefix = '';
    if (course.path !== container.rootPath) {
      prefix = `${path.basename(container.rootPath)}: `;
    }

    super({
      ...params,
      description: `${prefix}Delete ${path.relative(container.rootPath, deletePath)}`,
    });

    this.container = container;
    this.deletePath = deletePath;
  }

  assertCanEdit() {
    if (!contains(this.container.rootPath, this.deletePath)) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The path of the file to delete</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre>
          </div>
        `,
      });
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.deletePath),
    );
    if (found) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The path of the file to delete</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre>
          </div>
          <p>must <em>not</em> be inside the directory</p>
          <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        `,
      });
    }

    super.assertCanEdit();
  }

  async write() {
    debug('FileDeleteEditor: write()');
    // This will silently do nothing if deletePath no longer exists.
    await fs.remove(this.deletePath);

    return {
      pathsToAdd: [this.deletePath],
      commitMessage: this.description,
    };
  }
}

export class FileRenameEditor extends Editor {
  private container: { rootPath: string; invalidRootPaths: string[] };
  private oldPath: string;
  private newPath: string;

  constructor(
    params: BaseEditorOptions & {
      container: { rootPath: string; invalidRootPaths: string[] };
      oldPath: string;
      newPath: string;
    },
  ) {
    const {
      locals: { course },
      container,
      oldPath,
      newPath,
    } = params;

    let prefix = '';
    if (course.path !== container.rootPath) {
      prefix = `${path.basename(container.rootPath)}: `;
    }

    const relativeOldPath = path.relative(container.rootPath, oldPath);
    const relativeNewPath = path.relative(container.rootPath, newPath);

    super({
      ...params,
      description: `${prefix}Rename ${relativeOldPath} to ${relativeNewPath}`,
    });

    this.container = container;
    this.oldPath = oldPath;
    this.newPath = newPath;
  }

  assertCanEdit() {
    debug('FileRenameEditor: canEdit()');
    if (!contains(this.container.rootPath, this.oldPath)) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file's old path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre>
          </div>
        `,
      });
    }

    if (!contains(this.container.rootPath, this.newPath)) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file's new path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.newPath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre>
          </div>
        `,
      });
    }

    let found;

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.oldPath),
    );
    if (found) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file's old path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre>
          </div>
          <p>must <em>not</em> be inside the directory</p>
          <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        `,
      });
    }

    found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.newPath),
    );
    if (found) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file's new path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.newPath}</pre>
          </div>
          <p>must <em>not</em> be inside the directory</p>
          <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        `,
      });
    }

    super.assertCanEdit();
  }

  async write() {
    debug('FileRenameEditor: write()');

    debug('ensure path exists');
    await fs.ensureDir(path.dirname(this.newPath));

    debug('rename file');
    await fs.rename(this.oldPath, this.newPath);

    return {
      pathsToAdd: [this.oldPath, this.newPath],
      commitMessage: this.description,
    };
  }
}

export class FileUploadEditor extends Editor {
  private container: { rootPath: string; invalidRootPaths: string[] };
  private filePath: string;
  private fileContents: Buffer;

  constructor(
    params: BaseEditorOptions & {
      container: { rootPath: string; invalidRootPaths: string[] };
      filePath: string;
      fileContents: Buffer;
    },
  ) {
    const {
      locals: { course },
      container,
      filePath,
      fileContents,
    } = params;

    let prefix = '';
    if (course.path !== container.rootPath) {
      prefix = `${path.basename(container.rootPath)}: `;
    }
    super({
      ...params,
      description: `${prefix}Upload ${path.relative(container.rootPath, params.filePath)}`,
    });

    this.container = container;
    this.filePath = filePath;
    this.fileContents = fileContents;
  }

  getHashFromBuffer(buffer: Buffer) {
    return sha256(buffer.toString('utf8')).toString();
  }

  async shouldEdit() {
    debug('look for old contents');
    let contents;
    try {
      contents = await fs.readFile(this.filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        debug('no old contents, so continue with upload');
        return true;
      }

      throw err;
    }

    debug('get hash of old contents and of new contents');
    const oldHash = this.getHashFromBuffer(contents);
    const newHash = this.getHashFromBuffer(this.fileContents);
    debug('oldHash: ' + oldHash);
    debug('newHash: ' + newHash);
    if (oldHash === newHash) {
      debug('new contents are the same as old contents, so abort upload');
      return false;
    } else {
      debug('new contents are different from old contents, so continue with upload');
      return true;
    }
  }

  assertCanEdit() {
    if (!contains(this.container.rootPath, this.filePath)) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.filePath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre>
          </div>
        `,
      });
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.filePath),
    );
    if (found) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.filePath}</pre>
          </div>
          <p>must <em>not</em> be inside the directory</p>
          <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        `,
      });
    }

    super.assertCanEdit();
  }

  async write() {
    debug('FileUploadEditor: write()');

    if (!(await this.shouldEdit())) return null;

    debug('ensure path exists');
    await fs.ensureDir(path.dirname(this.filePath));

    debug('write file');
    await fs.writeFile(this.filePath, this.fileContents);

    return {
      pathsToAdd: [this.filePath],
      commitMessage: this.description,
    };
  }
}

export class FileModifyEditor extends Editor {
  // Naming convention for contents and hashes in FileModifyEditor:
  //
  //    xyzContentsUTF - contents of xyz file as utf8
  //
  //    xyzContents - contents of xyz file as utf8 that is base64-encoded
  //
  //    xyzHash - hash of contents of xyz file as utf8 that is base64-encoded
  //
  // The base64 encoding and its corresponding hash are used by the file editor.
  // If this weren't the case, then we wouldn't use it here either. For example,
  // FileUploadEditor - which is used by the file browser - doesn't require any
  // base64 encoding. In that case, contents/hashes are just utf8.

  private container: { rootPath: string; invalidRootPaths: string[] };
  private filePath: string;
  private editContents: string;
  private origHash: string;

  constructor(
    params: BaseEditorOptions & {
      container: { rootPath: string; invalidRootPaths: string[] };
      filePath: string;
      editContents: string;
      origHash: string;
    },
  ) {
    const {
      locals: { course },
      container,
      filePath,
      editContents,
      origHash,
    } = params;

    let prefix = '';
    if (course.path !== container.rootPath) {
      prefix = `${path.basename(container.rootPath)}: `;
    }

    super({
      ...params,
      description: `${prefix}Modify ${path.relative(container.rootPath, filePath)}`,
    });

    this.container = container;
    this.filePath = filePath;
    this.editContents = editContents;
    this.origHash = origHash;
  }

  getHash(contents: string) {
    return sha256(contents).toString();
  }

  async shouldEdit() {
    debug('get hash of edit contents');
    const editHash = this.getHash(this.editContents);
    debug('editHash: ' + editHash);
    debug('origHash: ' + this.origHash);
    if (this.origHash === editHash) {
      debug('edit contents are the same as orig contents, so abort');
      return false;
    } else {
      debug('edit contents are different from orig contents, so continue');
      return true;
    }
  }

  assertCanEdit() {
    if (!contains(this.container.rootPath, this.filePath)) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.filePath}</pre>
          </div>
          <p>must be inside the root directory</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre>
          </div>
        `,
      });
    }

    const found = this.container.invalidRootPaths.find((invalidRootPath) =>
      contains(invalidRootPath, this.filePath),
    );
    if (found) {
      throw new AugmentedError('Invalid file path', {
        info: html`
          <p>The file path</p>
          <div class="container">
            <pre class="bg-dark text-white rounded p-2">${this.filePath}</pre>
          </div>
          <p>must <em>not</em> be inside the directory</p>
          <div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>
        `,
      });
    }

    super.assertCanEdit();
  }

  async write() {
    debug('FileModifyEditor: write()');

    if (!(await this.shouldEdit())) return null;

    debug('ensure path exists');
    await fs.ensureDir(path.dirname(this.filePath));

    debug('verify disk hash matches orig hash');
    const diskContentsUTF = await fs.readFile(this.filePath, 'utf8');
    const diskContents = b64Util.b64EncodeUnicode(diskContentsUTF);
    const diskHash = this.getHash(diskContents);
    if (this.origHash !== diskHash) {
      throw new Error('Another user made changes to the file you were editing.');
    }

    debug('write file');
    await fs.writeFile(this.filePath, b64Util.b64DecodeUnicode(this.editContents));

    return {
      pathsToAdd: [this.filePath],
      commitMessage: this.description,
    };
  }
}

export class CourseInfoCreateEditor extends Editor {
  private infoJson: any;

  constructor(params: BaseEditorOptions & { infoJson: any }) {
    super({
      ...params,
      description: 'Create infoCourse.json',
    });

    this.infoJson = params.infoJson;
  }

  async write() {
    debug('CourseInfoEditor: write()');
    const infoPath = path.join(this.course.path, 'infoCourse.json');

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(this.infoJson));

    // This will error if:
    // - this.course.path does not exist (use of writeFile)
    // - Creating a new file and infoPath does exist (use of 'wx')
    await fs.writeFile(infoPath, formattedJson, { flag: 'wx' });

    return {
      pathsToAdd: [infoPath],
      commitMessage: 'create infoCourse.json',
    };
  }
}

export class MultiEditor extends Editor {
  private editors: Editor[];

  constructor(params: BaseEditorOptions & { description: string }, editors: Editor[]) {
    super(params);

    this.editors = editors;
  }

  assertCanEdit() {
    // This should be handled automatically by the individual editors, but
    // we'll check it here just in case.
    super.assertCanEdit();

    for (const editor of this.editors) {
      editor.assertCanEdit();
    }
  }

  async write() {
    const pathsToAdd = new Set<string>();
    const commitMessages: string[] = [];

    let didChange = false;

    for (const editor of this.editors) {
      const result = await editor.write();
      if (result) {
        didChange = true;
        result.pathsToAdd.forEach((path) => pathsToAdd.add(path));
        commitMessages.push(result.commitMessage);
      }
    }

    if (!didChange) return null;

    return {
      pathsToAdd: Array.from(pathsToAdd),
      commitMessage: commitMessages.join('; '),
    };
  }
}
