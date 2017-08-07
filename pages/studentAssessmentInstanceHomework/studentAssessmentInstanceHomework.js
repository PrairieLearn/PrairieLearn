var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var assessment = require('../../lib/assessment');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var ensureUpToDate = (locals, callback) => {
    assessment.update(locals.assessment_instance.id, locals.authn_user.user_id, (err, updated) {
        if (ERR(err, callback)) return;

        if (!updated) return callback(null);
        
        // we updated the assessment_instance, so reload it

        const params = {assessment_instance_id: locals.assessment_instance.id};
        sqldb.queryOneRow(sql.select_assessment_instance, params, (err, result) => {
            if (ERR(err, callback)) return;
            locals.assessment_instance = result.rows[0];
            callback(null);
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

            assessment.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
                if (ERR(err, next)) return;
                res.locals.assessment_text_templated = assessment_text_templated;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
