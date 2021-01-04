const util = require('util');

const logger = require('../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    util.callbackify(async () => {
        const result = await sqldb.queryAsync(sql.select_assessments, {});
        const assessments = result.rows;
        for (const assessment of assessments) {
            logger.verbose(`calculateAssessmentQuestionStats: processing assessment_id = ${assessment.id}`);
            await sqldb.callAsync('assessment_questions_calculate_stats_for_assessment', [assessment.id]);
        }
    })(callback);
};
