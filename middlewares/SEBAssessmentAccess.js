var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');

var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

//var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {

    //console.dir(res.locals);
    //console.dir(res.locals.authz_result);

    // Should do someting here if the exam is closed to tell the user

    if (res.locals.authz_result.mode == 'SEB' &&
        res.locals.authz_result.mode != res.locals.authz_data.mode) {

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

                return res.render('./shared/SEBAssessmentAccess.ejs', res.locals);
    }
    next();
};
