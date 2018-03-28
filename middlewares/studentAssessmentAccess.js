//var ERR = require('async-stacktrace');
//var _ = require('lodash');
//var sha256 = require('crypto-js/sha256');
const express = require('express');
var router = express.Router();

var csrf = require('../lib/csrf');
var config = require('../lib/config');

var password_timeout = 6; // hours

router.get('/', function(req, res, next) {

    //console.log(req.cookies);
    //console.log('ai', res.locals.assessment_instance);
    //console.log('a', res.locals.assessment);
    //console.dir(res.locals.authz_result);
    //console.log(res.locals);
    //var absoluteURL = req.protocol + '://' + req.get('host') + req.originalUrl;

    // Should we trigger mode='SEB'?
    if ('x-safeexambrowser-requesthash' in req.headers
        || ('user-agent' in req.headers && req.headers['user-agent'].includes('SEB/2')) ) {

        res.locals.authz_data.mode = 'SEB';
    }


    if ('assessment' in res.locals && 'authz_result' in res.locals
        && res.locals.authz_result.mode == 'SEB') {

        // Check user-agent header for exam string
        if (!req.headers['user-agent'].includes(res.locals.assessment.uuid)) {

            // Generate the CSRF-like data to send
            var SEBdata = {
                user_id: res.locals.user.user_id,
                assessment_id: res.locals.assessment.id,
            };

            res.locals.SEBdata = csrf.generateToken(SEBdata, config.secretKey);

            res.locals.SEBUrl = 'seb://' + req.get('host') + '/pl/downloadSEBConfig/';
            console.log(res.locals);
            res.locals.prompt = 'SEB';
            return res.status(401).render(__filename.replace(/\.js$/, '.ejs'), res.locals);

        } else  {
            console.log(req.headers['user-agent']);

            // matches so fall-through
        }
    }


    // Password protect the assessment
    if ('authz_result' in res.locals
        && 'password' in res.locals.authz_result
        && res.locals.authz_result.password) {

        // No password yet case
        if (req.cookies.pl_assessmentpw == null) {
            res.locals.passwordMessage = '';
            res.locals.prompt = 'password';
            console.log(res.locals);
            return res.status(401).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        }

        // Invalid or expired password case
        var pwData = csrf.getCheckedData(req.cookies.pl_assessmentpw, config.secretKey,
                                         {maxAge: password_timeout * 60 * 60 * 1000});
        if (pwData === null
            || pwData.password !== res.locals.authz_result.password) {
            res.clearCookie('pl_assessmentpw');
            // FIXME Log a bad attempt somewhere
            res.locals.passwordMessage = 'Password invalid or expired, please try again.';
            res.locals.prompt = 'password';
            console.log(res.locals);
            return res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        }

        // Successful password case: falls through
    }

    // Pass-through for everything else
    next();
});

router.post('/', function(req, res, next) {

    // For password protected things:
    if ('authz_result' in res.locals
        && 'password' in res.locals.authz_result
        && res.locals.authz_result.password) {

        if (req.body.__action == 'assessmentPassword') {
            var pwCookie = csrf.generateToken({password: req.body.password}, config.secretKey);
            res.cookie('pl_assessmentpw', pwCookie);
            return res.redirect(req.originalUrl);
        }
    }

    // Fallthrough for the middleware
    next();
});
module.exports = router;

var notneeded = function() {


    //console.dir(res.locals.assessment);
    //console.dir(res.locals.authz_result);

    //check_browser_exam_keys(res, req)
    //check_user_agent(res, req)

    var SEBvalid = false;
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
                if (SEBvalid) { return next(); }


                //var requesthash = req.headers['x-safeexambrowser-requesthash'] || null;

                // Pass through to next() if one of the keys matches

}
