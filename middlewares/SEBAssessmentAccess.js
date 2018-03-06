var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var sha256 = require('crypto-js/sha256');

module.exports = function(req, res, next) {

    console.log(req.headers);
    var absoluteURL = req.protocol + '://' + req.get('host') + req.originalUrl;

    // Should do someting here if the exam is closed to tell the user?

    if ('x-safeexambrowser-requesthash' in req.headers
        || req.headers['user-agent'].includes("SEB/2")) {

        res.locals.authz_data.mode = 'SEB';

        var requesthash = req.headers['x-safeexambrowser-requesthash'] || null;

        // Pass through to next() if one of the keys matches
        if ('assessment' in res.locals
            && 'authz_result' in res.locals) {

            console.dir(res.locals.assessment);
            console.dir(res.locals.authz_result);

            var SEBvalid = false;
            _.each(res.locals.authz_result.seb_keys, function(key) {

                var ourhash = sha256(absoluteURL + key).toString();

                console.log("ours", ourhash);
                console.log("clin", requesthash);

                if (ourhash == requesthash) {
                    SEBvalid = true;
                    return false;
                }
            });
            if (SEBvalid) { return next(); }

            if (req.headers['user-agent'].includes(res.locals.assessment.uuid)) {
                return next();
            }
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

        res.locals.SEBUrl = 'seb://' + req.get('host') + '/pl/downloadSEBConfig/' + res.locals.assessment.id;
        return res.render('./shared/SEBAssessmentAccess.ejs', res.locals);
    }
    next();
};
