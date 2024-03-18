const asyncHandler = require('express-async-handler');
import * as express from 'express';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';

import { checkPasswordOrRedirect } from '../../middlewares/studentAssessmentAccess';
import { makeAssessmentInstance } from '../../lib/assessment';
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
} from '../../lib/groups';
import { getClientFingerprintId } from '../../middlewares/clientFingerprint';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async function (req, res, next) {
    var params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.user.user_id,
    };
    if (res.locals.assessment.multiple_instance) {
      if (res.locals.assessment.type === 'Homework') {
        return next(
          error.makeWithData('"Homework" assessments do not support multiple instances', {
            assessment: res.locals.assessment,
          }),
        );
      }
      // The user has landed on this page to create a new assessment instance.
      //
      // Before allowing the user to create a new assessment instance, we need
      // to check if the current access rules require a password. If they do,
      // we'll ensure that the password has already been entered before allowing
      // students to create and start a new assessment instance.
      if (!checkPasswordOrRedirect(req, res)) return;
      if (res.locals.assessment.group_work) {
        // Get the group config info
        const groupConfig = await getGroupConfig(res.locals.assessment.id);
        res.locals.groupConfig = groupConfig;

        // Check whether the user is currently in a group in the current assessment by trying to get a group_id
        const groupId = await getGroupId(res.locals.assessment.id, res.locals.user.user_id);

        if (groupId === null) {
          res.locals.notInGroup = true;
        } else {
          const groupInfo = await getGroupInfo(groupId, groupConfig);
          res.locals.groupSize = groupInfo.groupSize;
          res.locals.groupMembers = groupInfo.groupMembers;
          res.locals.joinCode = groupInfo.joinCode;
          res.locals.groupName = groupInfo.groupName;
          res.locals.start = groupInfo.start;
          res.locals.rolesInfo = groupInfo.rolesInfo;

          if (groupConfig.hasRoles) {
            res.locals.userCanAssignRoles = canUserAssignGroupRoles(
              groupInfo,
              res.locals.user.user_id,
            );
          }
        }
      }
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    } else {
      const result = await queryAsync(sql.select_single_assessment_instance, params);
      if (result.rowCount === 0) {
        // Before allowing the user to create a new assessment instance, we need
        // to check if the current access rules require a password. If they do,
        // we'll ensure that the password has already been entered before allowing
        // students to create and start a new assessment instance.
        if (!checkPasswordOrRedirect(req, res)) return;

        if (res.locals.assessment.group_work) {
          // Get the group config info
          const groupConfig = await getGroupConfig(res.locals.assessment.id);
          res.locals.groupConfig = groupConfig;

          // Check whether the user is currently in a group in the current assessment by trying to get a group_id
          const groupId = await getGroupId(res.locals.assessment.id, res.locals.user.user_id);

          if (groupId === null) {
            res.locals.notInGroup = true;
          } else {
            res.locals.notInGroup = false;
            const groupInfo = await getGroupInfo(groupId, groupConfig);
            res.locals.groupSize = groupInfo.groupSize;
            res.locals.groupMembers = groupInfo.groupMembers;
            res.locals.joinCode = groupInfo.joinCode;
            res.locals.groupName = groupInfo.groupName;
            res.locals.start = groupInfo.start;
            res.locals.rolesInfo = groupInfo.rolesInfo;

            if (groupConfig.has_roles) {
              res.locals.userCanAssignRoles = canUserAssignGroupRoles(
                groupInfo,
                res.locals.user.user_id,
              );
            }
          }
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        } else if (res.locals.assessment.type === 'Homework') {
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
          res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
        } else {
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        }
      } else {
        res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
      }
    }
  }),
);

router.post(
  '/',
  asyncHandler(async function (req, res, next) {
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
          throw error.make(403, 'Cannot create a new instance while not in a group.');
        }
        const groupInfo = await getGroupInfo(groupId, groupConfig);
        if (!groupInfo.start) {
          throw error.make(
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
      res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
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
        throw error.make(403, 'Cannot change group roles while not in a group.');
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
      return next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  }),
);

module.exports = router;
