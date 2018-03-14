//var ERR = require('async-stacktrace');
//var _ = require('lodash');
//var sha256 = require('crypto-js/sha256');
var csrf = require('../lib/csrf');
var config = require('../lib/config');

module.exports = function(req, res, next) {

    //console.log(req.headers);
    //console.dir('ai', res.locals.assessment_instance);
    //var absoluteURL = req.protocol + '://' + req.get('host') + req.originalUrl;

    if ('x-safeexambrowser-requesthash' in req.headers
        || ('user-agent' in req.headers && req.headers['user-agent'].includes('SEB/2')) ) {

        res.locals.authz_data.mode = 'SEB';

        //var requesthash = req.headers['x-safeexambrowser-requesthash'] || null;

        // Pass through to next() if one of the keys matches
        if ('assessment' in res.locals
            && 'authz_result' in res.locals) {

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

            // Check user-agent header for exam string (easier)
            if (req.headers['user-agent'].includes(res.locals.assessment.uuid)) {
                return next();
            }
        }
    }


    // Otherwise, if it's mode:SEB display the instructions
    if ('authz_result' in res.locals && res.locals.authz_result.mode == 'SEB') {

        // Generate the CSRF-like data to send
        var SEBdata = {
            user_id: res.locals.user.user_id,
            assessment_id: res.locals.assessment.id,
        };

        res.locals.SEBdata = csrf.generateToken(SEBdata, config.secretKey);

        console.dir(res.locals);
        res.locals.SEBUrl = 'seb://' + req.get('host') + '/pl/downloadSEBConfig/';
        return res.render(__dirname + '/SEBAssessmentAccess.ejs', res.locals);
    }

    // Pass-through for everything else
    next();
};
