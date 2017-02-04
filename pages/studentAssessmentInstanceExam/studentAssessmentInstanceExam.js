var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var assessments = require('../../assessments');
var assessmentsExam = require('../../assessments/exam');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));

    var finishExam;
    if (req.body.postAction == 'grade') {
        finishExam = false;
    } else if (req.body.postAction == 'finish') {
        finishExam = true;
    } else if (req.body.postAction == 'timeLimitFinish') {
        finishExam = true;
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
    assessmentsExam.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.user.user_id, res.locals.authz_result.credit, finishExam, function(err) {
        if (ERR(err, next)) return;
        if (req.body.postAction == 'timeLimitFinish') {
            res.redirect(req.originalUrl + '?timeLimitExpired=true');
        } else {
            res.redirect(req.originalUrl);
        }
    });
});

var tmp_upgrade = function(locals, callback) {
    if (locals.assessment_instance.tmp_upgraded_iq_status) {
        return callback(null);
    } else {
        var params = {assessment_instance_id: locals.assessment_instance.id};
        sqldb.query(sql.tmp_upgrade_iq_status, params, function(err, result) {
            if (ERR(err, callback)) return;

            var params = {assessment_instance_id: locals.assessment_instance.id};
            sqldb.query(sql.tmp_set_upgraded, params, function(err, result) {
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

            console.log('################################################################################');
            _.each(res.locals.questions, function(q) {
                console.log(q.status == q.check_status, q.id, q.status, q.check_status);
            });

            assessments.renderText(res.locals.assessment, res.locals.urlPrefix, function(err, assessment_text_templated) {
                if (ERR(err, next)) return;
                res.locals.assessment_text_templated = assessment_text_templated;

                res.locals.showTimeLimitExpiredModal = (req.query.timeLimitExpired == 'true');

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
