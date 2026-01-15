import { type DescribeImagesCommandOutput, ECR } from '@aws-sdk/client-ecr';
import * as async from 'async';
import { Router } from 'express';
import z from 'zod';

import { DockerName } from '@prairielearn/docker-utils';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAwsClientConfig } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { pullAndUpdateCourse } from '../../lib/course.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import * as syncHelpers from '../shared/syncHelpers.js';

import { CourseSyncs, ImageRowSchema, JobSequenceRowSchema } from './courseSyncs.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

const DEFAULT_SYNC_LIMIT = 100;
const NO_LIMIT = 2147483647;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const showAll = 'all' in req.query;
    const limit = showAll ? NO_LIMIT : DEFAULT_SYNC_LIMIT;

    const jobSequences = await queryRows(
      sql.select_sync_job_sequences,
      { course_id: res.locals.course.id, limit },
      JobSequenceRowSchema,
    );

    const jobSequenceCount = await queryRow(
      sql.count_sync_job_sequences,
      { course_id: res.locals.course.id },
      z.number(),
    );

    const images = await queryRows(
      sql.question_images,
      { course_id: res.locals.course.id },
      ImageRowSchema,
    );

    if (config.cacheImageRegistry) {
      const ecr = new ECR(makeAwsClientConfig());
      await async.eachLimit(images, 3, async (image) => {
        const repository = new DockerName(image.image);
        image.tag = repository.getTag() || 'latest (implied)';
        // Default to get overwritten later
        image.pushed_at = null;
        image.imageSyncNeeded = false;
        image.invalid = false;

        let data: DescribeImagesCommandOutput;
        try {
          data = await ecr.describeImages({
            repositoryName: repository.getRepository(),
            imageIds: [{ imageTag: repository.getTag() ?? 'latest' }],
          });
        } catch (err: any) {
          if (err.name === 'InvalidParameterException') {
            image.invalid = true;
            return;
          } else if (
            err.name === 'RepositoryNotFoundException' ||
            err.name === 'ImageNotFoundException'
          ) {
            image.imageSyncNeeded = true;
            return;
          }
          throw err;
        }

        const ecrInfo = data.imageDetails?.[0];

        // Put info from ECR into image for rendering
        image.digest = ecrInfo?.imageDigest ?? '';
        image.pushed_at = ecrInfo?.imagePushedAt;
        image.imageSyncNeeded = image.pushed_at == null;
        image.size = ecrInfo?.imageSizeInBytes ?? 0;
      });
    }

    res.send(
      CourseSyncs({
        resLocals: res.locals,
        images,
        jobSequences,
        jobSequenceCount,
        showAllJobSequences: showAll,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (req.body.__action === 'pull') {
      const { jobSequenceId } = await pullAndUpdateCourse({
        course: res.locals.course,
        userId: res.locals.user.id,
        authnUserId: res.locals.authz_data.authn_user.id,
      });
      res.redirect(`${res.locals.urlPrefix}/jobSequence/${jobSequenceId}`);
    } else if (req.body.__action === 'status') {
      const jobSequenceId = await syncHelpers.gitStatus(res.locals);
      res.redirect(`${res.locals.urlPrefix}/jobSequence/${jobSequenceId}`);
    } else if (req.body.__action === 'syncImage') {
      const questionId = await queryOptionalRow(
        sql.check_question_with_image,
        { course_id: res.locals.course.id, image: req.body.single_image },
        IdSchema,
      );
      if (questionId == null) {
        throw new HttpStatusError(400, 'Image not found in any question for this course');
      }
      const jobSequenceId = await syncHelpers.ecrUpdate(
        [{ image: req.body.single_image }],
        res.locals,
      );
      res.redirect(`${res.locals.urlPrefix}/jobSequence/${jobSequenceId}`);
    } else if (req.body.__action === 'syncImages') {
      const images = await queryRows(
        sql.question_images,
        { course_id: res.locals.course.id },
        ImageRowSchema,
      );
      const jobSequenceId = await syncHelpers.ecrUpdate(images, res.locals);
      res.redirect(`${res.locals.urlPrefix}/jobSequence/${jobSequenceId}`);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
