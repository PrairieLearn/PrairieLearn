//var ERR = require('async-stacktrace');
//var _ = require('lodash');
//var sha256 = require('crypto-js/sha256');
const express = require('express');
var router = express.Router();

var logger = require('../lib/logger');
var csrf = require('../lib/csrf');
var config = require('../lib/config');

var timeout = 24; // hours

router.get('/', function(req, res, next) {

// Future feature
//    // SEB: check BrowserExamKey
//    if ('x-safeexambrowser-requesthash' in req.headers) {
//        checkBrowserExamKeys(res, req.headers['x-safeexambrowser-requesthash']);
//    }

    // SEB: check user-agent
    if ('user-agent' in req.headers) {
        checkUserAgent(res, req.headers['user-agent']);
    }

// Future feature
//    // Course Instance view (only show allowed exam)
//    if (!('assessment' in res.locals)) {
//        //console.log('In Course Instance Page');
//        //res.locals.authz_data.mode = 'SEB';
//        //console.log(res.locals);
//    }

    // SafeExamBrowser protect the assesment
    if ('authz_result' in res.locals &&
        res.locals.authz_result.mode == 'SEB') {

        // If the assessment is complete, use this middleware to show the logout page
        if ('assessment_instance' in res.locals && res.locals.assessment_instance.open == false) {
            return badSEB(req, res);
        }

        // If any of our auth checks didn't pass, fail (send to download)
        if (res.locals.authz_data.mode != 'SEB') {
            return badSEB(req, res);
        }
    }

/********

    // Password protect the assessment
    if ('authz_result' in res.locals &&
        'password' in res.locals.authz_result &&
        res.locals.authz_result.password) {

        // No password yet case
        if (req.cookies.pl_assessmentpw == null) {
            return badPassword(res, '');
        }

        // Invalid or expired password case
        var pwData = csrf.getCheckedData(req.cookies.pl_assessmentpw, config.secretKey,
                                         {maxAge: timeout * 60 * 60 * 1000});
        if (pwData === null
            || pwData.password !== res.locals.authz_result.password) {
            return badPassword(res, 'Password invalid or expired, please try again.');
        }

        // Successful password case: falls through
    }
**********/

    // Pass-through for everything else
    next();
});

/***
router.post('/', function(req, res, next) {

    // For password protected things:
    if ('authz_result' in res.locals
        && 'password' in res.locals.authz_result
        && res.locals.authz_result.password) {

        if (req.body.__action == 'assessmentPassword') {

            if (req.body.password == res.locals.authz_result.password) {
                var pwCookie = csrf.generateToken({password: req.body.password}, config.secretKey);
                res.cookie('pl_assessmentpw', pwCookie);
                return res.redirect(req.originalUrl);
            } else {
                return badPassword(res);
            }
        }
    }

    // Fallthrough for the middleware
    next();
});
******/

module.exports = router;

function badPassword(res, msg) {

    logger.info(`invalid password attempt for ${res.locals.user.uid}`);
    res.clearCookie('pl_assessmentpw');
    res.locals.passwordMessage = msg;
    res.locals.prompt = 'password';
    return res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function badSEB(req, res) {

    var SEBdata = {
        user_id: res.locals.user.user_id,
        assessment_id: res.locals.assessment.id,
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
    };
    res.locals.SEBdata = csrf.generateToken(SEBdata, config.secretKey);
    var proto = 'seb://';
    //var proto = 'http://';  // For testing
    res.locals.SEBUrl = proto + req.get('host') + '/pl/downloadSEBConfig/';
    res.locals.prompt = 'SEB';
    return res.status(401).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function checkUserAgent(res, userAgent) {

    // Check the useragent has SEB in it
    if (!userAgent.includes('SEB/2')) return;

    // Check user-agent header for exam string
    var examHash = userAgent.match(/prairielearn:(.+)$/);
    if (examHash === null) return;
    var key = examHash[1];

    var fromSEB = csrf.getCheckedData(key, config.secretKey, {maxAge: timeout * 60 * 60 * 1000});

    if ('assessment' in res.locals &&
        fromSEB.assessment_id == res.locals.assessment.id &&
        fromSEB.user_id == res.locals.authz_data.user.user_id) {

        res.locals.authz_data.mode = 'SEB';
    }

    // Assessment list view, enable the mode
    if (!('assessment' in res.locals)) {
        res.locals.authz_data.mode = 'SEB';
    }

    res.locals.authz_data.allowed_assessment_id = fromSEB.assessment_id;
}

// Future feature
//function checkBrowserExamKeys(res, key) {

    /* FIXME
    _.each(res.locals.authz_result.seb_keys, function(key) {

        var ourhash = sha256(absoluteURL + key).toString();

        //console.log('ours', ourhash);
        //console.log('clin', requesthash);

        if (ourhash == requesthash) {
            SEBvalid = true;
            return false;
        }
    });
    */
//}
