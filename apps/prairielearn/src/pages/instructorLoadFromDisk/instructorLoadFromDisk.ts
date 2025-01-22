import * as path from 'path';

import * as async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { chalk } from '../../lib/chalk.js';
import { updateChunksForCourse, logChunkChangesToJob } from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { CourseSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as syncFromDisk from '../../sync/syncFromDisk.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

async function update(locals: Record<string, any>) {
  const serverJob = await createServerJob({
    courseId: locals.course ? locals.course.id : null,
    type: 'loadFromDisk',
    description: 'Load data from local disk',
  });

  serverJob.executeInBackground(async (job) => {
    let anyCourseHadJsonErrors = false;

    // Merge the list of courses in the config with the list of courses in the database.
    // We use a set to ensure that we don't double-count courses that are both
    // in the config and in the database.
    //
    // A set also maintains insertion order, which ensures that courses that are
    // listed in the config (and listed earlier in the config) are synced first.
    const courseDirs = new Set<string>(config.courseDirs);
    const courses = await queryRows(sql.select_all_courses, CourseSchema);
    courses.forEach((course) => courseDirs.add(course.path));

    await async.eachOfSeries(Array.from(courseDirs), async (courseDir, index) => {
      courseDir = path.resolve(REPOSITORY_ROOT_PATH, courseDir);
      job.info(chalk.bold(courseDir));
      const infoCourseFile = path.join(courseDir, 'infoCourse.json');
      const hasInfoCourseFile = await fs.pathExists(infoCourseFile);
      if (!hasInfoCourseFile) {
        job.verbose('infoCourse.json not found, skipping');
        if (index !== config.courseDirs.length - 1) job.info('');
        return;
      }
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(courseDir, job);
      if (syncResult.status === 'sharing_error') {
        job.fail('Sync completely failed due to invalid question sharing edit.');
        return;
      }
      if (index !== config.courseDirs.length - 1) job.info('');
      if (syncResult.hadJsonErrors) anyCourseHadJsonErrors = true;
      if (config.chunksGenerator) {
        const chunkChanges = await updateChunksForCourse({
          coursePath: courseDir,
          courseId: syncResult.courseId,
          courseData: syncResult.courseData,
          oldHash: 'HEAD~1',
          newHash: 'HEAD',
        });
        logChunkChangesToJob(chunkChanges, job);
      }
    });

    if (anyCourseHadJsonErrors) {
      throw new Error(
        'One or more courses had JSON files that contained errors and were unable to be synced',
      );
    }
  });

  return serverJob.jobSequenceId;
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!config.devMode) return next();
    const jobSequenceId = await update(res.locals);
    res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
  }),
);

export default router;
