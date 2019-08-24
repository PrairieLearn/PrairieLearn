const util = require('util');
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const ensureUpToDate = (locals, callback) => {
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

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));

    if (req.body.__action == 'attach_file') {
        util.callbackify(studentAssessmentInstance.processFileUpload)(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'attach_text') {
        util.callbackify(studentAssessmentInstance.processTextUpload)(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete_file') {
        util.callbackify(studentAssessmentInstance.processDeleteFile)(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
