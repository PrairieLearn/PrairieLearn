import { Router } from 'express';
import asyncHandler = require('express-async-handler');

import { InstructorCourseInstanceBilling } from './instructorInstanceAdminBilling.html';
import { PLAN_FEATURE_NAMES, getFeaturesForPlans, getPlanGrantsForInstitution } from '../../plans';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // This page is behind a feature flag for now.
    if (!res.locals.billing_enabled) return;

    const planGrants = await getPlanGrantsForInstitution(res.locals.institution.id);
    const planGrantFeatures = getFeaturesForPlans(planGrants);
    const hasFeaturesNotGrantedByInstitution = PLAN_FEATURE_NAMES.some(
      (name) => !planGrantFeatures.includes(name)
    );

    res.send(InstructorCourseInstanceBilling({ resLocals: res.locals }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log('req.body', req.body);
    res.redirect(req.originalUrl);
  })
);

export default router;
