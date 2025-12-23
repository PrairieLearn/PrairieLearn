import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import {
  CourseInstanceSchema,
  CourseSchema,
  InstitutionSchema,
  type User,
} from '../../lib/db-types.js';
import { type FeatureName, features } from '../../lib/features/index.js';
import { selectOptionalUserByUid } from '../../models/user.js';

import {
  AddFeatureGrantModalBody,
  AdministratorFeature,
  AdministratorFeatures,
  FeatureGrantRowSchema,
} from './administratorFeatures.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function validateFeature(feature: string): FeatureName {
  if (!features.hasFeature(feature)) {
    throw new error.HttpStatusError(404, `Unknown feature: ${feature}`);
  }
  return feature;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      AdministratorFeatures({
        features: features.allFeatures().sort(),
        resLocals: res.locals,
      }),
    );
  }),
);

router.get(
  '/:feature',
  asyncHandler(async (req, res) => {
    const feature = validateFeature(req.params.feature);

    const featureGrants = await queryRows(
      sql.select_feature_grants,
      { name: feature },
      FeatureGrantRowSchema,
    );
    const institutions = await queryRows(sql.select_institutions, InstitutionSchema);

    res.send(
      AdministratorFeature({
        feature: req.params.feature,
        featureGrants,
        institutions,
        featureInConfig: config.features[req.params.feature] ?? null,
        resLocals: res.locals,
      }),
    );
  }),
);

const OptionalIdSchema = z
  .union([z.literal(''), IdSchema])
  .optional()
  .transform((val) => val || undefined);

const AddFeatureGrantModalParamsSchema = z.object({
  enabled: z.union([z.literal('true'), z.literal('false')]).transform((val) => val === 'true'),
  institution_id: OptionalIdSchema,
  course_id: OptionalIdSchema,
  course_instance_id: OptionalIdSchema,
  user_uid: z
    .string()
    .optional()
    .transform((val) => val?.trim()),
});
type AddFeatureGrantModalParams = z.infer<typeof AddFeatureGrantModalParamsSchema>;

async function getEntitiesFromParams(params: AddFeatureGrantModalParams) {
  const institutions = await queryRows(sql.select_institutions, InstitutionSchema);
  const courses = params.institution_id
    ? await queryRows(
        sql.select_courses_for_institution,
        { institution_id: params.institution_id },
        CourseSchema,
      )
    : [];
  const course_instances = params.course_id
    ? await queryRows(
        sql.select_course_instances_for_course,
        { course_id: params.course_id },
        CourseInstanceSchema,
      )
    : [];

  const institution = institutions.find((inst) => inst.id === params.institution_id);
  let course = courses.find((course) => course.id === params.course_id);
  let course_instance = course_instances.find((ci) => ci.id === params.course_instance_id);

  // Ensure consistency: if a selected entity isn't present in the parent,
  // reset it to null.
  const institutionHasCourse = courses.some((course) => course.id === params.course_id);
  const courseHasCourseInstance = course_instances.some(
    (ci) => ci.id === params.course_instance_id,
  );

  if (!institutionHasCourse) {
    course = undefined;
    course_instance = undefined;
  }

  if (!institutionHasCourse || !courseHasCourseInstance) {
    course_instance = undefined;
  }

  let user: User | null = null;
  if (params.user_uid) {
    user = await selectOptionalUserByUid(params.user_uid);
    if (!user) {
      throw new error.HttpStatusError(400, `User not found: ${params.user_uid}`);
    }
  }

  return { institutions, institution, courses, course, course_instances, course_instance, user };
}

router.get(
  '/:feature/modal',
  asyncHandler(async (req, res) => {
    const feature = validateFeature(req.params.feature);

    const query = AddFeatureGrantModalParamsSchema.parse(req.query);
    const { institutions, institution, courses, course, course_instances, course_instance } =
      await getEntitiesFromParams(query);

    res.send(
      AddFeatureGrantModalBody({
        feature,
        enabled: query.enabled,
        institutions,
        institution_id: institution?.id,
        courses,
        course_id: course?.id,
        course_instances,
        course_instance_id: course_instance?.id,
      }).toString(),
    );
  }),
);

router.post(
  '/:feature',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_feature_grant') {
      const feature = validateFeature(req.params.feature);

      const params = AddFeatureGrantModalParamsSchema.parse(req.body);
      const { institution, course, course_instance, user } = await getEntitiesFromParams(params);

      const context = features.validateContext({
        institution_id: institution?.id ?? null,
        course_id: course?.id ?? null,
        course_instance_id: course_instance?.id ?? null,
        user_id: user?.user_id ?? null,
      });

      if (params.enabled) {
        await features.enable(feature, context);
      } else {
        await features.disable(feature, context);
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_feature_grant_enabled') {
      const enabled = z
        .union([z.literal('enabled'), z.literal('disabled')])
        .transform((val) => val === 'enabled')
        .parse(req.body.feature_grant_enabled);

      await execute(sql.update_feature_grant_enabled, {
        id: IdSchema.parse(req.body.feature_grant_id),
        enabled,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'revoke_feature_grant') {
      await execute(sql.delete_feature_grant, { id: IdSchema.parse(req.body.feature_grant_id) });
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
