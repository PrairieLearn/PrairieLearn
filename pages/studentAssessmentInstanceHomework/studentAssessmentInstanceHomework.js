var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');
var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var assessment = require('../../lib/assessment');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var ensureUpToDate = (locals, callback) => {
    debug('ensureUpToDate()');
    assessment.update(locals.assessment_instance.id, locals.authn_user.user_id, (err, updated) => {
        if (ERR(err, callback)) return;

        debug('updated:', updated);
        if (!updated) return callback(null);
        
        // we updated the assessment_instance, so reload it

        debug('selecting assessment instance');
        const params = {assessment_instance_id: locals.assessment_instance.id};
        sqldb.queryOneRow(sql.select_assessment_instance, params, (err, result) => {
            if (ERR(err, callback)) return;
            locals.assessment_instance = result.rows[0];
            debug('selected assessment_instance.id:', locals.assessment_instance.id);
            callback(null);
        });
    });
};

router.get('/', function(req, res, next) {
    debug('GET');
    if (res.locals.assessment.type !== 'Homework') return next();
    debug('is Homework');

    ensureUpToDate(res.locals, (err) => {
        if (ERR(err, next)) return;

        debug('selecting questions');
        var params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;
            debug('number of questions:', res.locals.questions.length);

            debug('rendering assessment text');
            assessment.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
                if (ERR(err, next)) return;
                res.locals.assessment_text_templated = assessment_text_templated;

                debug('rendering EJS');
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
