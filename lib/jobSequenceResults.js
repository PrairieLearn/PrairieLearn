var ERR = require('async-stacktrace');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    getJobSequence(job_sequence_id, course_id, callback) {
        var params = {
            job_sequence_id: job_sequence_id,
            course_id: course_id,
        };
        sqldb.queryOneRow(sql.select_job_sequence, params, function(err, result) {
            if (ERR(err, callback)) return;
            callback(null, result.rows[0]);
        });
    },
};
