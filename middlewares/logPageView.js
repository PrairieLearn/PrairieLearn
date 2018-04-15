var ERR = require('async-stacktrace');

var logger = require('../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(pageType) {
    return function(req, res, next) {
        // Return immediately to keep processing the request. We are
        // only going to log, so nothing here will be used to generate
        // the response.
        next();
        
        if (req.method != 'GET') return;
        
        if (!res.locals.user) return;
        if (!res.locals.authn_user) return;

        const user_id = res.locals.user ? res.locals.user.user_id : res.locals.authn_user.user_id;
        // only log if we are the user who owns the viewed page
        if (res.locals.instance_user && res.locals.instance_user.user_id != user_id) return;
        
        var params = {
            authn_user_id: res.locals.authn_user.user_id,
            user_id: user_id,
            course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
            assessment_id: res.locals.assessment ? res.locals.assessment.id : null,
            assessment_instance_id: res.locals.assessment_instance ? res.locals.assessment_instance.id : null,
            question_id: res.locals.question ? res.locals.question.id : null,
            variant_id: res.locals.variant ? res.locals.variant.id : null,
            page_type: pageType,
            path: req.originalUrl,
        };
        sqldb.queryOneRow(sql.log_page_view, params, function(err, _result) {
            if (ERR(err, () => {})) logger.error('error logging page view', err);
            // no callback here
        });
    };
};
