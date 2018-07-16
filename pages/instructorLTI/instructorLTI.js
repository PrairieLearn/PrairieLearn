var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();
var async = require('async');

var error = require('@prairielearn/prairielib').error;
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {

    async.series([
        function(callback) {
            // Add / upsert the current link, if there is one
            if ('resource_link_id' in res.locals.authn_data &&
                'context_id' in res.locals.authn_data) {
                var params = {
                    course_instance_id: res.locals.course_instance.id,
                    context_id: res.locals.authn_data.context_id,
                    resource_link_id: res.locals.authn_data.resource_link_id,
                    resource_link_title: res.locals.authn_data.resource_link_title || '',
                    resource_link_description: res.locals.authn_data.resource_link_description || '',
                }
                sqldb.query(sql.upsert_current_link, params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        function(callback) {
            sqldb.query(sql.lti_data, {course_instance_id: res.locals.course_instance.id}, function(err, result) {
                if (ERR(err, next)) return;

                _.assign(res.locals, result.rows[0]);
                callback(null);
            });
        },
    ], function(err, data) {
        if (ERR(err, next)) return;
        //console.log(res.locals);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});


router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'lti_new_cred') {

        var params = {
            key: 'K' + randomString(),
            secret: 'S' + randomString(),
            course_instance_id: res.locals.course_instance.id,
        }
        sqldb.query(sql.insert_cred, params, function(err, result) {
            if (ERR(err, next)) return;

            res.redirect(req.originalUrl);
        });

    } else if (req.body.__action == 'lti_link_target') {

        var newAssessment = null;
        if (req.body.newAssessment != "") {
            newAssessment = req.body.newAssessment;
        }

        // How do I validate they're only updating their courses?
        var params = {
            assessment_id: newAssessment,
            id: req.body.lti_link_id,
        }
        sqldb.query(sql.update_link, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;

function randomString() {
    var len = 8;
    return Math.random().toString(36).substring(2,len) + Math.random().toString(36).substring(2,len);
}
