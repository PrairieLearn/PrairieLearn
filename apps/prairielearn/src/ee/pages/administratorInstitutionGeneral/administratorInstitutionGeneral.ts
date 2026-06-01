import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { markdownToHtml } from '@prairielearn/markdown';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { InstitutionSchema } from '../../../lib/db-types.js';
import { validateGithubCourseOwner } from '../../../lib/github.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../../lib/timezones.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  CourseRequestMessageSchema,
  selectInstitutionSettings,
  updateInstitutionSetting,
} from '../../../models/institution-settings.js';
import { parseDesiredPlanGrants } from '../../lib/billing/components/PlanGrantsEditor.js';
import {
  getPlanGrantsForContext,
  reconcilePlanGrantsForInstitution,
} from '../../lib/billing/plans.js';
import { getInstitution } from '../../lib/institution.js';

import {
  AdministratorInstitutionGeneral,
  InstitutionStatisticsSchema,
} from './administratorInstitutionGeneral.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const availableTimezones = await getCanonicalTimezones([institution.display_timezone]);
    const statistics = await queryRow(
      sql.select_institution_statistics,
      { institution_id: req.params.institution_id },
      InstitutionStatisticsSchema,
    );
    const planGrants = await getPlanGrantsForContext({ institution_id: req.params.institution_id });
    const institutionSettings = await selectInstitutionSettings({
      institution_id: req.params.institution_id,
    });
    const courseRequestMessage = institutionSettings?.course_request_message ?? null;
    const courseRequestMessageHtml = courseRequestMessage
      ? markdownToHtml(courseRequestMessage, {
          allowHtml: false,
          interpretMath: false,
        })
      : '';
    res.send(
      AdministratorInstitutionGeneral({
        institution,
        availableTimezones,
        statistics,
        planGrants,
        courseRequestMessage,
        courseRequestMessageHtml,
        githubCourseOwner: institutionSettings?.github_course_owner ?? null,
        defaultGithubCourseOwner: config.githubCourseOwner,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
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
            yearly_enrollment_limit: req.body.yearly_enrollment_limit || null,
            course_instance_enrollment_limit: req.body.course_instance_enrollment_limit || null,
          },
          InstitutionSchema,
        );
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.id,
          table_name: 'institutions',
          action: 'update',
          institution_id: req.params.institution_id,
          old_state: institution,
          new_state: updatedInstitution,
          row_id: req.params.institution_id,
        });
      });
      flash('success', 'Successfully updated institution settings.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_course_request_message') {
      const value = CourseRequestMessageSchema.parse(req.body.course_request_message);
      await updateInstitutionSetting({
        institution_id: req.params.institution_id,
        field: 'course_request_message',
        value,
        authn_user_id: res.locals.authn_user.id,
      });
      flash('success', 'Successfully updated the course request message.');
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
        res.locals.authn_user.id,
      );
      flash('success', 'Successfully updated institution plan grants.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_github_course_owner') {
      const raw =
        typeof req.body.github_course_owner === 'string' ? req.body.github_course_owner.trim() : '';
      const newValue = raw.length > 0 ? raw : null;

      if (newValue !== null) {
        const access = await validateGithubCourseOwner(newValue);
        if (!access.ok) {
          flash('error', access.message);
          res.redirect(req.originalUrl);
          return;
        }
      }

      await updateInstitutionSetting({
        institution_id: req.params.institution_id,
        field: 'github_course_owner',
        value: newValue,
        authn_user_id: res.locals.authn_user.id,
      });
      flash('success', 'Successfully updated default GitHub organization.');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
