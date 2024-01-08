import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import {
  InstitutionAdminGeneral,
  InstitutionStatisticsSchema,
} from './institutionAdminGeneral.html';
import { getInstitution } from '../../lib/institution';
import {
  getPlanGrantsForContext,
  reconcilePlanGrantsForInstitution,
} from '../../lib/billing/plans';
import { InstitutionSchema } from '../../../lib/db-types';
import { insertAuditLog } from '../../../models/audit-log';
import { parseDesiredPlanGrants } from '../../lib/billing/components/PlanGrantsEditor.html';
import { getAvailableTimezones } from '../../../lib/timezones';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const availableTimezones = await getAvailableTimezones();
    const statistics = await queryRow(
      sql.select_institution_statistics,
      { institution_id: req.params.institution_id },
      InstitutionStatisticsSchema,
    );
    const planGrants = await getPlanGrantsForContext({ institution_id: req.params.institution_id });
    res.send(
      InstitutionAdminGeneral({
        institution,
        availableTimezones,
        statistics,
        planGrants,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_enrollment_limits') {
      await runInTransactionAsync(async () => {
        const institution = await getInstitution(req.params.institution_id);
        const updatedInstitution = await queryRow(
          sql.update_institution,
          {
            institution_id: req.params.institution_id,
            short_name: req.body.short_name,
            long_name: req.body.long_name,
            display_timezone: req.body.display_timezone,
            uid_regexp: req.body.uid_regexp,
            yearly_enrollment_limit: req.body.yearly_enrollment_limit,
            course_instance_enrollment_limit: req.body.course_instance_enrollment_limit,
          },
          InstitutionSchema,
        );
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.user_id,
          table_name: 'institutions',
          action: 'update',
          institution_id: req.params.institution_id,
          old_state: institution,
          new_state: updatedInstitution,
          row_id: req.params.institution_id,
        });
      });
      flash('success', 'Successfully updated enrollment limits.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_plans') {
      const desiredPlans = parseDesiredPlanGrants({
        body: req.body,
        // We exclude `basic` from the list of allowed plans because it should
        // only ever be used for student billing for enrollments.
        allowedPlans: ['compute', 'everything'],
      });
      await reconcilePlanGrantsForInstitution(
        req.params.institution_id,
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
