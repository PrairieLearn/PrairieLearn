// @ts-check
const asyncHandler = require('express-async-handler');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const router = express.Router();

const { config } = require('../../lib/config');
const { createServerJob } = require('../../lib/server-jobs');
const syncFromDisk = require('../../sync/syncFromDisk');
const chunks = require('../../lib/chunks');
const { chalk } = require('../../lib/chalk');
const { REPOSITORY_ROOT_PATH } = require('../../lib/paths');

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
      const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(courseDir, job);
      if (index !== config.courseDirs.length - 1) job.info('');
      if (!result) throw new Error('syncOrCreateDiskToSqlAsync() returned null');
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

module.exports = router;
