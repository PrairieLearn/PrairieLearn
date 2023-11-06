import { z } from 'zod';
import { callbackify } from 'util';
import * as fs from 'fs-extra';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import { createServerJob } from './server-jobs';
import { config } from './config';
import * as chunks from './chunks';
import { syncDiskToSqlWithLock } from '../sync/syncFromDisk';
import { IdSchema } from './db-types';
import {
  getCommitHashAsync,
  getOrUpdateCourseCommitHashAsync,
  updateCourseCommitHashAsync,
} from './courseUtil';

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Check that an assessment_instance_id really belongs to the given course_instance_id
 *
 * @param assessment_instance_id - The assessment instance to check.
 * @param course_instance_id - The course instance it should belong to.
 */
export async function checkBelongsAsync(
  assessment_instance_id: string,
  course_instance_id: string,
): Promise<void> {
  if (
    sqldb.queryOptionalRow(
      sql.check_belongs,
      {
        assessment_instance_id,
        course_instance_id,
      },
      IdSchema,
    ) == null
  ) {
    throw new Error('access denied');
  }
}
export const checkBelongs = callbackify(checkBelongsAsync);

/**
 * Return the name and UID (email) for every owner of the specified course.
 *
 * @param {string} course_id The ID of the course.
 * @returns {Promise<{ uid: string, name?: string }[]>}
 */
export async function getCourseOwners(
  course_id: string,
): Promise<{ uid: string; name?: string }[]> {
  const { rows } = await sqldb.queryAsync(sql.select_owners, { course_id });
  return rows.map((row) => ({
    uid: row.uid,
    name: row.name,
  }));
}

export function getLockNameForCoursePath(coursePath) {
  return `coursedir:${coursePath}`;
}

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
        const syncResult = await syncDiskToSqlWithLock(path, courseId, job);

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
