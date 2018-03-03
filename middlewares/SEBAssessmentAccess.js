var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var sha256 = require('crypto-js/sha256');

module.exports = function(req, res, next) {

    var absoluteURL = req.protocol + '://' + req.get('host') + req.originalUrl;

    // Should do someting here if the exam is closed to tell the user?

    if ('x-safeexambrowser-requesthash' in req.headers) {

        // Just having the header sets the authz mode to SEB.
        res.locals.authz_data.mode = 'SEB';

        // Pass through to next() if one of the keys matches
        if ('assessment' in res.locals
            && 'authz_result' in res.locals) {

            //console.dir(res.locals.assessment);
            //console.dir(res.locals.authz_result);

            var SEBvalid = false;
            _.each(res.locals.authz_result.seb_keys, function(key) {

                var ourhash = sha256(absoluteURL + key).toString();

                //console.log("ours", ourhash);
                //console.log("clin", req.headers['x-safeexambrowser-requesthash']);

                if (ourhash == req.headers['x-safeexambrowser-requesthash']) {
                    SEBvalid = true;
                    return false;
                }
            });

            if (SEBvalid) { return next(); }
        }
    }

    // Otherwise, if it's mode:SEB display the instructions
    if ('authz_result' in res.locals
        && res.locals.authz_result.mode == 'SEB') {
        //&& res.locals.authz_result.mode != res.locals.authz_data.mode) {

        if ('downloadSEBConfig' in req.query) {
            var filename = 'config.seb';
            var sebFile = path.join(
                res.locals.course.path,
                'courseInstances',
                res.locals.course_instance.short_name,
                'assessments',
                res.locals.assessment.tid,
                filename
            );

            return res.download(sebFile, function(err) {
                if (ERR(err, next)) return;
            });
        }

        /*
        if ('SEBConfig' in req.query) {
            var filename = 'config.seb';
            var sebFile = path.join(
                res.locals.course.path,
                'courseInstances',
                res.locals.course_instance.short_name,
                'assessments',
                res.locals.assessment.tid
            );
            return res.sendFile(filename, {root: sebFile}, function(err) {
                if (ERR(err, next)) return;
            });

        }
        */
        res.locals.SEBUrl = 'seb://' + req.get('host') + req.originalUrl;
        return res.render('./shared/SEBAssessmentAccess.ejs', res.locals);
    }
    next();
};
