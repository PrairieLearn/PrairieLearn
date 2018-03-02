var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var sha256 = require('crypto-js/sha256');

var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

//var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {

    var absoluteURL = req.protocol + '://' + req.get('host') + req.originalUrl;
    //console.log(absoluteURL);
    var BEK = 'a6a44d0883c448bdcf58a9134fb9fb00b67b08237dc89c424844b1f68b89d7d7';

    // Should do someting here if the exam is closed to tell the user?

    if ('x-safeexambrowser-requesthash' in req.headers) {

        // Just having the header sets the authz mode to SEB.
        res.locals.authz_data.mode = 'SEB';

        if ('assessment' in res.locals) {
            console.dir(res.locals.assessment);
            console.dir(res.locals.authz_result);

            var hashstring = absoluteURL + BEK;
            var ourhash = sha256(hashstring).toString();

            console.log(ourhash);
            console.log(req.headers['x-safeexambrowser-requesthash']);

            if (ourhash == req.headers['x-safeexambrowser-requesthash']) {
                return next();
            }
        }
    }
    //console.log(res.locals);
//'x-safeexambrowser-requesthash': '8ac09563c424aca13b9023e216f7a1bc5784e4a646bf45b66e8d1235778d7075',
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

                if ('SEBConfig' in req.query) {
                    var filename = 'config.seb';
                    var sebFile = path.join(
                            res.locals.course.path,
                            'courseInstances',
                            res.locals.course_instance.short_name,
                            'assessments',
                            res.locals.assessment.tid,
                            );
                    return res.sendFile(filename, {root: sebFile}, function(err) {
                        if (ERR(err, next)) return;
                    });

                }
                res.locals.SEBUrl = 'seb://' + req.get('host') + req.originalUrl;
                console.log(res.locals.SEBUrl);
                return res.render('./shared/SEBAssessmentAccess.ejs', res.locals);
    }
    next();
};
