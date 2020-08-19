const _ = require('lodash');
const asyncHandler = require('express-async-handler');
const { promisify } = require('util');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const authzCourse = promisify(require('./authzCourse'));
const authzCourseInstance = promisify(require('./authzCourseInstance'));
const selectAndAuthzInstanceQuestion = promisify(require('./selectAndAuthzInstanceQuestion'));
const selectAndAuthzAssessmentInstance = promisify(require('./selectAndAuthzAssessmentInstance'));
const selectAndAuthzInstructorQuestion = promisify(require('./selectAndAuthzInstructorQuestion'));
const authzCourseInstanceHasInstructorView = promisify(require('./authzCourseInstanceHasInstructorView'));

module.exports = asyncHandler(async (req, res, next) => {
    const result = await sqldb.queryOneRowAsync(sql.select_auth_data_from_workspace, req.params);
    _.assign(res.locals, result.rows[0]);
    res.locals.workspace_id = req.params.workspace_id;

    if (res.locals.course_instance_id) {
        req.params.course_instance_id = res.locals.course_instance_id;
        req.params.assessment_instance_id = res.locals.assessment_instance_id;
        req.params.instance_question_id = res.locals.instance_question_id;
        req.params.question_id = res.locals.question_id;
        await authzCourseInstance(req, res);

        if (res.locals.instance_question_id) {
            await selectAndAuthzInstanceQuestion(req, res);
        } else if (res.locals.assessment_instance_id) {
            await selectAndAuthzAssessmentInstance(req, res);
        } else {
            /* If we have neither assessment instance nor question instance ids, we are probably viewing in
               instructor view and should authorize for that. */
            res.locals.course_instance = { id: res.locals.course_instance_id };
            await authzCourseInstanceHasInstructorView(req, res);
            await selectAndAuthzInstructorQuestion(req, res);
        }
    } else if (res.locals.course_id) {
        req.params.course_id = res.locals.course_id;
        await authzCourse(req, res);
    } else {
        throw new Error('Workspace has no course and no course instance!');
    }

    next();
});
