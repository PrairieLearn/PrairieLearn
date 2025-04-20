import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';

import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types.js';
import { parseDesiredPlanGrants } from '../../lib/billing/components/PlanGrantsEditor.html.js';
import {
  getPlanGrantsForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
} from '../../lib/billing/plans.js';
import { getInstitution } from '../../lib/institution.js';

import { AdministratorInstitutionCourseInstance } from './administratorInstitutionCourseInstance.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

async function selectCourseInstanceAndCourseInInstitution({
  institution_id,
  unsafe_course_instance_id,
}: {
  institution_id: string;
  unsafe_course_instance_id: string;
}) {
  return await queryRow(
    sql.select_course_and_instance,
    {
      institution_id,
      course_instance_id: unsafe_course_instance_id,
    },
    z.object({
      course: CourseSchema,
      course_instance: CourseInstanceSchema,
    }),
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const { course, course_instance } = await selectCourseInstanceAndCourseInInstitution({
      institution_id: req.params.institution_id,
      unsafe_course_instance_id: req.params.course_instance_id,
    });
    const planGrants = await getPlanGrantsForCourseInstance({
      institution_id: institution.id,
      course_instance_id: course_instance.id,
    });
    res.send(
      AdministratorInstitutionCourseInstance({
        institution,
        course,
        course_instance,
        planGrants,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { course_instance } = await selectCourseInstanceAndCourseInInstitution({
      institution_id: req.params.institution_id,
      unsafe_course_instance_id: req.params.course_instance_id,
    });

    if (req.body.__action === 'update_enrollment_limit') {
      await queryAsync(sql.update_enrollment_limit, {
        course_instance_id: course_instance.id,
        enrollment_limit: req.body.enrollment_limit || null,
      });
      flash('success', 'Successfully updated enrollment limit.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_plans') {
      const desiredPlans = parseDesiredPlanGrants({
        body: req.body,
        // We exclude `basic` from the list of allowed plans because it should
        // only ever be used for student billing for enrollments.
        allowedPlans: ['compute', 'everything'],
      });
      await reconcilePlanGrantsForCourseInstance(
        course_instance.id,
        desiredPlans,
        res.locals.authn_user.user_id,
      );
      flash('success', 'Successfully updated institution plan grants.');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
