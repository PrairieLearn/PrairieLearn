// @ts-check
var ERR = require('async-stacktrace');
var async = require('async');
var fs = require('fs');
var path = require('path');
var util = require('util');
var express = require('express');
var router = express.Router();
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { config } = require('../../lib/config');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');
var chunks = require('../../lib/chunks');
const { chalk, chalkDim } = require('../../lib/chalk');

var update = function (locals, callback) {
  debug('update()');
  var options = {
    course_id: locals.course ? locals.course.id : null,
    type: 'loadFromDisk',
    description: 'Load data from local disk',
  };
  serverJobs.createJobSequence(options, function (err, job_sequence_id) {
    if (ERR(err, callback)) return;

    var jobOptions = {
      course_id: locals.course ? locals.course.id : null,
      type: 'load_from_disk',
      description: 'Load configuration from disk',
      job_sequence_id: job_sequence_id,
      last_in_sequence: true,
    };
    serverJobs.createJob(jobOptions, function (err, job) {
      if (ERR(err, callback)) return;
      debug('successfully created job', { job_sequence_id });
      callback(null, job_sequence_id);

      let anyCourseHadJsonErrors = false;

      // continue executing here to launch the actual job
      debug('loading', { courseDirs: config.courseDirs });
      async.eachOfSeries(
        config.courseDirs || [],
        function (courseDir, index, callback) {
          courseDir = path.resolve(process.cwd(), courseDir);
          debug('loading course', { courseDir });
          job.info(chalk.bold(courseDir));
          var infoCourseFile = path.join(courseDir, 'infoCourse.json');
          fs.access(infoCourseFile, function (err) {
            if (err) {
              job.info(chalkDim(`infoCourse.json not found, skipping`));
              if (index !== config.courseDirs.length - 1) job.info('');
              callback(null);
            } else {
              syncFromDisk.syncOrCreateDiskToSql(courseDir, job, function (err, result) {
                if (index !== config.courseDirs.length - 1) job.info('');
                if (ERR(err, callback)) return;
                if (!result) throw new Error('syncOrCreateDiskToSql() returned null');
                if (result.hadJsonErrors) anyCourseHadJsonErrors = true;
                debug('successfully loaded course', { courseDir });
                if (config.chunksGenerator) {
                  util.callbackify(chunks.updateChunksForCourse)(
                    {
                      coursePath: courseDir,
                      courseId: result.courseId,
                      courseData: result.courseData,
                      oldHash: 'HEAD~1',
                      newHash: 'HEAD',
                    },
                    (err, chunkChanges) => {
                      if (ERR(err, callback)) return;
                      chunks.logChunkChangesToJob(chunkChanges, job);
                      callback(null);
                    }
                  );
                } else {
                  callback(null);
                }
              });
            }
          });
        },
        function (err) {
          if (err) {
            job.fail(err);
          } else if (anyCourseHadJsonErrors) {
            job.fail(
              'One or more courses had JSON files that contained errors and were unable to be synced'
            );
          } else {
            job.succeed();
          }
        }
      );
    });
  });
};

router.get('/', function (req, res, next) {
  if (!res.locals.devMode) return next();
  update(res.locals, function (err, job_sequence_id) {
    if (ERR(err, next)) return;
    res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
  });
});

module.exports = router;
