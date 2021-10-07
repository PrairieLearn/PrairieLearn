const express = require('express');
const router = express.Router();
const _ = require('lodash');

var logger = require('../lib/logger');
var csrf = require('../lib/csrf');
var config = require('../lib/config');
const { idsEqual } = require('../lib/id');

var timeout = 24; // hours

router.all('/', function(req, res, next) {

    // SEB: check user-agent
    if ('user-agent' in req.headers) {
        checkUserAgent(res, req.headers['user-agent']);
    }

    if (typeof res.locals.assessment_instance === 'undefined' && !_.get(res.locals, 'authz_result.active', true)) {
        // Student did not start the assessment, and the assessment is not active
        assessmentNotStartedNotActive(res);
        return;
    }

    if (
        !_.get(res.locals, 'authz_result.show_closed_assessment', true) &&
        (!_.get(res.locals, 'assessment_instance.open', true) || !_.get(res.locals, 'authz_result.active', true))
    ) {
        // This assessment instance is closed and can no longer be viewed
        if (!_.get(res.locals, 'authz_result.show_closed_assessment_score', true)){
            closedAssessmentNotActiveHiddenGrade(res);
        } else {
            closedAssessmentNotActive(res);
        }
        return;
    }
    
    // SafeExamBrowser protect the assesment
    if ('authz_result' in res.locals &&
        res.locals.authz_result.mode === 'SEB') {

        // If the assessment is complete, use this middleware to show the logout page
        if ('assessment_instance' in res.locals && res.locals.assessment_instance.open === false) {
            return badSEB(req, res);
        }

        // If any of our auth checks didn't pass, fail (send to download)
        if (res.locals.authz_data.mode !== 'SEB') {
            return badSEB(req, res);
        }
    }

    // Password protect the assessment
    if ('authz_result' in res.locals &&
        'password' in res.locals.authz_result &&
        res.locals.authz_result.password &&
        res.locals?.assessment_instance?.open) {

        // No password yet case
        if (req.cookies.pl_assessmentpw == null) {
            return badPassword(res, req);
        }

        // Invalid or expired password case
        var pwData = csrf.getCheckedData(req.cookies.pl_assessmentpw, config.secretKey,
                                            {maxAge: timeout * 60 * 60 * 1000});
        if (pwData == null
            || pwData.password !== res.locals.authz_result.password) {
                return badPassword(res, req);
        }

        // Successful password case: falls though
    }

    // Pass-through for everything else
    next();
});

module.exports = router;

function badPassword(res, req) {

    logger.verbose(`invalid password attempt for ${res.locals.user.uid}`);
    res.cookie('pl_pw_origUrl', req.originalUrl);
    res.redirect('/pl/password');
}

function badSEB(req, res) {

    var SEBdata = {
        user_id: res.locals.user.user_id,
        assessment_id: res.locals.assessment.id,
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
    };
    res.locals.SEBdata = csrf.generateToken(SEBdata, config.secretKey);
    //var proto = 'seb://';
    //var proto = 'http://';  // For testing
    //res.locals.SEBUrl = proto + req.get('host') + '/pl/downloadSEBConfig/';
    res.locals.SEBUrl = config.SEBDownloadUrl;
    res.locals.prompt = 'SEB';
    return res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function checkUserAgent(res, userAgent) {

    // Check the useragent has SEB in it
    if (!userAgent.includes('SEB/2')) return;

    // Check user-agent header for exam string
    var examHash = userAgent.match(/prairielearn:(.+)$/);
    if (examHash === null) return;
    var key = examHash[1];

    var fromSEB = csrf.getCheckedData(key, config.secretKey, {maxAge: timeout * 60 * 60 * 1000});

    if ('assessment' in res.locals) {
        if (idsEqual(fromSEB.assessment_id, res.locals.assessment.id) &&
            idsEqual(fromSEB.user_id, res.locals.authz_data.user.user_id)) {

            res.locals.authz_data.mode = 'SEB';
        }

    } else {
        // Assessment list view, enable the mode
        res.locals.authz_data.mode = 'SEB';
    }
}

function closedAssessmentNotActive(res) {
    res.locals.prompt = 'closedAssessmentNotActive';
    res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function closedAssessmentNotActiveHiddenGrade(res) {
    res.locals.prompt = 'closedAssessmentNotActiveHiddenGrade';
    res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function assessmentNotStartedNotActive(res) {
    res.locals.prompt = 'assessmentNotStartedNotActive';
    res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}
