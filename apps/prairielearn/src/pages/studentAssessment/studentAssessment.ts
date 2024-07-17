import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { IdSchema } from '../../lib/db-types.js';
import {
  joinGroup,
  createGroup,
  getGroupConfig,
  getGroupId,
  getGroupInfo,
  updateGroupRoles,
  leaveGroup,
  GroupOperationError,
  canUserAssignGroupRoles,
} from '../../lib/groups.js';
import { getClientFingerprintId } from '../../middlewares/clientFingerprint.js';
import { checkPasswordOrRedirect } from '../../middlewares/studentAssessmentAccess.js';

import { StudentAssessment } from './studentAssessment.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async function (req, res) {
    if (res.locals.assessment.multiple_instance) {
      if (res.locals.assessment.type === 'Homework') {
        throw new AugmentedError('"Homework" assessments do not support multiple instances', {
          data: { assessment: res.locals.assessment },
        });
      }
      // The user has landed on this page to create a new assessment instance.
      // Proceed even if there are existing instances.
    } else {
      // If the assessment is single-instance, check if the user already has an
      // instance. If so, redirect to it.
      const assessment_instance_id = await queryOptionalRow(
        sql.select_single_assessment_instance,
        {
          assessment_id: res.locals.assessment.id,
          user_id: res.locals.user.user_id,
        },
        IdSchema,
      );
      if (assessment_instance_id != null) {
        res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
        return;
      }
    }

    // Before allowing the user to create a new assessment instance, we need
    // to check if the current access rules require a password. If they do,
    // we'll ensure that the password has already been entered before allowing
    // students to create and start a new assessment instance.
    if (!checkPasswordOrRedirect(req, res)) return;

    // For homeworks without group work, create the new assessment instance
    // and redirect to it without further student action.
    if (!res.locals.assessment.group_work && res.locals.assessment.type === 'Homework') {
      const time_limit_min = null;
      const client_fingerprint_id = await getClientFingerprintId(req, res);
      const assessment_instance_id = await makeAssessmentInstance(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.assessment.group_work,
        res.locals.authn_user.user_id,
        res.locals.authz_data.mode,
        time_limit_min,
        res.locals.authz_data.date,
        client_fingerprint_id,
      );
      res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
      return;
    }

    if (!res.locals.assessment.group_work) {
      res.send(StudentAssessment({ resLocals: res.locals }));
      return;
    }

    // Get the group config info
    const groupConfig = await getGroupConfig(res.locals.assessment.id);

    // Check whether the user is currently in a group in the current assessment by trying to get a group_id
    const groupId = await getGroupId(res.locals.assessment.id, res.locals.user.user_id);

    const groupInfo = groupId === null ? null : await getGroupInfo(groupId, groupConfig);
    const userCanAssignRoles =
      groupInfo != null &&
      groupConfig.has_roles &&
      (canUserAssignGroupRoles(groupInfo, res.locals.user.user_id) ||
        res.locals.authz_data.has_course_instance_permission_edit);
    res.send(
      StudentAssessment({ resLocals: res.locals, groupConfig, groupInfo, userCanAssignRoles }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async function (req, res) {
    // No, you do not need to verify authz_result.authorized_edit (indeed, this flag exists
    // only for an assessment instance, not an assessment).
    //
    // The assessment that is created here will be owned by the effective user. The only
    // reason to worry, therefore, is if the effective user has a different UID than the
    // authn user. This is only allowed, however, if the authn user has permission to edit
    // student data in the course instance (which has already been checked), exactly the
    // permission required to create an assessment for the effective user.

    if (req.body.__action === 'new_instance') {
      // Before allowing the user to create a new assessment instance, we need
      // to check if the current access rules require a password. If they do,
      // we'll ensure that the password has already been entered before allowing
      // students to create and start a new assessment instance.
      if (!checkPasswordOrRedirect(req, res)) return;

      if (res.locals.assessment.group_work) {
        const groupConfig = await getGroupConfig(res.locals.assessment.id);
        const groupId = await getGroupId(res.locals.assessment.id, res.locals.user.user_id);
        if (groupId === null) {
          throw new HttpStatusError(403, 'Cannot create a new instance while not in a group.');
        }
        const groupInfo = await getGroupInfo(groupId, groupConfig);
        if (!groupInfo.start) {
          throw new HttpStatusError(
            403,
            'Group has invalid composition or role assignment. Cannot start assessment.',
          );
        }
      }

      const time_limit_min =
        res.locals.assessment.type === 'Exam' ? res.locals.authz_result.time_limit_min : null;
      const client_fingerprint_id = await getClientFingerprintId(req, res);
      const assessment_instance_id = await makeAssessmentInstance(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.assessment.group_work,
        res.locals.authn_user.user_id,
        res.locals.authz_data.mode,
        time_limit_min,
        res.locals.req_date,
        client_fingerprint_id,
      );
      res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
    } else if (req.body.__action === 'join_group') {
      await joinGroup(
        req.body.join_code,
        res.locals.assessment.id,
        res.locals.user.uid,
        res.locals.authn_user.user_id,
      ).catch((err) => {
        if (err instanceof GroupOperationError) {
          flash('error', err.message);
        } else {
          throw err;
        }
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'create_group') {
      await createGroup(
        req.body.groupName,
        res.locals.assessment.id,
        [res.locals.user.uid],
        res.locals.authn_user.user_id,
      ).catch((err) => {
        if (err instanceof GroupOperationError) {
          flash('error', err.message);
        } else {
          throw err;
        }
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_group_roles') {
      // Check whether the user is currently in a group
      const groupId = await getGroupId(res.locals.assessment.id, res.locals.user.user_id);
      if (groupId == null) {
        throw new HttpStatusError(403, 'Cannot change group roles while not in a group.');
      }
      await updateGroupRoles(
        req.body,
        res.locals.assessment.id,
        groupId,
        res.locals.user.user_id,
        res.locals.authz_data.has_course_instance_permission_edit,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'leave_group') {
      await leaveGroup(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
