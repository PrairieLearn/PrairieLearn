// @ts-check
import asyncHandler from 'express-async-handler';
import _ from 'lodash';
import { ECR } from '@aws-sdk/client-ecr';
import * as async from 'async';
import { formatISO } from 'date-fns';
import { Router } from 'express';
import * as sqldb from '@prairielearn/postgres';
import { DockerName } from '@prairielearn/docker-utils';

import * as syncHelpers from '../shared/syncHelpers.js';
import { makeAwsClientConfig } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { HttpStatusError } from '@prairielearn/error';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const jobSequencesResult = await sqldb.queryAsync(sql.select_sync_job_sequences, {
      course_id: res.locals.course.id,
    });
    res.locals.job_sequences = jobSequencesResult.rows;

    const result = await sqldb.queryAsync(sql.question_images, {
      course_id: res.locals.course.id,
    });
    res.locals.images = result.rows;
    res.locals.imageSyncNeeded = false;

    if (config.cacheImageRegistry) {
      const ecr = new ECR(makeAwsClientConfig());
      await async.each(res.locals.images, async (image) => {
        var repository = new DockerName(image.image);
        image.tag = repository.getTag() || 'latest (implied)';
        // Default to get overwritten later
        image.pushed_at = null;
        image.imageSyncNeeded = false;
        image.invalid = false;

        let data;
        try {
          data = await ecr.describeImages({
            repositoryName: repository.getRepository(),
          });
        } catch (err) {
          if (err.name === 'InvalidParameterException') {
            image.invalid = true;
            return null;
          } else if (err.name === 'RepositoryNotFoundException') {
            image.imageSyncNeeded = true;
            return null;
          }
          throw err;
        }

        const ecrInfo = {};
        data.imageDetails?.forEach((imageDetails) => {
          if (imageDetails.imageTags) {
            imageDetails.imageTags.forEach((tag) => {
              ecrInfo[imageDetails.repositoryName + ':' + tag] = imageDetails;
            });
          }
        });

        // Put info from ECR into image for EJS
        var repoName = repository.getCombined(true);
        image.digest_full = ecrInfo[repoName]?.imageDigest ?? '';
        image.digest = image.digest_full.substring(0, 24);
        if (image.digest !== image.digest_full) {
          image.digest += '...';
        }
        image.size = (ecrInfo[repoName]?.imageSizeInBytes ?? 0) / (1000 * 1000);
        const pushed_at = ecrInfo[repoName]?.imagePushedAt;
        if (pushed_at) {
          image.pushed_at = formatISO(pushed_at);
        } else {
          res.locals.imageSyncNeeded = true;
          image.imageSyncNeeded = true;
        }
      });

      // TODO: format with JavaScript instead of SQL
      const result = await sqldb.queryAsync(sql.format_pushed_at, {
        pushed_at_array: res.locals.images.map((i) => i.pushed_at),
        course_id: res.locals.course.id,
      });
      if (result.rowCount !== res.locals.images.length) {
        throw new Error('pushed_at length mismatch');
      }

      for (let i = 0; i < res.locals.images.length; i++) {
        res.locals.images[i].pushed_at_formatted = result.rows[i].pushed_at_formatted;
      }
    }

    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
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
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
