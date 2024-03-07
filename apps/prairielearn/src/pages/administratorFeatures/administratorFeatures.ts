import asyncHandler = require('express-async-handler');
import { Router } from 'express';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { z } from 'zod';

import { FeatureName, features } from '../../lib/features';
import { config } from '../../lib/config';
import {
  AdministratorFeatures,
  AdministratorFeature,
  FeatureGrantRowSchema,
  AddFeatureGrantModalBody,
} from './administratorFeatures.html';
import {
  CourseInstanceSchema,
  CourseSchema,
  IdSchema,
  InstitutionSchema,
} from '../../lib/db-types';

const router = Router();
const sql = loadSqlEquiv(__filename);

function validateFeature(feature: string): FeatureName {
  if (!features.hasFeature(feature)) {
    throw error.make(404, `Unknown feature: ${feature}`);
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
    const institutions = await queryRows(sql.select_institutions, {}, InstitutionSchema);

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
  institution_id: OptionalIdSchema,
  course_id: OptionalIdSchema,
  course_instance_id: OptionalIdSchema,
});
type AddFeatureGrantModalParams = z.infer<typeof AddFeatureGrantModalParamsSchema>;

async function getEntitiesFromParams(params: AddFeatureGrantModalParams) {
  const institutions = await queryRows(sql.select_institutions, {}, InstitutionSchema);
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

  return { institutions, institution, courses, course, course_instances, course_instance };
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
    const feature = validateFeature(req.params.feature);

    const params = AddFeatureGrantModalParamsSchema.parse(req.body);
    const { institution, course, course_instance } = await getEntitiesFromParams(params);

    await features.enable(
      feature,
      features.validateContext({
        institution_id: institution?.id ?? null,
        course_id: course?.id ?? null,
        course_instance_id: course_instance?.id ?? null,
      }),
    );

    res.redirect(req.originalUrl);
  }),
);

export default router;
