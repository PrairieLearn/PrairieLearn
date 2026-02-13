import assert from 'node:assert';
import * as path from 'path';

import * as async from 'async';
import sha256 from 'crypto-js/sha256.js';
import debugfn from 'debug';
import fs from 'fs-extra';
import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { selectAssessments } from '../models/assessment.js';
import {
  getCourseCommitHash,
  getLockNameForCoursePath,
  getOrUpdateCourseCommitHash,
  updateCourseCommitHash,
} from '../models/course.js';
import { selectQuestionsForCourseInstanceCopy } from '../models/question.js';
import * as courseDB from '../sync/course-db.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';

import { b64DecodeUnicode, b64EncodeUnicode } from './base64-util.js';
import { logChunkChangesToJob, updateChunksForCourse } from './chunks.js';
import type { StaffCourse } from './client/safe-db-types.js';
import { config } from './config.js';
import {
  type Assessment,
  AssessmentSchema,
  type Course,
  type CourseInstance,
  CourseInstanceSchema,
  type Question,
  type User,
} from './db-types.js';
import { getNamesForCopy, getUniqueNames } from './editorUtil.shared.js';
import { idsEqual } from './id.js';
import { EXAMPLE_COURSE_PATH, REPOSITORY_ROOT_PATH } from './paths.js';
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

