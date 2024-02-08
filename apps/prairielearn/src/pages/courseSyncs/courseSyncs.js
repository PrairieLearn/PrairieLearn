// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const { ECR } = require('@aws-sdk/client-ecr');
const _ = require('lodash');
const async = require('async');
const { formatISO } = require('date-fns');
const express = require('express');
const sqldb = require('@prairielearn/postgres');
const { DockerName } = require('@prairielearn/docker-utils');
const error = require('@prairielearn/error');

const syncHelpers = require('../shared/syncHelpers');
const { makeAwsClientConfig } = require('../../lib/aws');
const { config } = require('../../lib/config');

const sql = sqldb.loadSqlEquiv(__filename);
const router = express.Router();

router.get('/', function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_edit) {
    return next(error.make(403, 'Access denied (must be course editor)'));
  }
  const params = { course_id: res.locals.course.id };
  sqldb.query(sql.select_sync_job_sequences, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.job_sequences = result.rows;

    sqldb.query(sql.question_images, params, (err, result) => {
      if (ERR(err, next)) return;
      res.locals.images = result.rows;
      res.locals.imageSyncNeeded = false;

      if (config.cacheImageRegistry) {
        const ecr = new ECR(makeAwsClientConfig());
        async.each(
          res.locals.images,
          (image, callback) => {
            var repository = new DockerName(image.image);
            image.tag = repository.getTag() || 'latest (implied)';
            // Default to get overwritten later
            image.pushed_at = null;
            image.imageSyncNeeded = false;
            image.invalid = false;
            var params = {
              repositoryName: repository.getRepository(),
            };
            ecr.describeImages(params, (err, data) => {
              if (err) {
                if (err.name === 'InvalidParameterException') {
                  image.invalid = true;
                  return callback(null);
                } else if (err.name === 'RepositoryNotFoundException') {
                  image.imageSyncNeeded = true;
                  return callback(null);
                } else if (ERR(err, callback)) {
                  return;
                }
              }
              res.locals.ecrInfo = {};
              data.imageDetails.forEach((imageDetails) => {
                if (imageDetails.imageTags) {
                  imageDetails.imageTags.forEach((tag) => {
                    res.locals.ecrInfo[imageDetails.repositoryName + ':' + tag] = imageDetails;
                  });
                }
              });

              // Put info from ECR into image for EJS
              var repoName = repository.getCombined(true);
              image.digest_full = _.get(res.locals.ecrInfo[repoName], 'imageDigest', '');
              image.digest = image.digest_full.substring(0, 24);
              if (image.digest !== image.digest_full) {
                image.digest += '...';
              }
              image.size =
                _.get(res.locals.ecrInfo[repoName], 'imageSizeInBytes', 0) / (1000 * 1000);
              var pushed_at = _.get(res.locals.ecrInfo[repoName], 'imagePushedAt', null);
              if (pushed_at) {
                image.pushed_at = formatISO(pushed_at);
              } else {
                res.locals.imageSyncNeeded = true;
                image.imageSyncNeeded = true;
              }
              callback(null);
            });
          },
          (err) => {
            if (ERR(err, next)) return;
            const params = {
              pushed_at_array: _.map(res.locals.images, 'pushed_at'),
              course_id: res.locals.course.id,
            };
            sqldb.query(sql.format_pushed_at, params, (err, result) => {
              if (ERR(err, next)) return;
              if (result.rowCount !== res.locals.images.length) {
                return next(new Error('pushed_at length mismatch'));
              }

              for (let i = 0; i < res.locals.images.length; i++) {
                res.locals.images[i].pushed_at_formatted = result.rows[i].pushed_at_formatted;
              }

              res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
          },
        );
      } else {
        //  no config.cacheImageRegistry
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      }
    });
  });
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw error.make(403, 'Access denied (must be course editor)');
    }

    if (req.body.__action === 'pull') {
      const jobSequenceId = await syncHelpers.pullAndUpdate(res.locals);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'status') {
      const jobSequenceId = await syncHelpers.gitStatus(res.locals);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'syncImages') {
      const result = await sqldb.queryAsync(sql.question_images, {
        course_id: res.locals.course.id,
      });
      let images = result.rows;
      if ('single_image' in req.body) {
        images = _.filter(result.rows, ['image', req.body.single_image]);
      }
      const jobSequenceId = await syncHelpers.ecrUpdate(images, res.locals);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

module.exports = router;
