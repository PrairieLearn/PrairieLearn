var ERR = require('async-stacktrace');

var logger = require('../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(pageType) {
    return function(req, res, next) {
        if (req.method != 'GET') return;

        if (!res.locals.user) return;
        if (!res.locals.authn_user) return;

        const user_id = res.locals.user ? res.locals.user.user_id : res.locals.authn_user.user_id;

        // Originally, we opted to only record page views for assessments if
        // the authn'ed user is also the owner of the assessment instance.
        // However, we now track all page views, so be sure to filter by
        // authn_user_id if you only want page views from the student taking
        // the assessment.

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
        sqldb.queryOneRow(sql.log_page_view, params, function(err, result) {
            res.locals.page_view_id = result.rows[0].id;
            if (ERR(err, (e) => logger.error('error logging page view', e)));
            next();
        });
    };
};
