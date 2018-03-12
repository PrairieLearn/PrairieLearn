var ERR = require('async-stacktrace');
var fs = require('fs');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');
var requireFrontend = require('../../lib/require-frontend');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

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
    var options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync',
        description: 'Pull from remote git repository',
    };
    serverJobs.createJobSequence(options, function(err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        // First define the jobs.

        // We will use either 1A or 1B below.

        var syncStage1A = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'clone_from_git',
                description: 'Clone from remote git repository',
                command: 'git',
                arguments: ['clone', locals.course.repository, locals.course.path],
                on_success: syncStage2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        var syncStage1B = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'pull_from_git',
                description: 'Pull from remote git repository',
                command: 'git',
                arguments: ['pull', '--force'],
                working_directory: locals.course.path,
                on_success: syncStage2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        var syncStage2 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                type: 'sync_from_disk',
                description: 'Sync git repository to database',
                job_sequence_id: job_sequence_id,
                on_success: syncStage3,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }
                syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, function(err) {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        var syncStage3 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                type: 'reload_question_servers',
                description: 'Reload question server.js code',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }
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

        // Start the first job.
        fs.access(locals.course.path, function(err) {
            if (err) {
                // path does not exist, start with 'git clone'
                syncStage1A();
            } else {
                // path exists, start with 'git pull'
                syncStage1B();
            }
        });
    });
};

var gitStatus = function(locals, callback) {
    var options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'git_status',
        description: 'Show server git status',
    };
    serverJobs.createJobSequence(options, function(err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        // First define the jobs.

        var statusStage1 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'describe_git',
                description: 'Describe current git HEAD',
                command: 'git',
                arguments: ['show', '--format=fuller', '--quiet', 'HEAD'],
                working_directory: locals.course.path,
                on_success: statusStage2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        var statusStage2 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                type: 'git_history',
                description: 'List git history',
                job_sequence_id: job_sequence_id,
                command: 'git',
                arguments: ['log', '--all', '--graph', '--date=short', '--format=format:%h %cd%d %cn %s'],
                working_directory: locals.course.path,
                last_in_sequence: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        // Start the first job.
        statusStage1();
    });
};

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));
    if (req.body.__action == 'pull') {
        pullAndUpdate(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'status') {
        gitStatus(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
