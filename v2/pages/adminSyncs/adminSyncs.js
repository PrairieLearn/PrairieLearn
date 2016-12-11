var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');
var requireFrontend = require('../../lib/require-frontend');
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

var pullAndUpdate = function(locals, callback) {
    var params = {
        course_id: locals.course.id,
        user_id: locals.user.id,
        authn_user_id: locals.authz_data.authn_user.id,
        type: 'Sync',
        description: 'Sync from remote git repository',
    };
    sqldb.queryOneRow(sql.insert_job_sequence, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_sequence_id = result.rows[0].id;
        
        var syncPhase2 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.id,
                authn_user_id: locals.authz_data.authn_user.id,
                type: 'SyncFromDisk',
                description: 'Sync git repository to database',
                job_sequence_id: job_sequence_id,
                on_success: syncPhase3,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                syncFromDisk.syncDiskToSql(locals.course.path, job, function(err) {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        var syncPhase3 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.id,
                authn_user_id: locals.authz_data.authn_user.id,
                type: 'ReloadQuestionServers',
                description: 'Reload question server.js code',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                var coursePath = locals.course.path;
                requireFrontend.undefQuestionServers(coursePath, job, function(err) {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        var jobOptions = {
            course_id: locals.course.id,
            user_id: locals.user.id,
            authn_user_id: locals.authz_data.authn_user.id,
            job_sequence_id: job_sequence_id,
            type: 'PullFromGit',
            description: 'Pull from remote git repository',
            command: 'git',
            arguments: ['pull', '--force', 'origin', 'master'],
            working_directory: locals.course.path,
            on_success: syncPhase2,
        };
        serverJobs.spawnJob(jobOptions, function(err, job) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);
        });
    });
};

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_admin_edit) return next();
    if (req.body.postAction == 'pull') {
        pullAndUpdate(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/admin/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
