// @ts-check
const asyncHandler = require('express-async-handler');

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import { getGroupConfig, getGroupInfo, getQuestionGroupPermissions } from '../lib/groups';

var sql = sqldb.loadSqlEquiv(__filename);

const middleware = asyncHandler(async (req, res, next) => {
  const result = await sqldb.queryAsync(sql.select_and_auth, {
    instance_question_id: req.params.instance_question_id,
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  });
  if ((result.rowCount ?? 0) === 0) throw error.make(403, 'Access denied');

  Object.assign(res.locals, result.rows[0]);
  if (res.locals.assessment.group_work) {
    res.locals.assessment.group_config = await getGroupConfig(res.locals.assessment.id);
    res.locals.assessment_instance.group_info = await getGroupInfo(
      res.locals.assessment_instance.group_id,
      res.locals.assessment.group_config,
    );
    if (res.locals.assessment.group_config.has_roles) {
      if (
        !res.locals.assessment_instance.group_info.start &&
        !res.locals.authz_data.has_course_instance_permission_view
      ) {
        throw error.make(
          400,
          'Group role assignments do not match required settings for this assessment. Questions cannot be viewed until the group role assignments are updated.',
        );
      }
      res.locals.assessment_instance.user_group_roles = (
        res.locals.assessment_instance.group_info.rolesInfo?.roleAssignments?.[
          res.locals.authz_data.user.uid
        ] || ['None']
      )
        .map((role) => role.role_name)
        .join(', ');
      // Get the role permissions. If the authorized user has course instance
      // permission, then role restrictions don't apply.
      if (!res.locals.authz_data.has_course_instance_permission_view) {
        res.locals.instance_question.group_role_permissions = await getQuestionGroupPermissions(
          res.locals.instance_question.id,
          res.locals.assessment_instance.group_id,
          res.locals.authz_data.user.user_id,
        );
        if (!res.locals.instance_question.group_role_permissions.can_view) {
          throw error.make(
            400,
            'Your current group role does not give you permission to see this question.',
          );
        }
      }
    }
  }
  next();
});

export default middleware;
