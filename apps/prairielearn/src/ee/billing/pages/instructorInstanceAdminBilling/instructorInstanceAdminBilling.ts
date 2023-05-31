import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import { InstructorCourseInstanceBilling } from './instructorInstanceAdminBilling.html';
import {
  PlanName,
  getFeaturesForPlans,
  getPlanGrantsForCourseInstance,
  getPlanGrantsForInstitution,
  getRequiredPlansForCourseInstance,
  updateRequiredPlansForCourseInstance,
} from '../../plans';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);
console.log(sql);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) {
      throw error.make(404, 'Not Found');
    }

    // TODO: limit access to course owners.
    console.log('course_instance', res.locals.course_instance);

    const institutionPlanGrants = await getPlanGrantsForInstitution(res.locals.institution.id);
    const courseInstancePlanGrants = await getPlanGrantsForCourseInstance(
      res.locals.course_instance.id
    );
    const planGrantFeatures = getFeaturesForPlans(
      institutionPlanGrants.concat(courseInstancePlanGrants)
    );
    console.log(planGrantFeatures);
    const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
    const studentBillingEnabled = requiredPlans.includes('basic');

    const enrollmentCount = await queryRow(
      sql.course_instance_enrollment_count,
      { course_instance_id: res.locals.course_instance.id },
      z.number()
    );
    const enrollmentLimit =
      res.locals.course_instance.enrollment_limit ??
      res.locals.institution.course_instance_enrollment_limit;
    const enrollmentLimitSource = res.locals.course_instance.enrollment_limit
      ? 'course_instance'
      : 'institution';

    res.send(
      InstructorCourseInstanceBilling({
        studentBillingEnabled,
        enrollmentCount,
        enrollmentLimit,
        enrollmentLimitSource,
        resLocals: res.locals,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const plans: PlanName[] = [];

    if (req.body.student_billing_enabled === '1') {
      plans.push('basic');
    }

    console.log('setting plans', plans);
    await updateRequiredPlansForCourseInstance(res.locals.course_instance.id, plans);

    console.log('req.body', req.body);
    res.redirect(req.originalUrl);
  })
);

export default router;
