var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));

    var closeExam;
    if (req.body.postAction == 'grade') {
        closeExam = false;
    } else if (req.body.postAction == 'finish') {
        closeExam = true;
    } else if (req.body.postAction == 'timeLimitFinish') {
        closeExam = true;
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
    assessment.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.authn_user.user_id, closeExam, function(err) {
        if (ERR(err, next)) return;
        if (req.body.postAction == 'timeLimitFinish') {
            res.redirect(req.originalUrl + '?timeLimitExpired=true');
        } else {
            res.redirect(req.originalUrl);
        }
    });
});

// FIXME: delete this
var tmp_upgrade = function(locals, callback) {
    if (locals.assessment_instance.tmp_upgraded_iq_status) {
        return callback(null);
    } else {
        var params = {assessment_instance_id: locals.assessment_instance.id};
        sqldb.query(sql.tmp_upgrade_iq_status, params, function(err, _result) {
            if (ERR(err, callback)) return;

            var params = {assessment_instance_id: locals.assessment_instance.id};
            sqldb.query(sql.tmp_set_upgraded, params, function(err, _result) {
                if (ERR(err, callback)) return;
                return callback(null);
            });
        });
    }
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    tmp_upgrade(res.locals, function(err) {
        if (ERR(err, next)) return;

        var params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;

            assessment.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
                if (ERR(err, next)) return;
                res.locals.assessment_text_templated = assessment_text_templated;

                res.locals.showTimeLimitExpiredModal = (req.query.timeLimitExpired == 'true');

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
