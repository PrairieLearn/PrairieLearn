import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import { InstitutionAdminGeneral, InstitutionStatisticsSchema } from './general.html';
import { getInstitution } from '../utils';
import {
  PlanGrantUpdate,
  PlanName,
  getPlanGrantsForInstitution,
  updatePlanGrantsForInstitution,
} from '../../billing/plans';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const statistics = await queryRow(
      sql.select_institution_statistics,
      { institution_id: req.params.institution_id },
      InstitutionStatisticsSchema
    );
    const planGrants = await getPlanGrantsForInstitution(req.params.institution_id);
    res.send(
      InstitutionAdminGeneral({
        institution,
        statistics,
        planGrants,
        resLocals: res.locals,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_enrollment_limits') {
      await queryAsync(sql.update_enrollment_limits, {
        institution_id: req.params.institution_id,
        yearly_enrollment_limit: req.body.yearly_enrollment_limit || null,
        course_instance_enrollment_limit: req.body.course_instance_enrollment_limit || null,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_plans') {
      // We exclude `basic` from the list of allowed plans because it should
      // only ever be used for student billing for enrollments.
      const allowedPlans: PlanName[] = ['compute', 'everything'];
      const updates: PlanGrantUpdate[] = [];
      for (const plan of allowedPlans) {
        const planGranted = !!req.body[`plan_${plan}`];
        const planGrantType = req.body[`plan_${plan}_grant_type`];
        if (planGranted) {
          updates.push({
            plan,
            grantType: planGrantType,
          });
        }
      }
      console.log('plan grant updates', updates);
      await updatePlanGrantsForInstitution(req.params.institution_id, updates);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  })
);

export default router;
