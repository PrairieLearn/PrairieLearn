import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { markdownToHtml } from '@prairielearn/markdown';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { InstitutionSchema } from '../../../lib/db-types.js';
import {
  type GithubOrgAccessResult,
  checkGithubOrgAccess,
  isPlatformDefaultOrg,
} from '../../../lib/github.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../../lib/timezones.js';
import { insertAuditLog } from '../../../models/audit-log.js';
import {
  COURSE_REQUEST_MESSAGE_MAX_LENGTH,
  selectInstitutionSettings,
  updateInstitutionCourseRequestMessage,
  updateInstitutionGithubCourseOwner,
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
      const newMessage =
        typeof req.body.course_request_message === 'string' &&
        req.body.course_request_message.trim().length > 0
          ? req.body.course_request_message
          : null;
      if (newMessage !== null && newMessage.length > COURSE_REQUEST_MESSAGE_MAX_LENGTH) {
        throw new error.HttpStatusError(
          400,
          `The course request message must be at most ${COURSE_REQUEST_MESSAGE_MAX_LENGTH} characters.`,
        );
      }
      await updateInstitutionCourseRequestMessage({
        institution_id: req.params.institution_id,
        course_request_message: newMessage,
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

      if (newValue !== null && !isPlatformDefaultOrg(newValue)) {
        const access = await checkGithubOrgAccess(newValue);
        if (!access.ok) {
          flash('error', githubOrgAccessErrorMessage(access, newValue));
          res.redirect(req.originalUrl);
          return;
        }
      }

      await updateInstitutionGithubCourseOwner({
        institution_id: req.params.institution_id,
        github_course_owner: newValue,
        authn_user_id: res.locals.authn_user.id,
      });
      flash('success', 'Successfully updated default GitHub organization.');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

function githubOrgAccessErrorMessage(
  result: Extract<GithubOrgAccessResult, { ok: false }>,
  org: string,
): string {
  switch (result.reason) {
    case 'no_client':
      return 'GitHub integration is not configured on this server.';
    case 'no_machine_user':
      return 'GitHub machine user is not configured; cannot validate org access.';
    case 'org_unreachable':
      return `Could not access GitHub organization '${org}'. Confirm the org exists and the machine account has been invited.`;
    case 'not_a_member':
      if (result.detail === 'pending') {
        return `The PrairieLearn machine account has not yet accepted the invitation to '${org}'. Accept the invitation and try again.`;
      }
      return `The PrairieLearn machine account is not a member of '${org}'. Add the account to the org and try again.`;
  }
}

export default router;
