var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var _ = require('lodash');

var error = require('@prairielearn/prairielib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));

    var closeExam;
    if (req.body.__action == 'grade') {
        closeExam = false;
    } else if (req.body.__action == 'finish') {
        closeExam = true;
    } else if (req.body.__action == 'timeLimitFinish') {
        closeExam = true;
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
    assessment.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.authn_user.user_id, closeExam, function(err) {
        if (ERR(err, next)) return;
        if (req.body.__action == 'timeLimitFinish') {
            res.redirect(req.originalUrl + '?timeLimitExpired=true');
        } else {
            res.redirect(req.originalUrl);
        }
    });
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    var params = {assessment_instance_id: res.locals.assessment_instance.id};
    sqldb.query(sql.select_instance_questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.instance_questions = result.rows;

        assessment.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
            if (ERR(err, next)) return;
            res.locals.assessment_text_templated = assessment_text_templated;

            res.locals.showTimeLimitExpiredModal = (req.query.timeLimitExpired == 'true');
            res.locals.savedAnswers = _.reduce(res.locals.instance_questions, (sum, question) => {
                if (question.status == 'saved') return sum+1;
                return sum;
            }, 0);

            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

module.exports = router;
