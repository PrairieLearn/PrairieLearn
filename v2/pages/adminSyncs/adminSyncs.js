var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {course_id: res.locals.course.id};
    sqldb.query(sql.select_sync_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequences = result.rows;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_admin_edit) return next();
    if (req.body.postAction == 'pull') {
        

        
        var success = function(job_id) {
            var jobOptions = {
                course_id: res.locals.course.id,
                user_id: res.locals.user.id,
                authn_user_id: res.locals.authz_data.authn_user.id,
                type: 'SyncFromDisk',
                parent_job_id: job_id,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                syncFromDisk(res.locals.course.path, job, function(err) {
                    job.completeParent();
                });
            });
        }

        var jobOptions = {
            course_id: res.locals.course.id,
            user_id: res.locals.user.id,
            authn_user_id: res.locals.authz_data.authn_user.id,
            type: 'Sync',
            command: 'git',
            arguments: ['pull', '--force', 'origin', 'master'],
            working_directory: res.locals.course.path,
            on_success: success,
        };
        serverJobs.spawnJob(jobOptions, function(err, job) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/admin/sync/' + job.id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
