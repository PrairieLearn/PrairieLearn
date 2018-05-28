const ERR = require('async-stacktrace');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/prairielib/error');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');

const logger = require('../../lib/logger');
const config = require('../../lib/config');
const serverJobs = require('../../lib/server-jobs');
const syncFromDisk = require('../../sync/syncFromDisk');
const requireFrontend = require('../../lib/require-frontend');
const courseUtil = require('../../lib/courseUtil');


const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    const params = {course_id: res.locals.course.id};
    sqlDb.query(sql.select_sync_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequences = result.rows;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

const pullAndUpdate = function(locals, callback) {
    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync',
        description: 'Pull from remote git repository',
    };
    serverJobs.createJobSequence(options, function(err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        const gitEnv = process.env;
        if (config.gitSshCommand != null) {
            gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
        }

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        // First define the jobs.
        //
        // After either cloning or pulling from Git, we'll need to load and
        // store the current commit hash in the database
        const updateCommitHash = () => {
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
                ERR(err, (e) => logger.error(e));
                syncStage2();
            });
        };

        // We will start with either 1A or 1B below.

        const syncStage1A = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'clone_from_git',
                description: 'Clone from remote git repository',
                command: 'git',
                arguments: ['clone', locals.course.repository, locals.course.path],
                env: gitEnv,
                on_success: updateCommitHash,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const syncStage1B = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'pull_from_git',
                description: 'Pull from remote git repository',
                command: 'git',
                arguments: ['pull', '--force'],
                working_directory: locals.course.path,
                env: gitEnv,
                on_success: updateCommitHash,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const syncStage2 = function() {
            const jobOptions = {
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

        const syncStage3 = function() {
            const jobOptions = {
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
                const coursePath = locals.course.path;
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

const gitStatus = function(locals, callback) {
    const options = {
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

        const statusStage1 = function() {
            const jobOptions = {
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

        const statusStage2 = function() {
            const jobOptions = {
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
