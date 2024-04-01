// @ts-check
const _ = require('lodash');
const asyncHandler = require('express-async-handler');

const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

const { isEnterprise } = require('../lib/license');
const { authzCourseOrInstance } = require('./authzCourseOrInstance');
const { selectAndAuthzInstanceQuestion } = require('./selectAndAuthzInstanceQuestion');
const { selectAndAuthzAssessmentInstance } = require('./selectAndAuthzAssessmentInstance');
const { selectAndAuthzInstructorQuestion } = require('./selectAndAuthzInstructorQuestion');
const { authzHasCoursePreviewOrInstanceView } = require('./authzHasCoursePreviewOrInstanceView');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = asyncHandler(async (req, res, next) => {
  // We rely on having res.locals.workspace_id already set to the correct value here
  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_auth_data_from_workspace, {
    workspace_id: res.locals.workspace_id,
  });

  if (result.rows.length === 0) {
    // We couldn't find the workspace. Someone could have put in a bad workspace ID,
    // or there could be a dangling workspace after a variant was deleted. Either way,
    // translate this to a 403 the error out of our monitoring.
    //
    // We use a 403 instead of a 404 to avoid leaking information about the existence
    // of particular workspace IDs.
    throw error.make(403, 'Access denied');
  }

  _.assign(res.locals, result.rows[0]);

  if (res.locals.course_instance_id) {
    req.params.course_instance_id = res.locals.course_instance_id;
    req.params.assessment_instance_id = res.locals.assessment_instance_id;
    req.params.instance_question_id = res.locals.instance_question_id;
    req.params.question_id = res.locals.question_id;
    await authzCourseOrInstance(req, res);

    if (isEnterprise()) {
      const { checkPlanGrantsForLocals } = require('../ee/lib/billing/plan-grants');
      const hasPlanGrants = await checkPlanGrantsForLocals(res.locals);
      if (!hasPlanGrants) {
        // TODO: Show a fancier error page explaining what happened and prompting
        // the user to contact their instructor.
        throw error.make(403, 'Access denied');
      }
    }

    if (res.locals.instance_question_id) {
      await selectAndAuthzInstanceQuestion(req, res);
    } else if (res.locals.assessment_instance_id) {
      await selectAndAuthzAssessmentInstance(req, res);
    } else {
      // If we have neither assessment instance nor question instance ids,
      // we are probably viewing in instructor view and should authorize for that.
      res.locals.course_instance = { id: res.locals.course_instance_id };
      await authzHasCoursePreviewOrInstanceView(req, res);
      await selectAndAuthzInstructorQuestion(req, res);
    }
  } else if (res.locals.course_id) {
    req.params.course_id = res.locals.course_id;
    await authzCourseOrInstance(req, res);
  } else {
    throw new Error('Workspace has no course and no course instance!');
  }

  next();
});
