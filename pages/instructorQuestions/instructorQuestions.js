var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const debug = require('debug')('prairielearn:instructorQuestions');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
const config = require('../../lib/config');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_instance_id: res.locals.course_instance.id,
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {
            course_id: res.locals.course.id,
        };
        sqldb.query(sql.tags, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.all_tags = result.rows;

            var params = {
                course_instance_id: res.locals.course_instance.id,
            };
            sqldb.query(sql.assessments, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.all_assessments = result.rows;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Insufficient permissions'));

    let edit = {
        userID: res.locals.user.user_id,
        courseID: res.locals.course.id,
        title: req.body.questions_insert_title,
        qid: req.body.questions_insert_id,
        coursePath: res.locals.course.path,
        uid: res.locals.user.uid,
        user_name: res.locals.user.name,
        templatePath: path.join(__dirname, '..', '..', 'exampleCourse', 'questions', 'addNumbers'),
        questionPath: path.join(res.locals.course.path, 'questions', req.body.questions_insert_id),
    };

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return next(error.make(400, `attempting to add question to example course`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    if (req.body.__action == 'questions_insert') {
        debug(`Add question\n title: ${req.body.questions_insert_title}\n id: ${req.body.questions_insert_id}`);

        insertQuestion(edit, res.locals, (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

function insertQuestion(edit, locals, callback) {
    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync',
        description: 'Save and sync an in-browser question insert',
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
                on_success: _write,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (err) => logger.info(err))) {
                    _finishWithFailure();
                    return;
                }

                const lockName = 'coursedir:' + options.courseDir;
                job.verbose(`Trying lock ${lockName}`);
                namedLocks.waitLock(lockName, {timeout: 5000}, (err, lock) => {
                    if (err) {
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

        const _write = () => {
            debug(`${job_sequence_id}: _write`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'write',
                description: 'Write new question to disk',
                job_sequence_id: job_sequence_id,
                on_success: (config.fileEditorUseGit ? _unstage : _unlock),
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (ERR(err, (err) => logger.info(err))) {
                    _finishWithFailure();
                    return;
                }

                const infoPath = path.join(edit.questionPath, 'info.json');
                async.waterfall([
                    (callback) => {
                        job.verbose(`Copy template from ${edit.templatePath} to ${edit.questionPath}`);
                        fs.copy(edit.templatePath, edit.questionPath, {overwrite: false, errorOnExist: true}, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    },
                    (callback) => {
                        job.verbose(`Read info.json`);
                        fs.readJson(infoPath, (err, infoJson) => {
                            if (ERR(err, callback)) return;
                            callback(null, infoJson);
                        });
                    },
                    (infoJson, callback) => {
                        job.verbose(`Write info.json with new title and uuid`);
                        infoJson.title = edit.title;
                        infoJson.uuid = uuidv4();
                        fs.writeJson(infoPath, infoJson, {spaces: 4}, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    },
                ], (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        debug(`Wrote question from ${edit.templatePath} to ${edit.questionPath}`);
                        job.succeed();
                    }
                });
            });
        };

        const _unstage = function() {
            debug(`${job_sequence_id}: _unstage`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_reset',
                description: 'Unstage all changes',
                command: 'git',
                arguments: ['reset'],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _add,
                on_error: _cleanupAfterWrite,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _add = function() {
            debug(`${job_sequence_id}: _add`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_add',
                description: 'Stage changes to new question',
                command: 'git',
                arguments: ['add', edit.questionPath],
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
                    'commit', '-m', `in-browser question insert ${edit.questionPath}`,
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
                if (ERR(err, (err) => logger.info(err))) {
                    _finishWithFailure();
                    return;
                }

                namedLocks.releaseLock(courseLock, (err) => {
                    if (err) {
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
                if (ERR(err, (err) => logger.info(err))) {
                    _finishWithFailure();
                    return;
                }
                syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, (err) => {
                    if (err) {
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
                if (ERR(err, (err) => logger.info(err))) {
                    _finishWithFailure();
                    return;
                }
                const coursePath = locals.course.path;
                requireFrontend.undefQuestionServers(coursePath, job, (err) => {
                    if (err) {
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
            debug(`${job_sequence_id}: _cleanupAfterWrite`);
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_rm',
                description: 'Git rm -rf to revert changes to disk',
                command: 'git',
                arguments: ['rm', '-rf', edit.questionPath],
                working_directory: edit.coursePath,
                env: gitEnv,
                on_success: _unlock,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
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
                if (ERR(err, (err) => logger.info(err))) {
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
            // callback(null, job_sequence_id);
            callback(new Error('failed!'), job_sequence_id);
        };

        _lock();
    });
}


module.exports = router;
