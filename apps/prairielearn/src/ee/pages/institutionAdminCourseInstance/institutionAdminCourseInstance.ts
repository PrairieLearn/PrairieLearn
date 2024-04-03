import { Router } from 'express';
import { z } from 'zod';
import asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';

import { getInstitution } from '../../lib/institution';
import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types';
import { InstitutionAdminCourseInstance } from './institutionAdminCourseInstance.html';
import {
  getPlanGrantsForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
} from '../../lib/billing/plans';
import { parseDesiredPlanGrants } from '../../lib/billing/components/PlanGrantsEditor.html';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

async function selectCourseInstanceAndCourseInInstitution({
  institution_id,
  unsafe_course_id,
  unsafe_course_instance_id,
}: {
  institution_id: string;
  unsafe_course_id: string;
  unsafe_course_instance_id: string;
}) {
  return await queryRow(
    sql.select_course_and_instance,
    {
      institution_id,
      course_id: unsafe_course_id,
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
      unsafe_course_id: req.params.course_id,
      unsafe_course_instance_id: req.params.course_instance_id,
    });
    const planGrants = await getPlanGrantsForCourseInstance({
      institution_id: institution.id,
      course_instance_id: course_instance.id,
    });
    res.send(
      InstitutionAdminCourseInstance({
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
      unsafe_course_id: req.params.course_id,
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
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
