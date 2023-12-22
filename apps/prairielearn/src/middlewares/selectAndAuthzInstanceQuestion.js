// @ts-check
var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

import { getGroupConfig, getGroupInfo, getQuestionGroupPermissions } from '../lib/groups';

var sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  var params = {
    instance_question_id: req.params.instance_question_id,
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  sqldb.query(sql.select_and_auth, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) return next(error.make(403, 'Access denied'));
    _.assign(res.locals, result.rows[0]);
    if (res.locals.assessment.group_work) {
      res.locals.assessment.group_config = getGroupConfig(res.locals.assessment.id);
      res.locals.assessment_instance.group_info = getGroupInfo(
        res.locals.assessment_instance.group_id,
        res.locals.assessment.group_config,
      );
      if (!res.locals.assessment_instance.group_info.start) {
        return next(
          error.make(
            400,
            'Group role assignments do not match required settings for this assessment. Questions cannot be viewed until the group role assignments are updated.',
          ),
        );
      }
      res.locals.instance_question.group_role_permissions = getQuestionGroupPermissions(
        res.locals.assessment_question.id,
        res.locals.authz_data.user.user_id,
      );
      if (!res.locals.instance_question.group_role_permissions.canView) {
        return next(
          error.make(
            400,
            'Your current group role does not give you permission to see this question.',
          ),
        );
      }
    }
    next();
  });
};
