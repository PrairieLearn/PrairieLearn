// @ts-check
const asyncHandler = require('express-async-handler');
import * as async from 'async';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as express from 'express';

import { config } from '../../lib/config';
import { createServerJob } from '../../lib/server-jobs';
import * as syncFromDisk from '../../sync/syncFromDisk';
import * as chunks from '../../lib/chunks';
import { chalk } from '../../lib/chalk';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths';

const router = express.Router();

async function update(locals) {
  const serverJob = await createServerJob({
    courseId: locals.course ? locals.course.id : null,
    type: 'loadFromDisk',
    description: 'Load data from local disk',
  });

  serverJob.executeInBackground(async (job) => {
    let anyCourseHadJsonErrors = false;
    await async.eachOfSeries(config.courseDirs || [], async (courseDir, index) => {
      courseDir = path.resolve(REPOSITORY_ROOT_PATH, courseDir);
      job.info(chalk.bold(courseDir));
      var infoCourseFile = path.join(courseDir, 'infoCourse.json');
      const hasInfoCourseFile = await fs.pathExists(infoCourseFile);
      if (!hasInfoCourseFile) {
        job.verbose('infoCourse.json not found, skipping');
        if (index !== config.courseDirs.length - 1) job.info('');
        return;
      }
      const result = await syncFromDisk.syncOrCreateDiskToSql(courseDir, job);
      if (index !== config.courseDirs.length - 1) job.info('');
      if (!result) throw new Error('syncOrCreateDiskToSql() returned null');
      if (result.hadJsonErrors) anyCourseHadJsonErrors = true;
      if (config.chunksGenerator) {
        const chunkChanges = await chunks.updateChunksForCourse({
          coursePath: courseDir,
          courseId: result.courseId,
          courseData: result.courseData,
          oldHash: 'HEAD~1',
          newHash: 'HEAD',
        });
        chunks.logChunkChangesToJob(chunkChanges, job);
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
    if (!res.locals.devMode) return next();
    const jobSequenceId = await update(res.locals);
    res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
  }),
);

export default router;
