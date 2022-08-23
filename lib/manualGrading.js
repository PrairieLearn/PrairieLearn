const sqlDb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

/** Builds the URL of an instance question tagged to be manually graded for a particular
 * assessment question. Only returns instance questions assigned to a particular grader.
 *
 * @params {string} urlPrefix - URL prefix for the current course instance.
 * @param {number} assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
 * @param {number} assessment_question_id - The assessment question being graded.
 * @param {number} user_id - The user_id of the current grader. Typically the current effective user.
 * @param {number} prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
 */
module.exports.nextUngradedInstanceQuestionUrl = async (
  urlPrefix,
  assessment_id,
  assessment_question_id,
  user_id,
  prior_instance_question_id
) => {
  const params = {
    assessment_id,
    assessment_question_id,
    user_id,
    prior_instance_question_id,
  };
  const result = await sqlDb.queryZeroOrOneRowAsync(
    sql.select_next_ungraded_instance_question,
    params
  );

  if (result.rowCount > 0) {
    const instance_question_id = result.rows[0].id;
    return `${urlPrefix}/assessment/${assessment_id}/manual_grading/instance_question/${instance_question_id}`;
  }
  // If we have no more submissions, then redirect back to manual grading page
  return `${urlPrefix}/assessment/${assessment_id}/manual_grading/assessment_question/${assessment_question_id}`;
};
