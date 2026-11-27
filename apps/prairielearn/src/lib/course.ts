import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';
import fs from 'fs-extra';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as namedLocks from '@prairielearn/named-locks';
import { contains } from '@prairielearn/path-utils';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  getCourseCommitHash,
  getLockNameForCoursePath,
  selectCourseById,
  updateCourseCommitHash,
  updateCourseSyncConfiguration,
} from '../models/course.js';
import { syncQuestionQid, syncQuestionTitle } from '../models/question.js';
import { flushElementCache } from '../question-servers/freeform.js';
import { assessmentDependenciesRequireFullSync } from '../sync/assessmentDependencies.js';
import * as courseDB from '../sync/course-db.js';
import * as infofile from '../sync/infofile.js';
import { type QuestionRenameScope } from '../sync/questionRenameSync.js';
import {
  getQuestionSyncPlan,
  syncNewQuestions,
  syncQuestionInfo,
  syncQuestionMetadata,
} from '../sync/questionSync.js';
import { getSyncConfiguration } from '../sync/syncConfiguration.js';
import { checkSharingConfigurationValid, syncDiskToSqlWithLock } from '../sync/syncFromDisk.js';

import * as chunks from './chunks.js';
import { config } from './config.js';
import { type Course, type User, UserSchema } from './db-types.js';
import { features } from './features/index.js';
import { REPOSITORY_ROOT_PATH } from './paths.js';
import { type ServerJob, type ServerJobResult, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Check that an assessment_instance_id really belongs to the given course_instance_id
 *
 * @param assessment_instance_id - The assessment instance to check.
 * @param course_instance_id - The course instance it should belong to.
 */
export async function checkAssessmentInstanceBelongsToCourseInstance(
  assessment_instance_id: string,
  course_instance_id: string,
): Promise<void> {
  if (
    (await sqldb.queryOptionalScalar(
      sql.check_belongs,
      { assessment_instance_id, course_instance_id },
      IdSchema,
    )) == null
  ) {
    throw new HttpStatusError(403, 'Access denied');
  }
}

/**
 * Return the name and UID (email) for every owner of the specified course.
 *
 * @param course_id The ID of the course.
 */
export async function getCourseOwners(course_id: string): Promise<User[]> {
  return await sqldb.queryRows(sql.select_owners, { course_id }, UserSchema);
}

export interface PreparedCourseData {
  data: courseDB.CourseData;
  configuration: Awaited<ReturnType<typeof getSyncConfiguration>>;
  revision: string;
}

/** Requires the course lock. Uploads precede the transaction that activates their references. */
export async function syncCourseFromDisk({
  course,
  startGitHash,
  expectedRevision,
  job,
  preparedCourseData,
  editedPaths = [],
  renameScope,
  newQuestion,
  forceFull = false,
  checkExternalDependencies = false,
}: {
  course: Course;
  startGitHash: string | null;
  expectedRevision?: string;
  job: ServerJob;
  preparedCourseData?: PreparedCourseData;
  editedPaths?: string[];
  renameScope?: QuestionRenameScope | null;
  newQuestion?: { qid: string; uuid: string };
  forceFull?: boolean;
  checkExternalDependencies?: boolean;
}): Promise<{ status: 'complete'; hadJsonErrors: boolean } | { status: 'sharing_error' }> {
  const configuration = await getSyncConfiguration(course);
  return await features.runWithOverrides(configuration.features, async () => {
    const endGitHash = await getCourseCommitHash(course.path);
    if (expectedRevision !== undefined && endGitHash !== expectedRevision) {
      throw new Error('The course checkout does not match the confirmed Git revision.');
    }
    if (startGitHash) {
      const revision = await execa('git', ['cat-file', '-e', `${startGitHash}^{commit}`], {
        cwd: course.path,
        reject: false,
      });
      if (revision.exitCode !== 0) startGitHash = null;
    }
    const previousConfiguration = (await selectCourseById(course.id)).sync_configuration;
    const configurationChanged = !isDeepStrictEqual(previousConfiguration, configuration);
    if (configurationChanged) {
      job.info('Sync configuration changed; reprocessing all course metadata');
    }
    let questionChanges =
      config.fileEditorUseGit && !forceFull && !configurationChanged
        ? await getQuestionSyncPlan({
            course,
            oldHash: startGitHash,
            newHash: endGitHash,
            editedPaths,
            renameScope,
            newQuestion,
          })
        : null;

    if (
      questionChanges !== null &&
      checkExternalDependencies &&
      (await assessmentDependenciesRequireFullSync(course))
    ) {
      job.info('External assessment dependencies require full course sync');
      questionChanges = null;
    }

    if (questionChanges !== null) {
      const qids = questionChanges.map((change) => change.qid);
      job.info(`Syncing question changes: ${qids.join(', ') || 'no changes'}`);
      const prepared =
        config.chunksGenerator && qids.length > 0
          ? await chunks.prepareQuestionContentChunks({
              coursePath: course.path,
              courseId: course.id,
              qids,
              replacedQids: questionChanges.map((change) =>
                change.kind === 'rename' ? change.oldQid : change.qid,
              ),
            })
          : undefined;
      await sqldb.runInTransactionAsync(async () => {
        await syncNewQuestions(
          course,
          questionChanges.filter((change) => change.kind === 'create'),
        );
        for (const change of questionChanges) {
          if (change.kind === 'title') {
            await syncQuestionTitle({ course_id: course.id, qid: change.qid, title: change.title });
          } else if (change.kind === 'recover' || change.kind === 'settings') {
            job.info(`Reprocessing question metadata: ${change.qid}`);
            await syncQuestionInfo(course, change);
            for (const error of change.info.errors) job.error(error);
            for (const warning of change.info.warnings) job.warn(warning);
          } else if (change.kind === 'rename') {
            await syncQuestionQid({
              course_id: course.id,
              old_qid: change.oldQid,
              qid: change.qid,
              title: change.title,
            });
          } else if (change.kind === 'metadata') {
            await syncQuestionMetadata(course, change);
          }
        }
        if (prepared) await chunks.applyPreparedChunks(course.id, prepared);
        await updateCourseCommitHash(course);
        await updateCourseSyncConfiguration(course.id, configuration);
      });
      if (prepared) chunks.logChunkChangesToJob(prepared.changes, job);
      if (config.devMode) flushElementCache();
      return {
        status: 'complete',
        hadJsonErrors: questionChanges.some(
          (change) =>
            (change.kind === 'recover' || change.kind === 'settings') &&
            infofile.hasErrors(change.info),
        ),
      };
    }

    job.info('Using full course sync');
    const data =
      preparedCourseData?.revision === endGitHash &&
      isDeepStrictEqual(preparedCourseData.configuration, configuration)
        ? preparedCourseData.data
        : await courseDB.loadFullCourse(course.id, course.path);
    if (!(await checkSharingConfigurationValid(course, data, job))) {
      return { status: 'sharing_error' };
    }
    const prepared = config.chunksGenerator
      ? await chunks.prepareChunksForCourse({
          coursePath: course.path,
          courseId: course.id,
          courseData: data,
          oldHash: startGitHash,
          newHash: endGitHash,
          regenerateAll:
            !startGitHash ||
            forceFull ||
            !config.fileEditorUseGit ||
            previousConfiguration?.chunksGenerator !== true,
        })
      : undefined;
    const result = await sqldb.runInTransactionAsync(async () => {
      const result = await syncDiskToSqlWithLock(course, job, data);
      if (result.status !== 'complete') return result;
      if (prepared) await chunks.applyPreparedChunks(course.id, prepared);
      await updateCourseCommitHash(course);
      await updateCourseSyncConfiguration(course.id, configuration);
      return result;
    });
    if (result.status !== 'complete') return { status: 'sharing_error' };
    if (prepared) chunks.logChunkChangesToJob(prepared.changes, job);
    return { status: 'complete', hadJsonErrors: result.hadJsonErrors };
  });
}

export async function pullAndUpdateCourse({
  course,
  userId,
  authnUserId,
}: {
  course: Course;
  userId: string | null;
  authnUserId: string | null;
}): Promise<{ jobSequenceId: string; jobPromise: Promise<ServerJobResult> }> {
  const serverJob = await createServerJob({
    type: 'sync',
    description: 'Pull from remote git repository',
    userId,
    authnUserId,
    courseId: course.id,
  });

  const gitEnv = process.env;
  if (config.gitSshCommand != null) {
    gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
  }

  const jobPromise = serverJob.execute(async (job) => {
    const { path, branch, repository } = course;

    if (!path) {
      job.fail('Path is not set for this course. Exiting...');
      return;
    }
    if (!branch || !repository) {
      job.fail('Git repository or branch are not set for this course. Exiting...');
      return;
    }

    // Safety check: refuse to perform git operations if the course is a
    // subdirectory of the PrairieLearn repository. Otherwise the `git clean`
    // and `git reset` commands could delete or modify files with pending changes.
    if (contains(REPOSITORY_ROOT_PATH, path)) {
      job.fail(
        'Cannot perform git operations on courses inside the PrairieLearn repository. Exiting...',
      );
      return;
    }

    const lockName = getLockNameForCoursePath(path);
    await namedLocks.doWithLock(
      lockName,
      {
        timeout: 5000,
        onNotAcquired: () => {
          job.fail('Another user is already syncing or modifying this course.');
        },
      },
      async () => {
        let startGitHash: string | null = null;

        // These should be set by the time we get here, but checking to allow typing to assume non-null.
        if (!path || !branch || !repository) {
          job.fail('Invalid state');
          return;
        }

        const gitOptions = { cwd: path, env: gitEnv };
        const coursePathExists = await fs.pathExists(path);
        if (!coursePathExists) {
          // path does not exist, start with 'git clone'
          job.info('Clone from remote git repository');
          await job.exec('git', ['clone', '-b', branch, repository, path], {
            // Executed in the root directory, but this shouldn't really matter.
            cwd: '/',
            env: gitEnv,
          });
        } else {
          // path exists, update remote origin address, then 'git fetch' and reset to latest with 'git reset'

          startGitHash = (await selectCourseById(course.id)).commit_hash;

          job.info('Updating to latest remote origin address');
          await job.exec('git', ['remote', 'set-url', 'origin', repository], gitOptions);

          job.info('Fetch from remote git repository');
          await job.exec('git', ['fetch'], {
            ...gitOptions,
            // During GitHub incidents, fetches could take a long time. We use a
            // timeout to ensure that the sync won't hang indefinitely.
            //
            // Our editor code, which also interacts with GitHub, uses a shorter
            // timeout. This is important for editors, which typically complete
            // during the lifetime of a single request. We use a longer one here
            // to allow a full sync to be used as a backup method if a normal
            // fetch takes an inordinate amount of time. A full course sync occurs
            // in a server job in the background, so we don't have to worry about
            // serving 504 errors to clients from a long request.
            cancelSignal: AbortSignal.timeout(30_000),
          });

          job.info('Restore staged and unstaged changes');
          await job.exec('git', ['restore', '--staged', '--worktree', '.'], gitOptions);

          job.info('Clean local files not in remote git repository');
          await job.exec('git', ['clean', '-fdx'], gitOptions);

          job.info('Check out current branch');
          await job.exec('git', ['checkout', branch], gitOptions);

          job.info('Reset state to remote git repository');
          await job.exec('git', ['reset', '--hard', `origin/${branch}`], gitOptions);
        }

        job.info('Sync git repository to database');
        const syncResult = await syncCourseFromDisk({
          course,
          startGitHash,
          job,
          checkExternalDependencies: true,
        });
        if (syncResult.status === 'sharing_error') {
          if (startGitHash) {
            await job.exec('git', ['reset', '--hard', startGitHash], gitOptions);
          }
          job.fail('Sync completely failed due to invalid question sharing edit.');
          return;
        }

        if (syncResult.hadJsonErrors) {
          job.fail('One or more JSON files contained errors and were unable to be synced.');
        }
      },
    );
  });

  return { jobSequenceId: serverJob.jobSequenceId, jobPromise };
}

/**
 * Extracts the "owner/repo.git" suffix from a Git repository URL,
 * handling both SSH (git@github.com:Org/repo.git) and HTTPS
 * (https://github.com/Org/repo.git) formats.
 */
function extractRepoSuffix(repository: string): string | null {
  // SSH format: git@host:owner/repo.git
  const sshMatch = repository.match(/:([^/]+\/[^/]+\.git)$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://host/owner/repo.git
  const httpsMatch = repository.match(/\/([^/]+\/[^/]+\.git)$/);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

export async function checkCourseRepositoryUrlExists(repository: string, excludeCourseId?: string) {
  const suffix = extractRepoSuffix(repository);
  if (suffix == null) {
    // Fall back to exact match if we can't parse the URL.
    return await sqldb.queryScalar(
      sql.exists_by_course_repository,
      { repository, exclude_course_id: excludeCourseId ?? null },
      z.boolean(),
    );
  }

  // Escape SQL LIKE wildcards so they are matched literally.
  const escapedSuffix = suffix.replaceAll('%', '\\%').replaceAll('_', '\\_');
  return await sqldb.queryScalar(
    sql.exists_by_course_repository_suffix,
    { suffix: escapedSuffix, exclude_course_id: excludeCourseId ?? null },
    z.boolean(),
  );
}

export async function checkCoursePathExists(path: string, excludeCourseId?: string) {
  const result = await sqldb.queryScalar(
    sql.exists_by_course_path,
    { path, exclude_course_id: excludeCourseId ?? null },
    z.boolean(),
  );
  return result;
}
