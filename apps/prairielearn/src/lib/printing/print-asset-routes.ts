import { type Express, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
import { selectAssessmentById } from '../../models/assessment.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import clientFilesAssessment from '../../pages/clientFilesAssessment/clientFilesAssessment.js';
import clientFilesCourse from '../../pages/clientFilesCourse/clientFilesCourse.js';
import clientFilesCourseInstance from '../../pages/clientFilesCourseInstance/clientFilesCourseInstance.js';
import clientFilesQuestion from '../../pages/clientFilesQuestion/clientFilesQuestion.js';
import elementExtensionFiles from '../../pages/elementExtensionFiles/elementExtensionFiles.js';
import elementFiles from '../../pages/elementFiles/elementFiles.js';
import { config } from '../config.js';
import { InstanceQuestionSchema, QuestionSchema, VariantSchema } from '../db-types.js';
import { features } from '../features/index.js';
import { idsEqual } from '../id.js';
import { getDynamicFile } from '../question-variant.js';

import {
  PRINT_ASSET_TOKEN_HEADER,
  checkPrintAssetAccess,
  classifyPrintAssetPath,
} from './print-asset-access.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const PrintInstanceQuestionSchema = z.object({
  instance_question: InstanceQuestionSchema,
  question: QuestionSchema,
});
const PrintVariantSchema = z.object({ variant: VariantSchema });

export function applyPrintAssetRoutes(app: Express): void {
  const router = Router();
  router.use(
    asyncHandler(async (req, res, next) => {
      const token = req.get(PRINT_ASSET_TOKEN_HEADER);
      if (!token) return next('router');
      if (req.method !== 'GET') throw new HttpStatusError(403, 'Print asset access denied');
      const scope = checkPrintAssetAccess(token, config.secretKey);
      const route = scope && classifyPrintAssetPath(req.path, scope, config.assetsPrefix);
      if (!scope || !route) throw new HttpStatusError(403, 'Print asset access denied');
      if (route.type === 'public') {
        if (req.path.startsWith('/pl/static/elements/')) return next();
        return next('router');
      }

      const assessmentInstance = await selectAssessmentInstanceById(scope.assessmentInstanceId);
      const assessment = await selectAssessmentById(scope.assessmentId);
      const courseInstance = await selectCourseInstanceById(scope.courseInstanceId);
      if (
        !idsEqual(assessmentInstance.assessment_id, assessment.id) ||
        !idsEqual(assessment.course_instance_id, courseInstance.id)
      ) {
        throw new HttpStatusError(403, 'Print asset access denied');
      }
      const course = await selectCourseById(courseInstance.course_id);
      if (
        !(await features.enabled('printable-exams', {
          institution_id: course.institution_id,
          course_id: course.id,
          course_instance_id: courseInstance.id,
          user_id: scope.authnUserId,
        }))
      ) {
        throw new HttpStatusError(403, 'Print asset access denied');
      }
      res.locals.course = course;
      res.locals.course_instance = courseInstance;
      res.locals.assessment = assessment;
      res.locals.assessment_instance = assessmentInstance;

      if (route.type === 'question') {
        const row = await sqldb.queryOptionalRow(
          sql.select_print_instance_question,
          {
            instance_question_id: route.instanceQuestionId,
            assessment_instance_id: scope.assessmentInstanceId,
            assessment_id: scope.assessmentId,
          },
          PrintInstanceQuestionSchema,
        );
        if (!row) throw new HttpStatusError(403, 'Print asset access denied');
        res.locals.instance_question = row.instance_question;
        res.locals.question = row.question;
      }

      res.setHeader('Cache-Control', 'private, no-store');
      res.locals.printAssetScope = scope;
      next();
    }),
  );

  const instructor = '/pl/course_instance/:course_instance_id(\\d+)/instructor';
  const assessment = `${instructor}/assessment/:assessment_id(\\d+)`;
  const question = `${instructor}/instance_question/:instance_question_id(\\d+)`;

  router.use(`${assessment}/clientFilesAssessment`, clientFilesAssessment);
  router.use(`${assessment}/clientFilesCourse`, clientFilesCourse);
  router.use(`${assessment}/clientFilesCourseInstance`, clientFilesCourseInstance);
  router.use(`${instructor}/clientFilesCourse`, clientFilesCourse);
  router.use(`${instructor}/clientFilesCourseInstance`, clientFilesCourseInstance);
  router.use(`${question}/clientFilesCourse`, clientFilesCourse);
  router.use(`${question}/clientFilesQuestion`, clientFilesQuestion());

  const generatedFiles = Router({ mergeParams: true });
  generatedFiles.get(
    '/variant/:variant_id(\\d+)/*',
    asyncHandler(async (req, res) => {
      const scope = res.locals.printAssetScope;
      const row = await sqldb.queryOptionalRow(
        sql.select_print_variant,
        {
          variant_id: req.params.variant_id,
          instance_question_id: res.locals.instance_question.id,
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        },
        PrintVariantSchema,
      );
      if (!row) throw new HttpStatusError(403, 'Print asset access denied');
      const filename = req.params[0];
      const contents = await getDynamicFile({
        filename,
        variant: row.variant,
        submission: null,
        question: res.locals.question,
        variant_course: res.locals.course,
        user_id: scope.userId,
        authn_user_id: scope.authnUserId,
      });
      res.attachment(filename);
      res.send(contents);
    }),
  );
  router.use(`${question}/generatedFilesQuestion`, generatedFiles);

  router.use(
    '/pl/static/elements',
    elementFiles({ publicQuestionEndpoint: false, coreElements: true }),
  );
  router.use(
    `${instructor}/sharedElements/course/:producing_course_id(\\d+)/cacheableElements/:cachebuster`,
    elementFiles(),
  );
  router.use(
    `${instructor}/sharedElements/course/:producing_course_id(\\d+)/elements`,
    elementFiles(),
  );
  router.use(`${instructor}/cacheableElements/:cachebuster`, elementFiles());
  router.use(`${instructor}/elements`, elementFiles());
  router.use(`${instructor}/cacheableElementExtensions/:cachebuster`, elementExtensionFiles);
  router.use(`${instructor}/elementExtensions`, elementExtensionFiles);

  router.use((_req, _res, next) => next(new HttpStatusError(403, 'Print asset access denied')));
  app.use(router);
}
