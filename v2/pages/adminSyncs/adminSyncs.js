var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {course_id: res.locals.course.id};
    sqldb.query(sql.select_sync_jobs, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.jobs = result.rows;
    
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_admin_edit) return next();
    if (req.body.postAction == 'pull') {
        var jobOptions = {
            course_instance_id: res.locals.course_instance.id,
            user_id: res.locals.user.id,
            authn_user_id: res.locals.authz_data.authn_user.id,
            type: 'Sync',
            command: 'git',
            arguments: ['pull', '--force', 'origin', 'master'],
            working_directory: res.locals.course.path,
        };
        jobServer.startJob(jobOptions, function(err, job_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/admin/sync/' + job_id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
