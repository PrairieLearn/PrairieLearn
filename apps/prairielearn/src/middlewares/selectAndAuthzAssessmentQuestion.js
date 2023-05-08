var _ = require('lodash');
const util = require('util');

var sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

var sql = sqldb.loadSqlEquiv(__filename);

module.exports = util.callbackify(async (req, res) => {
  var params = {
    assessment_question_id: req.params.assessment_question_id,
    assessment_id: res.locals.assessment.id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  const result = await sqldb.queryAsync(sql.select_and_auth, params);
  if (result.rowCount === 0) throw error.make(403, 'Access denied');
  _.assign(res.locals, result.rows[0]);
});
