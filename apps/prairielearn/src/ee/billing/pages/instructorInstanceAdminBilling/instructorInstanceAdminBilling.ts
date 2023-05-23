import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import { InstructorCourseInstanceBilling } from './instructorInstanceAdminBilling.html';
import { PLAN_FEATURE_NAMES, getFeaturesForPlans, getPlanGrantsForInstitution } from '../../plans';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) return;

    // TODO: limit access to course owners.

    console.log('course_instance', res.locals.course_instance);

    const planGrants = await getPlanGrantsForInstitution(res.locals.institution.id);
    const planGrantFeatures = getFeaturesForPlans(planGrants);
    // const hasFeaturesNotGrantedByInstitution = PLAN_FEATURE_NAMES.some(
    //   (name) => !planGrantFeatures.includes(name)
    // );

    res.send(
      InstructorCourseInstanceBilling({
        resLocals: res.locals,
        studentBillingEnabled: res.locals.course_instance.student_billing_enabled,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const shouldEnableStudentBilling = req.body.student_billing_enabled === '1';

    await queryAsync(sql.update_course_instance_billing, {
      course_instance_id: res.locals.course_instance.id,
      student_billing_enabled: shouldEnableStudentBilling,
    });

    console.log('req.body', req.body);
    res.redirect(req.originalUrl);
  })
);

export default router;
