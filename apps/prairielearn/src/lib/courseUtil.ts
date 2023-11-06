import { exec } from 'child_process';
import { callbackify, promisify } from 'util';
import { z } from 'zod';
import * as fs from 'fs-extra';

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import * as namedLocks from '@prairielearn/named-locks';

import { createServerJob } from './server-jobs';
import { config } from './config';
import { getLockNameForCoursePath } from './course';
import * as chunks from './chunks';
import * as syncFromDisk from '../sync/syncFromDisk';

const sql = sqldb.loadSqlEquiv(__filename);

export async function getCommitHashAsync(coursePath: string): Promise<string> {
  try {
    const { stdout } = await promisify(exec)('git rev-parse HEAD', {
      cwd: coursePath,
      env: process.env,
    });
    return stdout.trim();
  } catch (err) {
    throw error.makeWithData(`Could not get git status; exited with code ${err.code}`, {
      stdout: err.stdout,
      stderr: err.stderr,
    });
  }
}
export const getCommitHash = callbackify(getCommitHashAsync);

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 */
export async function updateCourseCommitHashAsync(course: {
  id: string;
  path: string;
}): Promise<string> {
  const hash = await getCommitHashAsync(course.path);
  await sqldb.queryAsync(sql.update_course_commit_hash, {
    course_id: course.id,
    commit_hash: hash,
  });
  return hash;
}
export const updateCourseCommitHash = callbackify(updateCourseCommitHashAsync);

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 */
export async function getOrUpdateCourseCommitHashAsync(course: {
  id: string;
  path: string;
  commit_hash?: string | null;
}): Promise<string> {
  return course.commit_hash ?? (await updateCourseCommitHashAsync(course));
}
export const getOrUpdateCourseCommitHash = callbackify(getOrUpdateCourseCommitHashAsync);

const CourseDataSchema = z.object({
  path: z.string().nullable(),
  branch: z.string().nullable(),
  repository: z.string().nullable(),
  commit_hash: z.string().nullable(),
});

export async function pullAndUpdate({
  courseId,
  userId,
  authnUserId,
  path,
  branch,
  repository,
  commit_hash,
}: {
  courseId: string;
  userId: string;
  authnUserId: string;
  path?: string | null;
  branch?: string | null;
  repository?: string | null;
  commit_hash?: string | null;
}): Promise<{ jobSequenceId: string; jobPromise: Promise<void> }> {
  const serverJob = await createServerJob({
    courseId,
    userId,
    authnUserId,
    type: 'sync',
    description: 'Pull from remote git repository',
  });

  const gitEnv = process.env;
  if (config.gitSshCommand != null) {
    gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
  }

  const jobPromise = serverJob.execute(async (job) => {
    const lockName = getLockNameForCoursePath(path);
    await namedLocks.tryWithLock(
      lockName,
      {
        timeout: 5000,
        onNotAcquired: () => {
          job.fail('Another user is already syncing or modifying this course.');
        },
      },
      async () => {
        if (path === undefined || branch === undefined || repository === undefined) {
          const course_data = await sqldb.queryRow(
            sql.get_course_data,
            { course_id: courseId },
            CourseDataSchema,
          );
          path = course_data.path;
          branch = course_data.branch;
          repository = course_data.repository;
          commit_hash = course_data.commit_hash;
        }
        if (!path) {
          job.fail('Path is not set for this course. Exiting...');
          return;
        }
        if (!branch || !repository) {
          job.fail('Git repository or branch are not set for this course. Exiting...');
          return;
        }

        let startGitHash: string | null = null;
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

          startGitHash = await getOrUpdateCourseCommitHashAsync({
            id: courseId,
            path,
            commit_hash,
          });
          const gitOptions = { cwd: path, env: gitEnv };

          job.info('Updating to latest remote origin address');
          await job.exec('git', ['remote', 'set-url', 'origin', repository], gitOptions);

          job.info('Fetch from remote git repository');
          await job.exec('git', ['fetch'], gitOptions);

          job.info('Clean local files not in remote git repository');
          await job.exec('git', ['clean', '-fdx'], gitOptions);

          job.info('Reset state to remote git repository');
          await job.exec('git', ['reset', '--hard', `origin/${branch}`], gitOptions);
        }

        // After either cloning or fetching and resetting from Git, we'll load the
        // current commit hash. Note that we don't commit this to the database until
        // after we've synced the changes to the database and generated chunks. This
        // ensures that if the sync fails, we'll sync from the same starting commit
        // hash next time.
        const endGitHash = await getCommitHashAsync(path);

        job.info('Sync git repository to database');
        const syncResult = await syncFromDisk.syncDiskToSqlWithLock(path, courseId, job);

        if (config.chunksGenerator) {
          const chunkChanges = await chunks.updateChunksForCourse({
            coursePath: path,
            courseId,
            courseData: syncResult.courseData,
            oldHash: startGitHash,
            newHash: endGitHash,
          });
          chunks.logChunkChangesToJob(chunkChanges, job);
        }

        await updateCourseCommitHashAsync({ id: courseId, path });

        if (syncResult.hadJsonErrors) {
          job.fail('One or more JSON files contained errors and were unable to be synced.');
        }
      },
    );
  });

  return { jobSequenceId: serverJob.jobSequenceId, jobPromise };
}
