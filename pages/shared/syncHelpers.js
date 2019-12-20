const ERR = require('async-stacktrace');
const fs = require('fs');
const logger = require('../../lib/logger');
const config = require('../../lib/config');
const serverJobs = require('../../lib/server-jobs');
const syncFromDisk = require('../../sync/syncFromDisk');
const requireFrontend = require('../../lib/require-frontend');
const courseUtil = require('../../lib/courseUtil');


module.exports.pullAndUpdate = function(locals, callback) {
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
        // We will start with either 1A or 1B below to either clone or
        // update the content.

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
                on_success: syncStage2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const syncStage1B = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'fetch_from_git',
                description: 'Fetch from remote git repository',
                command: 'git',
                arguments: ['fetch'],
                working_directory: locals.course.path,
                env: gitEnv,
                on_success: syncStage1B2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const syncStage1B2 = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'clean_git_repo',
                description: 'Clean local files not in remote git repository',
                command: 'git',
                arguments: ['clean', '-fdx'],
                working_directory: locals.course.path,
                env: gitEnv,
                on_success: syncStage1B3,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const syncStage1B3 = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                job_sequence_id: job_sequence_id,
                type: 'reset_from_git',
                description: 'Reset state to remote git repository',
                command: 'git',
                arguments: ['reset', '--hard', 'origin/master'],
                working_directory: locals.course.path,
                env: gitEnv,
                on_success: syncStage2,
            };
            serverJobs.spawnJob(jobOptions);
        };

        // After either cloning or fetching and resetting from Git, we'll need
        // to load and store the current commit hash in the database
        const syncStage2 = () => {
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
                ERR(err, (e) => logger.error(e));
                syncStage3();
            });
        };


        const syncStage3 = function() {
            const jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
                type: 'sync_from_disk',
                description: 'Sync git repository to database',
                job_sequence_id: job_sequence_id,
                on_success: syncStage4,
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

        const syncStage4 = function() {
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
                // path exists, start with 'git fetch' and reset to latest with 'git reset'
                syncStage1B();
            }
        });
    });
};

module.exports.gitStatus = function(locals, callback) {
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
