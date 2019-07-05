var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib').error;
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {

    var params = {
        course_instance_id: res.locals.course_instance.id,
    };

    sqldb.query(sql.lti_data, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    var params;
    if (req.body.__action == 'lti_new_cred') {
        params = {
            key: 'K' + randomString(),
            secret: 'S' + randomString(),
            course_instance_id: res.locals.course_instance.id,
        };
        sqldb.query(sql.insert_cred, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });

    } else if (req.body.__action == 'lti_del_cred') {
        params = {
            id: req.body.lti_link_id,
            ci_id: res.locals.course_instance.id,
        };
        sqldb.query(sql.delete_cred, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });

    } else if (req.body.__action == 'lti_link_target') {
        var newAssessment = null;
        if (req.body.newAssessment != '') {
            newAssessment = req.body.newAssessment;
        }

        params = {
            assessment_id: newAssessment,
            id: req.body.lti_link_id,
            ci_id: res.locals.course_instance.id,
        };
        sqldb.query(sql.update_link, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;

function randomString() {
    var len = 10;
    return Math.random().toString(36).substring(2,len) + Math.random().toString(36).substring(2,len);
}
