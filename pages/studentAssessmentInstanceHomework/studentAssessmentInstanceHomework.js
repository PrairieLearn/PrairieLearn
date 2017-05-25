var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var assessments = require('../../assessments');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var ensureUpToDate = (locals, callback) => {
    const params = [
        locals.assessment_instance.id,
        locals.authn_user.user_id,
    ];
    sqldb.callOneRow('assessment_instances_update_homework', params, (err, result) => {
        if (ERR(err, callback)) return;

        if (!result.rows[0].updated) {
            return callback(null);
        }

        // we updated the assessment_instance, so now regrade and reload it

        const params = [
            locals.assessment_instance.id,
            locals.authn_user.user_id,
            null, // credit
            true, // only_log_if_score_updated
        ];
        sqldb.callOneRow('assessment_instances_grade', params, (err) => {
            if (ERR(err, callback)) return;

            const params = {assessment_instance_id: locals.assessment_instance.id};
            sqldb.queryOneRow(sql.select_assessment_instance, params, (err, result) => {
                if (ERR(err, callback)) return;
                locals.assessment_instance = result.rows[0];
                callback(null);
            });
        });
    });
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();

    ensureUpToDate(res.locals, (err) => {
        if (ERR(err, next)) return;

        var params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;

            assessments.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
                if (ERR(err, next)) return;
                res.locals.assessment_text_templated = assessment_text_templated;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