export async function getOriginalHash(path: string) {
  try {
    return sha256(b64EncodeUnicode(await fs.readFile(path, 'utf8'))).toString();
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
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
      type: 'sync',
      description: this.description,
      userId: this.user.id,
      authnUserId: this.authz_data.authn_user.id,
      courseId: this.course.id,
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

        // Safety check: refuse to perform git operations if the course is a
        // subdirectory of the PrairieLearn repository. Otherwise the `git clean`
        // and `git reset` commands could delete or modify files with pending changes.
        if (contains(REPOSITORY_ROOT_PATH, this.course.path)) {
          job.fail(
            'Cannot perform git operations on courses inside the PrairieLearn repository. Exiting...',
          );
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
            job,
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
              // During GitHub incidents, we've observed GitHub taking multiple
              // minutes to handle a `git push`. To avoid the job sitting for
              // an unreasonable amount of time and causing a 504 when we fail
              // to respond to the request in time, we'll use a relatively short
              // timeout to fail the push if it takes too long.
              cancelSignal: AbortSignal.timeout(10_000),
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
              // As with `git push` above, we'll use a timeout here to avoid
              // long delays during GitHub incidents resulting in 504 errors.
              cancelSignal: AbortSignal.timeout(10_000),
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
                // See above `git push` attempt for an explanation of this timeout.
                cancelSignal: AbortSignal.timeout(10_000),
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
}

/**
 * Get all existing shortnames, recursing on nonempty directories that do not contain
 * an "info" file.
 *
 * TODO: we might be able to get away with querying the database for this information instead.
 * It's unclear why we're going to disk in the first place. Possibly it's to be extra cautious
 * in case we're in a state where there are sync errors, but even in that case, sync errors
 * should not have prevented us from persisting short names in the first place.
 *
 * @param rootDirectory Directory to start searching from.
 * @param infoFile Name of the info file, will stop recursing once a directory contains this.
 */
async function getExistingShortNames(rootDirectory: string, infoFile: string) {
  const files: string[] = [];
  const walk = async (relativeDir: string) => {
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

    this.uuid = crypto.randomUUID();
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
    const assessments = await selectAssessments({ course_instance_id: this.course_instance.id });
    const oldNamesLong = assessments.map((row) => row.title).filter((title) => title !== null);

    debug('Get all existing short names');
    const oldNamesShort = await getExistingShortNames(assessmentsPath, 'infoAssessment.json');

    debug('Generate TID and Title');
    const names = getNamesForCopy(
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

    debug(`Copy question from ${fromPath} to ${toPath}`);
    await fs.copy(fromPath, toPath, { overwrite: false, errorOnExist: true });

    debug('Read infoAssessment.json');
    const infoJson = await fs.readJson(path.join(assessmentPath, 'infoAssessment.json'));

    delete infoJson.shareSourcePublicly;

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

    debug(`Move files from ${oldPath} to ${newPath}`);
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

    this.uuid = crypto.randomUUID();

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
    const assessments = await selectAssessments({ course_instance_id: this.course_instance.id });
    const oldNamesLong = assessments.map((row) => row.title).filter((title) => title !== null);
    const nextAssessmentNumber =
      Math.max(
        0,
        ...assessments
          .filter((assessment) => assessment.assessment_set.name === this.set)
          .map((assessment) => Number(assessment.number))
          .filter(Number.isInteger),
      ) + 1;

    debug('Get all existing short names');
    const oldNamesShort = await getExistingShortNames(assessmentsPath, 'infoAssessment.json');

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
      number: nextAssessmentNumber.toString(),
      allowAccess: [],
      zones: [],
    };
    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));

    // We use outputFile to create the directory assessmentPath if it
    // does not exist (which it shouldn't). We use the file system flag 'wx'
    // to throw an error if `assessmentPath` already exists.
    await fs.outputFile(path.join(assessmentPath, 'infoAssessment.json'), formattedJson, {
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
  private from_course: Course | StaffCourse;
  private from_path: string;
  private is_transfer: boolean;
  private metadataOverrides?: Record<string, any>;

  public readonly uuid: string;

  constructor(
    params: BaseEditorOptions & {
      from_course: Course | StaffCourse;
      from_path: string;
      course_instance: CourseInstance;
      metadataOverrides?: Record<string, any>;
    },
  ) {
    const is_transfer = !idsEqual(params.locals.course.id, params.from_course.id);
    super({
      ...params,
      description: `Copy course instance ${params.course_instance.short_name}${is_transfer ? ` from ${params.from_course.short_name}` : ''}`,
    });
    this.course_instance = params.course_instance;
    this.from_course = params.from_course;
    this.from_path = params.from_path;
    this.is_transfer = is_transfer;
    this.metadataOverrides = params.metadataOverrides;

    this.uuid = crypto.randomUUID();
  }

  async write() {
    assert(this.course_instance.short_name, 'course_instance.short_name is required');

    debug('CourseInstanceCopyEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    debug('Get all existing long names');
    const oldNamesLong = await sqldb.queryRows(
      sql.select_course_instances_with_course,
      { course_id: this.course.id },
      z.string(),
    );

    debug('Get all existing short names');
    const oldNamesShort = await getExistingShortNames(
      courseInstancesPath,
      'infoCourseInstance.json',
    );

    // NOTE: The public course instance copy page currently does not support customizing these.
    debug('Generate short_name and long_name');
    let shortName = this.course_instance.short_name;
    let longName = this.course_instance.long_name;
    if (oldNamesShort.includes(shortName) || (longName && oldNamesLong.includes(longName))) {
      const names = getNamesForCopy(
        this.course_instance.short_name,
        oldNamesShort,
        this.course_instance.long_name,
        oldNamesLong,
      );
      shortName = names.shortName;
      longName = names.longName;
    }
    const courseInstancePath = path.join(courseInstancesPath, shortName);

    const toPath = courseInstancePath;

    debug(`Copy course instance from ${this.from_path} to ${toPath}`);
    await fs.copy(this.from_path, toPath, { overwrite: false, errorOnExist: true });

    debug('Read infoCourseInstance.json');
    const infoJson = await fs.readJson(path.join(courseInstancePath, 'infoCourseInstance.json'));

    const pathsToAdd: string[] = [];
    if (this.is_transfer) {
      if (!this.from_course.sharing_name) {
        throw new AugmentedError("Can't copy from course which hasn't declared a sharing name", {});
      }

      const existingQuestionUuids = new Set(await selectQuestionUuidsForCourse(this.course));
      const existingQuestionTitles = await selectQuestionTitlesForCourse(this.course);
      const existingQuestionQids = await getExistingShortNames(
        path.join(this.course.path, 'questions'),
        'info.json',
      );

      const questionsForCopy = await selectQuestionsForCourseInstanceCopy(this.course_instance.id);
      const questionsToLink = new Set(
        questionsForCopy.filter((q) => !q.should_copy).map((q) => q.qid),
      );
      const questionsToCopy = new Set(questionsForCopy.filter((q) => q.should_copy));

      // Map of QIDs in the original assessments to the new QIDs in the target course.
      const newQids: Record<string, string> = {};

      for (const question of questionsToCopy) {
        // This shouldn't happen in practice; this is just to satisfy TypeScript.
        assert(question.qid, 'question.qid is required');

        const from_path = path.join(this.from_course.path, 'questions', question.qid);
        const from_qid = path.join(this.from_course.sharing_name, question.qid);

        // If we previously copied the same question from the same course, this
        // will avoid QID/title collisions by appending things like `_copy1` and
        // `(copy 1)` to QIDs and titles, respectively.
        //
        // TODO: Ideally, we'd want to deduplicate questions if possible. That is,
        // if a question was previously copied via another course instance, we can
        // just reuse it instead of copying it again. This will require some way
        // to intelligently compare questions:
        // - We'd need to compare the files (`question.html`, `server.py`, everything
        //   but the JSON file).
        // - We'd need to compare the JSON file, while ignoring things that don't
        //   change the behavior of the question, such as UUID, title, tags, topics, etc.
        // If questions are identical, we can just reuse the one that was copied before.

        // We'll make a best-effort attempt to preserve the UUID when copying a question,
        // as that will in theory allow us to track the usage of copied questions across
        // different courses. This would also let us perform the deduplication proposed
        // above even when questions have had their QIDs changed in the target course.
        const uuid = run(() => {
          // All non-deleted questions should have a UUID.
          assert(question.uuid, 'question.uuid is required');

          if (existingQuestionUuids.has(question.uuid)) return crypto.randomUUID();

          return question.uuid;
        });

        // For reasons that are lost to time, the `file_transfers` machinery that course instance
        // copying utilizes first copies files from the source course to a temporary directory,
        // and then completes the copy by moving the files to the target course. However, we opted
        // not to use this mechanism to copy questions, as we think it's largely unnecessary.
        //
        // TODO: in the future, update `file_transfers` to copy content directly from the source
        // course to the target course. To avoid races, we'd want to store just the _intent_ to copy
        // a question or course instance, and then when we want to complete the copy, we'd grab a
        // lock on both the source and target courses, then perform the copy.
        // To avoid deadlocks we'll need to take these locks in a universal order,
        // such as ordering the two courses by `id` and locking in that order.
        const { questionPath, qid } = await copyQuestion({
          course: this.course,
          from_course: this.from_course,
          from_path,
          from_qid,
          uuid,
          existingTitles: existingQuestionTitles,
          existingQids: existingQuestionQids,
        });

        newQids[question.qid] = qid;
        pathsToAdd.push(questionPath);
      }

      // Update the infoAssessment.json files to include the course sharing name for each question
      // It's OK that we are writing these directly to disk because when copying to another course
      // we are working from a temporary folder
      await updateInfoAssessmentFilesForTargetCourse(
        this.course_instance.id,
        courseInstancePath,
        this.from_course.sharing_name,
        questionsToLink,
        newQids,
      );
    }

    debug('Write infoCourseInstance.json with new longName and uuid');
    infoJson.longName = longName;
    infoJson.uuid = this.uuid;

    // Clear access rules to avoid leaking student PII or unexpectedly
    // making the copied course instance available to users.
    // Note: this means that copied course instances will be switched to the modern publishing
    // system.
    delete infoJson.allowAccess;

    // We do not want to preserve sharing settings when copying a course instance
    delete infoJson.shareSourcePublicly;

    Object.assign(infoJson, this.metadataOverrides ?? {});

    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
    await fs.writeFile(path.join(courseInstancePath, 'infoCourseInstance.json'), formattedJson);

    pathsToAdd.push(courseInstancePath);
    return {
      pathsToAdd,
      commitMessage: `copy course instance ${this.course_instance.short_name}${this.is_transfer ? ` (from ${this.from_course.short_name})` : ''} to ${shortName}`,
    };
  }
}

async function updateInfoAssessmentFilesForTargetCourse(
  courseInstanceId: string,
  courseInstancePath: string,
  fromCourseSharingName: string,
  questionsToImport: Set<string | null>,
  newQids: Record<string, string>,
) {
  const assessments = await selectAssessments({ course_instance_id: courseInstanceId });
  for (const assessment of assessments) {
    // The column is technically nullable, but in practice all assessments have a TID
    assert(assessment.tid !== null, 'assessment.tid is required');
    const infoPath = path.join(
      courseInstancePath,
      'assessments',
      assessment.tid,
      'infoAssessment.json',
    );

    const infoJson = await fs.readJson(infoPath);

    // We do not want to preserve certain settings when copying an assessment to another course
    delete infoJson.shareSourcePublicly;
    infoJson.allowAccess = [];

    function shouldAddSharingPrefix(qid: string) {
      return qid && !qid.startsWith('@') && questionsToImport.has(qid);
    }

    // Rewrite the question IDs to include the course sharing name,
    // or to point to the new path if the question was copied
    for (const zone of infoJson.zones) {
      for (const question of zone.questions) {
        if (question.id) {
          if (question.id in newQids) {
            question.id = newQids[question.id];
          } else if (shouldAddSharingPrefix(question.id)) {
            question.id = `@${fromCourseSharingName}/${question.id}`;
          }
        } else if (question.alternatives) {
          for (const alternative of question.alternatives) {
            if (alternative.id in newQids) {
              alternative.id = newQids[alternative.id];
            } else if (shouldAddSharingPrefix(alternative.id)) {
              alternative.id = `@${fromCourseSharingName}/${alternative.id}`;
            }
          }
        }
      }
    }
    await fs.writeJson(infoPath, infoJson, { spaces: 4 });
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

    debug(`Move files from ${oldPath} to ${newPath}`);
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
  private metadataOverrides?: Record<string, any>;

  constructor(
    params: BaseEditorOptions & {
      short_name: string;
      long_name: string;
      metadataOverrides?: Record<string, any>;
    },
  ) {
    super({
      ...params,
      description: 'Add course instance',
    });

    this.uuid = crypto.randomUUID();

    this.short_name = params.short_name;
    this.long_name = params.long_name;
    this.metadataOverrides = params.metadataOverrides;
  }

  async write() {
    debug('CourseInstanceAddEditor: write()');
    const courseInstancesPath = path.join(this.course.path, 'courseInstances');

    // At this point, upstream code should have already validated
    // the short name using `validateShortName` from `short-name.ts`.

    // If upstream code has not done this, that could lead to a path traversal attack.
    const courseInstancePath = path.join(courseInstancesPath, this.short_name);

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

    const infoJson: Record<string, any> = {
      uuid: this.uuid,
      longName: this.long_name,
      ...this.metadataOverrides,
    };
    const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));

    // We use outputFile to create the directory courseInstancePath if it
    // does not exist (which it shouldn't). We use the file system flag 'wx' to
    // throw an error if this.courseInstancePath already exists.
    await fs.outputFile(path.join(courseInstancePath, 'infoCourseInstance.json'), formattedJson, {
      flag: 'wx',
    });

    return {
      pathsToAdd: [courseInstancePath],
      commitMessage: `add course instance ${this.short_name}`,
    };
  }
}

export class QuestionAddEditor extends Editor {
  public readonly uuid: string;

  private qid?: string;
  private title?: string;
  private template_source?: 'empty' | 'example' | 'course';
  private template_qid?: string;
  private files?: Record<string, string>;
  private isDraft?: boolean;

  constructor(
    params: BaseEditorOptions & {
      qid?: string;
      title?: string;
      template_source?: 'empty' | 'example' | 'course';
      template_qid?: string;
      files?: Record<string, string>;
      isDraft?: boolean;
    },
  ) {
    super({
      ...params,
      description: 'Add question',
    });

    this.uuid = crypto.randomUUID();
    this.qid = params.qid;
    this.title = params.title;
    this.template_source = params.template_source;
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

        while (
          await fs.pathExists(path.join(questionsPath, '__drafts__', `draft_${draftNumber}`))
        ) {
          // increment and sync to postgres
          draftNumber = await sqldb.queryRow(
            sql.update_draft_number,
            { course_id: this.course.id },
            z.number(),
          );
        }

        return { qid: `__drafts__/draft_${draftNumber}`, title: `draft #${draftNumber}` };
      }

      debug('Get all existing long names');
      const oldNamesLong = await selectQuestionTitlesForCourse(this.course);

      debug('Get all existing short names');
      const oldNamesShort = await getExistingShortNames(questionsPath, 'info.json');

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

    if (this.template_source !== 'empty' && this.template_qid) {
      const sourceQuestionsPath =
        this.template_source === 'course'
          ? questionsPath
          : path.join(EXAMPLE_COURSE_PATH, 'questions');
      const fromPath = path.join(sourceQuestionsPath, this.template_qid);

      // Ensure that the template_qid folder path is fully contained in the source course questions directory
      if (!contains(sourceQuestionsPath, fromPath)) {
        throw new AugmentedError('Invalid folder path', {
          info: html`
            <p>The path of the template question folder</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${fromPath}</pre>
            </div>
            <p>must be inside the root directory</p>
            <div class="container">
              <pre class="bg-dark text-white rounded p-2">${sourceQuestionsPath}</pre>
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

      debug(`Copy question from ${fromPath} to ${newQuestionPath}`);

      await copyQuestionFiles({
        fromPath,
        toPath: newQuestionPath,
        // When copying from example course templates, skip README.md files at the root.
        // They are specific to the template and will quickly drift from the copied question.
        skipReadme: this.template_source === 'example' && this.template_qid.startsWith('template/'),
      });

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
        await fs.writeFile(resolvedPath, b64DecodeUnicode(contents));
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
  private title_new: string | undefined;
  private question: Question;

  constructor(
    params: BaseEditorOptions<{ question: Question }> & { qid_new: string; title_new?: string },
  ) {
    const {
      locals: { question },
      qid_new,
      title_new,
    } = params;

    super({
      ...params,
      description: `Rename question ${question.qid}`,
    });

    this.qid_new = qid_new;
    this.title_new = title_new;
    this.question = question;
  }

  private async moveQuestion({
    oldPath,
    newPath,
    existingQid,
    questionsPath,
  }: {
    oldPath: string;
    newPath: string;
    existingQid: string;
    questionsPath: string;
  }) {
    const pathsToAdd: string[] = [];

    debug(`Move files from ${oldPath} to ${newPath}`);
    await fs.move(oldPath, newPath, { overwrite: false });
    await this.removeEmptyPrecedingSubfolders(questionsPath, existingQid);

    pathsToAdd.push(oldPath, newPath);

    debug(`Find all assessments (in all course instances) that contain ${this.question.qid}`);
    const assessments = await sqldb.queryRows(
      sql.select_assessments_with_question,
      { question_id: this.question.id },
      z.object({
        course_instance_directory: CourseInstanceSchema.shape.short_name,
        assessment_directory: AssessmentSchema.shape.tid,
      }),
    );

    debug(
      `For each assessment, read/write infoAssessment.json to replace ${this.question.qid} with ${this.qid_new}`,
    );
    for (const assessment of assessments) {
      assert(
        assessment.course_instance_directory !== null,
        'course_instance_directory is required',
      );
      assert(assessment.assessment_directory !== null, 'assessment_directory is required');
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
      const infoJson: any = await fs.readJson(infoPath);

      debug(`Find/replace QID in ${infoPath}`);
      let found = false as boolean;
      infoJson.zones?.forEach((zone: any) => {
        zone.questions?.forEach((question: any) => {
          if (question.alternatives) {
            question.alternatives?.forEach((alternative: any) => {
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

    return pathsToAdd;
  }

  async write() {
    assert(this.question.qid, 'question.qid is required');

    debug('QuestionRenameEditor: write()');

    const questionsPath = path.join(this.course.path, 'questions');
    const oldPath = path.join(questionsPath, this.question.qid);
    const newPath = path.join(questionsPath, this.qid_new);

    const qidChanging = oldPath !== newPath;

    // Skip editing if neither the QID nor the title is changing.
    if (!qidChanging && !this.title_new) return null;

    // Ensure that the updated question folder path is fully contained in the questions directory
    if (qidChanging && !contains(questionsPath, newPath)) {
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

    const pathsToAdd: string[] = [];

    if (qidChanging) {
      pathsToAdd.push(
        ...(await this.moveQuestion({
          oldPath,
          newPath,
          questionsPath,
          existingQid: this.question.qid,
        })),
      );
    }

    // Update the question title in info.json if a new title was provided.
    if (this.title_new) {
      // Use the new path if QID changed, otherwise use the old path.
      const questionPath = qidChanging ? newPath : oldPath;
      const questionInfoPath = path.join(questionPath, 'info.json');

      debug(`Read ${questionInfoPath}`);
      const questionInfoJson: any = await fs.readJson(questionInfoPath);

      debug(`Update title in ${questionInfoPath}`);
      questionInfoJson.title = this.title_new;

      const formattedQuestionInfoJson = await formatJsonWithPrettier(
        JSON.stringify(questionInfoJson),
      );
      await fs.writeFile(questionInfoPath, formattedQuestionInfoJson);

      // Only add to pathsToAdd if we haven't already added the question path.
      if (!qidChanging) {
        pathsToAdd.push(questionPath);
      }
    }

    const commitMessage = run(() => {
      if (qidChanging) {
        return `rename question ${this.question.qid} to ${this.qid_new}`;
      }

      return `update title of question ${this.question.qid}`;
    });

    return {
      pathsToAdd,
      commitMessage,
    };
  }
}

/**
 * This rename editor is used to rename an assessment set referenced by assessments.
 *
 * It does not rename the assessment set at the course level (infoCourse.json).
 */
export class AssessmentSetRenameEditor extends Editor {
  private oldName: string;
  private newName: string;

  constructor(
    params: BaseEditorOptions & {
      oldName: string;
      newName: string;
    },
  ) {
    super({
      ...params,
      description: `Rename assessment set ${params.oldName} to ${params.newName}`,
    });
    this.oldName = params.oldName;
    this.newName = params.newName;
  }

  async write() {
    if (this.oldName === this.newName) return null;

    debug('AssessmentSetRenameEditor: write()');

    const assessments = await sqldb.queryRows(
      sql.select_assessments_with_assessment_set,
      { assessment_set_name: this.oldName, course_id: this.course.id },
      z.object({
        course_instance_directory: CourseInstanceSchema.shape.short_name,
        assessment_directory: AssessmentSchema.shape.tid,
      }),
    );

    if (assessments.length === 0) return null;

    const pathsToAdd: string[] = [];

    for (const assessment of assessments) {
      assert(
        assessment.course_instance_directory !== null,
        'course_instance_directory is required',
      );
      assert(assessment.assessment_directory !== null, 'assessment_directory is required');

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

      debug(`Replace assessment set name in ${infoPath}`);
      infoJson.set = this.newName;

      debug(`Write ${infoPath}`);
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
      await fs.writeFile(infoPath, formattedJson);
    }

    return {
      pathsToAdd,
      commitMessage: `rename assessment set ${this.oldName} to ${this.newName}`,
    };
  }
}

export class QuestionCopyEditor extends Editor {
  private from_course: Course;
  private from_course_label: string;
  private from_qid: string;
  private from_path: string;
  private is_transfer: boolean;

  public readonly uuid: string;

  constructor(
    params: BaseEditorOptions & {
      from_course: Course;
      from_qid: string;
      from_path: string;
      is_transfer: boolean;
    },
  ) {
    const { from_qid, from_course, from_path, is_transfer } = params;

    const from_course_label =
      from_course.short_name == null ? 'unknown course' : `course ${from_course.short_name}`;

    super({
      ...params,
      description: `Copy question ${from_qid}${is_transfer ? ` from ${from_course_label}` : ''}`,
    });

    this.from_course = from_course;
    this.from_course_label = from_course_label;
    this.from_qid = from_qid;
    this.from_path = from_path;
    this.is_transfer = is_transfer;

    this.uuid = crypto.randomUUID();
  }

  async write() {
    debug('QuestionCopyEditor: write()');

    const { questionPath, qid } = await copyQuestion({
      course: this.course,
      from_course: this.from_course,
      from_path: this.from_path,
      from_qid: this.from_qid,
      uuid: this.uuid,
      existingTitles: await selectQuestionTitlesForCourse(this.course),
      existingQids: await getExistingShortNames(
        path.join(this.course.path, 'questions'),
        'info.json',
      ),
    });

    return {
      pathsToAdd: [questionPath],
      commitMessage: `copy question ${this.from_qid}${this.is_transfer ? ` (from ${this.from_course_label})` : ''} to ${qid}`,
    };
  }
}

async function selectQuestionTitlesForCourse(course: Course): Promise<string[]> {
  return await sqldb.queryRows(
    sql.select_question_titles_for_course,
    { course_id: course.id },
    z.string(),
  );
}

async function selectQuestionUuidsForCourse(course: Course): Promise<string[]> {
  return await sqldb.queryRows(
    sql.select_question_uuids_for_course,
    { course_id: course.id },
    z.string(),
  );
}

/**
 * Copy question files from one location to another, optionally skipping README.md
 * files at the root of example course template questions.
 *
 * @param options
 * @param options.fromPath - Source directory path
 * @param options.toPath - Destination directory path
 * @param options.skipReadme - If true, skip copying README.md at the root of the source directory
 */
async function copyQuestionFiles({
  fromPath,
  toPath,
  skipReadme,
}: {
  fromPath: string;
  toPath: string;
  skipReadme: boolean;
}): Promise<void> {
  await fs.copy(fromPath, toPath, {
    overwrite: false,
    errorOnExist: true,
    filter: (src: string) => {
      // When copying from example course templates, skip README.md files at the root.
      // They are specific to the template and will quickly drift from the copied question.
      if (skipReadme && src === path.join(fromPath, 'README.md')) {
        return false;
      }
      return true;
    },
  });
}

async function copyQuestion({
  course,
  from_course,
  from_path,
  from_qid,
  uuid,
  existingTitles: oldLongNames,
  existingQids: oldShortNames,
}: {
  course: Course | StaffCourse;
  from_course: Course | StaffCourse;
  from_path: string;
  from_qid: string;
  uuid: string;
  existingTitles: string[];
  existingQids: string[];
}): Promise<{ questionPath: string; qid: string }> {
  const questionsPath = path.join(course.path, 'questions');

  debug('Get title of question that is being copied');
  const sourceInfoJson = await fs.readJson(path.join(from_path, 'info.json'));
  const from_title = sourceInfoJson.title || 'Empty Title';

  debug('Generate qid and title');
  let qid = from_qid;
  let questionTitle = from_title;
  if (oldShortNames.includes(from_qid) || oldLongNames.includes(from_title)) {
    const names = getNamesForCopy(from_qid, oldShortNames, from_title, oldLongNames);
    qid = names.shortName;
    questionTitle = names.longName;
  }
  const questionPath = path.join(questionsPath, qid);

  const fromPath = from_path;
  const toPath = questionPath;

  debug(`Copy question from ${fromPath} to ${toPath}`);

  await copyQuestionFiles({
    fromPath,
    toPath,
    // When copying from example course templates, skip README.md files at the root.
    // They are specific to the template and will quickly drift from the copied question.
    skipReadme: from_course.path === EXAMPLE_COURSE_PATH && from_qid.startsWith('template/'),
  });

  debug('Read info.json');
  const infoJson = await fs.readJson(path.join(questionPath, 'info.json'));

  debug('Write info.json with new title and uuid');
  infoJson.title = questionTitle;
  infoJson.uuid = uuid;

  // When transferring a question from an example/template course, drop the tags. They
  // are likely undesirable in the template course.
  if (course.example_course || course.template_course) {
    delete infoJson.tags;
  }

  // We do not want to preserve sharing settings when copying a question to another course
  delete infoJson.sharingSets;
  delete infoJson.sharePublicly;
  delete infoJson.shareSourcePublicly;

  const formattedJson = await formatJsonWithPrettier(JSON.stringify(infoJson));
  await fs.writeFile(path.join(questionPath, 'info.json'), formattedJson);
  return { questionPath, qid };
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
    } catch (err: any) {
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

  shouldEdit() {
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

    if (!this.shouldEdit()) return null;

    debug('ensure path exists');
    await fs.ensureDir(path.dirname(this.filePath));

    debug('verify disk hash matches orig hash');
    const diskContentsUTF = await fs.readFile(this.filePath, 'utf8');
    const diskContents = b64EncodeUnicode(diskContentsUTF);
    const diskHash = this.getHash(diskContents);
    if (this.origHash !== diskHash) {
      throw new Error('Another user made changes to the file you were editing.');
    }

    debug('write file');
    await fs.writeFile(this.filePath, b64DecodeUnicode(this.editContents));

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
