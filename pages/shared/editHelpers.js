const ERR = require('async-stacktrace');
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const debug = require('debug')('prairielearn:editHelpers');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

function doEdit(edit, locals, callback) {
    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync',
        description: edit.description,
        courseDir: locals.course.path,
    };

    serverJobs.createJobSequence(options, (err, job_sequence_id) => {
        // Return immediately if we fail to create a job sequence
        if (ERR(err, callback)) return;

        let gitEnv = process.env;
        if (config.gitSshCommand != null) {
            gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
        }

        let courseLock;
        let jobSequenceHasFailed = false;

        const _lock = () => {
            debug(`${job_sequence_id}: _lock`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'lock',
                description: 'Lock',
                job_sequence_id: job_sequence_id,
                on_success: (config.fileEditorUseGit ? () => {_clean(_write, _unlock)} : _write),
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }

                const lockName = 'coursedir:' + options.courseDir;
                job.verbose(`Trying lock ${lockName}`);
                namedLocks.waitLock(lockName, {timeout: 5000}, (err, lock) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        job.fail(err);
                    } else if (lock == null) {
                        job.verbose(`Did not acquire lock ${lockName}`);
                        job.fail(new Error(`Another user is already syncing or modifying the course: ${options.courseDir}`));
                    } else {
                        courseLock = lock;
                        job.verbose(`Acquired lock ${lockName}`);
                        job.succeed();
                    }
                    return;
                });
            });
        };

        const _clean = (on_success, on_failure) => {
            debug(`${job_sequence_id}: _clean`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'clean_git_repo',
                description: 'Clean local files not in remote git repository',
                command: 'git',
                arguments: ['clean', '-fdx'],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: () => {_reset(on_success, on_failure)},
                on_error: on_failure,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _reset = (on_success, on_failure) => {
            debug(`${job_sequence_id}: _reset`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'reset_from_git',
                description: 'Reset state to remote git repository',
                command: 'git',
                arguments: ['reset', '--hard', 'origin/master'],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: on_success,
                on_error: on_failure,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _write = () => {
            debug(`${job_sequence_id}: _write`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'write',
                description: 'Write to disk',
                job_sequence_id: job_sequence_id,
                on_success: (config.fileEditorUseGit ? _add : _unlock),
                on_error: (config.fileEditorUseGit ? _cleanupAfterWrite : _cleanup),
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }

                edit.write(edit, (err) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                })
            });
        };

        const _add = function() {
            debug(`${job_sequence_id}: _add`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_add',
                description: 'Stage changes',
                command: 'git',
                arguments: ['add'].concat(edit.pathsToAdd),
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _commit,
                on_error: _cleanupAfterWrite,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _commit = function() {
            debug(`${job_sequence_id}: _commit`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_commit',
                description: 'Commit changes',
                command: 'git',
                arguments: [
                    '-c', `user.name="${edit.user_name}"`,
                    '-c', `user.email="${edit.uid}"`,
                    'commit', '-m', edit.commitMessage,
                ],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _push,
                on_error: _cleanupAfterWrite,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _push = function() {
            debug(`${job_sequence_id}: _push`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_push',
                description: 'Push to remote',
                command: 'git',
                arguments: ['push'],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _unlock,
                on_error: _cleanupAfterCommit,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _unlock = () => {
            debug(`${job_sequence_id}: _unlock`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'unlock',
                description: 'Unlock',
                job_sequence_id: job_sequence_id,
                on_success: (jobSequenceHasFailed ? _finishWithFailure : _updateCommitHash),
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }

                namedLocks.releaseLock(courseLock, (err) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        job.fail(err);
                    } else {
                        job.verbose(`Released lock`);
                        job.succeed();
                    }
                });
            });
        };

        const _updateCommitHash = () => {
            debug(`${job_sequence_id}: _updateCommitHash`);
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
                ERR(err, (e) => logger.error(e));
                _syncFromDisk();
            });
        };

        const _syncFromDisk = () => {
            debug(`${job_sequence_id}: _syncFromDisk`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'sync_from_disk',
                description: 'Sync course',
                job_sequence_id: job_sequence_id,
                on_success: _reloadQuestionServers,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }
                syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, (err) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        const _reloadQuestionServers = () => {
            debug(`${job_sequence_id}: _reloadQuestionServers`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'reload_question_servers',
                description: 'Reload server.js code (for v2 questions)',
                job_sequence_id: job_sequence_id,
                on_success: _finishWithSuccess,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }
                const coursePath = locals.course.path;
                requireFrontend.undefQuestionServers(coursePath, job, (err) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        const _cleanupAfterCommit = (id) => {
            debug(`Job id ${id} has failed (after git commit)`);
            jobSequenceHasFailed = true;
            debug(`${job_sequence_id}: _cleanupAfterCommit`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_reset',
                description: 'Roll back commit',
                command: 'git',
                arguments: ['reset', '--hard', 'HEAD~1'],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _unlock,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _cleanupAfterWrite = (id) => {
            debug(`Job id ${id} has failed (after write)`);
            jobSequenceHasFailed = true;
            _clean(_unlock, _finishWithFailure);
        };

        const _cleanup = (id) => {
            debug(`Job id ${id} has failed`);
            jobSequenceHasFailed = true;
            _unlock();
        };

        const _finishWithSuccess = () => {
            debug(`${job_sequence_id}: _finishWithSuccess`);

            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'finish',
                description: 'Finish job sequence',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (e) => logger.error(e))) {
                    _finishWithFailure();
                    return;
                }

                job.verbose('Finished with success');
                job.succeed();
                callback(null, job_sequence_id);
            });
        };

        const _finishWithFailure = () => {
            debug(`${job_sequence_id}: _finishWithFailure`);
            serverJobs.failJobSequence(job_sequence_id);
            callback(new Error('edit failed'), job_sequence_id);
        };

        _lock();
    });
}

module.exports = {
    doEdit,
};
