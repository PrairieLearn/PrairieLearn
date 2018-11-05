const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const debug = require('debug')('prairielearn:instructorFileEditor');
const logger = require('../../lib/logger');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');
const tmp = require('tmp');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
const config = require('../../lib/config');
const AWS = require('aws-sdk');

const {
    execFile,
} = require('child_process');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/instructorFileEditorClient.js', (req, res) => {
    debug('Responding to request for /instructorFileEditorClient.js');
    res.sendFile(path.join(__dirname, './instructorFileEditorClient.js'));
});

router.get('/', (req, res, next) => {
    if (_.isEmpty(req.query)) {
        return next(error.make(400, 'no file in query', {
            locals: res.locals,
            body: req.body,
        }));
    }

    let fileEdit = {
        uuid: uuidv4(),
        userID: res.locals.user.user_id,
        courseID: res.locals.course.id,
        coursePath: res.locals.course.path,
        dirName: path.dirname(req.query.file),
        fileName: path.basename(req.query.file),
    };

    const ext = path.extname(req.query.file);
    if (ext == '.json') {
        fileEdit.aceMode = 'json';
    } else if (ext == '.html') {
        fileEdit.aceMode = 'html';
    } else if (ext == '.py') {
        fileEdit.aceMode = 'python';
    } else {
        debug(`Could not find an ace mode to match extension: ${ext}`);
    }

    async.series([
        (callback) => {
            debug('Read original file');
            fs.readFile(path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName), 'utf8', (err, contents) => {
                if (ERR(err, callback)) return;
                fileEdit.origContents = b64EncodeUnicode(contents);
                callback(null);
            });
        },
        (callback) => {
            debug('Get commit hash of original file');
            getCommitHash(fileEdit, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug('Read file edit, if one exists');
            readEdit(fileEdit, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            if (!('editID' in fileEdit)) {
                debug('Create file edit');
                createEdit(fileEdit, fileEdit.origContents, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.locals.fileEdit = fileEdit;
        debug('Render');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));

    let fileEdit = {
        editID: req.body.file_edit_id,
        userID: req.body.file_edit_user_id,
        courseID: req.body.file_edit_course_id,
        dirName: req.body.file_edit_dir_name,
        fileName: req.body.file_edit_file_name,
        coursePath: res.locals.course.path,
        uid: res.locals.user.uid,
    };

    if (req.body.__action == 'save_draft') {
        updateEdit(fileEdit, req.body.file_edit_contents, err => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'revert_to_draft') {
        debug('Revert to draft: reload page to discard changes');
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'revert_to_original') {
        debug('Revert to original: soft-delete file edit from database');
        sqldb.query(sql.soft_delete_file_edit, {
            user_id: fileEdit.userID,
            course_id: fileEdit.courseID,
            dir_name: fileEdit.dirName,
            file_name: fileEdit.fileName,
        }, (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'save_and_sync') {
        debug('Save and sync');
        fileEdit.needToSync = (path.extname(fileEdit.fileName) == '.json');
        async.waterfall([
            (callback) => {
                debug('Save and sync: overwrite file edit');
                updateEdit(fileEdit, req.body.file_edit_contents, err => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                saveAndSync(res.locals, fileEdit, (err, job_sequence_id) => {
                    if (ERR(err, callback)) return;
                    callback(null, job_sequence_id);
                });
            },
        ], (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

function b64EncodeUnicode(str) {
    // (1) use encodeURIComponent to get percent-encoded UTF-8
    // (2) convert percent encodings to raw bytes
    // (3) convert raw bytes to Base64
    return Buffer.from(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
    })).toString('base64');
}

function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(Buffer.from(str, 'base64').toString().split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function getCommitHash(fileEdit, callback) {
    const execOptions = {
        cwd: fileEdit.coursePath,
        env: process.env,
    };
    execFile('git', ['rev-parse', 'HEAD:' + path.join(fileEdit.dirName, fileEdit.fileName)], execOptions, (err, stdout) => {
        if (ERR(err, callback)) return;
        fileEdit.origHash = stdout.trim();
        callback(null);
    });
}

function getS3Key(editID, fileName) {
    return `edit_${editID}/${fileName}`;
}

function readEdit(fileEdit, callback) {
    async.series([
        (callback) => {
            debug('Query database for file edit');
            sqldb.query(sql.select_file_edit, {
                user_id: fileEdit.userID,
                course_id: fileEdit.courseID,
                dir_name: fileEdit.dirName,
                file_name: fileEdit.fileName,
            }, (err, result) => {
                if (ERR(err, callback)) return;
                if (result.rows.length > 0) {

                    debug(`Found file edit with id ${result.rows[0].id}`);
                    if (result.rows[0].commit_hash != fileEdit.origHash) {
                        fileEdit.didFindOutdated = true;
                    }

                    debug('Read contents of file edit');
                    if (config.fileEditorUseAws) {
                        const params = {
                            Bucket: config.fileEditorS3Bucket,
                            Key: getS3Key(result.rows[0].id, fileEdit.fileName),
                        };
                        const s3 = new AWS.S3();
                        s3.getObject(params, (err, data) => {
                            if (ERR(err, callback)) return;
                            fileEdit.editContents = b64EncodeUnicode(data.Body);
                            fileEdit.editID = result.rows[0].id;
                            fileEdit.didReadEdit = true;
                            callback(null);
                        });
                    } else {
                        fileEdit.localTmpDir = result.rows[0].local_tmp_dir;
                        const fullPath = path.join(fileEdit.localTmpDir, fileEdit.fileName);
                        fs.readFile(fullPath, 'utf8', (err, contents) => {
                            if (ERR(err, callback)) return;
                            debug(`Got contents from ${fullPath}`);
                            fileEdit.editContents = b64EncodeUnicode(contents);
                            fileEdit.editID = result.rows[0].id;
                            fileEdit.didReadEdit = true;
                            callback(null);
                        });
                    }

                } else {
                    callback(null);
                }
            });
        },
    ], (err) => {
        if (err) {
            // If there was an error - for any reason - we soft-delete the
            // file edit from the database. We do this because our priority
            // is to make sure the user isn't trapped with a file edit that
            // they cannot read and also cannot soft-delete. We accept the
            // risk (for now) that the user may lose their saved changes.
            debug('Soft-delete file edit from db (error when trying to read file edit)');
            sqldb.query(sql.soft_delete_file_edit, {
                user_id: fileEdit.userID,
                course_id: fileEdit.courseID,
                dir_name: fileEdit.dirName,
                file_name: fileEdit.fileName,
            }, (deleteErr) => {
                if (ERR(deleteErr, callback)) return;
                if (ERR(err, callback)) return;
                // Should never get to this line (we know err is non-null)
                callback(null);
            });
        } else {
            callback(null);
        }
    });
}

function updateEdit(fileEdit, contents, callback) {
    async.series([
        (callback) => {
            debug('Query database for file edit');
            sqldb.query(sql.select_file_edit, {
                user_id: fileEdit.userID,
                course_id: fileEdit.courseID,
                dir_name: fileEdit.dirName,
                file_name: fileEdit.fileName,
            }, (err, result) => {
                if (ERR(err, callback)) return;
                if (result.rows.length > 0) {
                    debug(`Found file edit with id ${result.rows[0].id}`);
                    fileEdit.editID = result.rows[0].id;
                    fileEdit.editHash = result.rows[0].commit_hash;
                    if (config.fileEditorUseAws) {
                        fileEdit.s3_bucket = result.rows[0].s3_bucket;
                    } else {
                        fileEdit.localTmpDir = result.rows[0].local_tmp_dir;
                    }
                    callback(null);
                } else {
                    debug('Failed to find file edit in db');
                    callback(new Error('Failed to find draft in database'));
                }
            });
        },
        (callback) => {
            debug('Save draft: overwrite file edit');
            writeEdit(fileEdit, contents, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function createEdit(fileEdit, contents, callback) {
    async.series([
        (callback) => {
            if (config.fileEditorUseAws) {
                fileEdit.s3_bucket = config.fileEditorS3Bucket;
                callback(null);
            } else {
                tmp.dir((err, path) => {
                    if (ERR(err, callback)) return;
                    debug(`Created temporary directory at ${path}`);
                    fileEdit.localTmpDir = path;
                    callback(null);
                });
            }
        },
        (callback) => {
            const params = {
                user_id: fileEdit.userID,
                course_id: fileEdit.courseID,
                dir_name: fileEdit.dirName,
                file_name: fileEdit.fileName,
                commit_hash: fileEdit.origHash,
                local_tmp_dir: fileEdit.localTmpDir || null,
                s3_bucket: fileEdit.s3_bucket || null,
            };
            debug(`Insert file edit into db: ${params.user_id}, ${params.course_id}, ${params.dir_name}, ${params.file_name}`);
            sqldb.queryOneRow(sql.insert_file_edit, params, (err, result) => {
                if (ERR(err, callback)) return;
                fileEdit.editID = result.rows[0].id;
                debug(`Created file edit in database with id ${fileEdit.editID}`);
                callback(null);
            });
        },
        (callback) => {
            debug('Write contents to file edit');
            writeEdit(fileEdit, contents, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function writeEdit(fileEdit, contents, callback) {
    if (config.fileEditorUseAws) {
        const params = {
            Bucket: fileEdit.s3_bucket,
            Key: getS3Key(fileEdit.editID, fileEdit.fileName),
            Body: b64DecodeUnicode(contents),
        };
        const s3 = new AWS.S3();
        s3.putObject(params, (err) => {
            if (ERR(err, callback)) return;
            debug(`Wrote file edit to bucket ${params.Bucket} at key ${params.Key} on S3`);
            fileEdit.editContents = contents;
            fileEdit.didWriteEdit = true;
            callback(null);
        });
    } else {
        const fullPath = path.join(fileEdit.localTmpDir, fileEdit.fileName);
        fs.writeFile(fullPath, b64DecodeUnicode(contents), 'utf8', (err) => {
            if (ERR(err, callback)) return;
            debug(`Wrote file edit to ${fullPath}`);
            fileEdit.editContents = contents;
            fileEdit.didWriteEdit = true;
            callback(null);
        });
    }
}

function saveAndSync(locals, fileEdit, callback) {
    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'save_and_sync',
        description: 'Push to remote git repository',
        courseDir: locals.course.path,
    };
    serverJobs.createJobSequence(options, (err, job_sequence_id) => {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        let gitEnv = process.env;
        if (config.gitSshCommand != null) {
            gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
        }

        let courseLock;

        let jobSequenceHasFailed = false;
        let showHelpJob = false;
        let showHelpMsg = '';

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        const _lock = () => {
            debug('create job: lock');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Lock',
                job_sequence_id: job_sequence_id,
                on_success: _checkHash,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                const lockName = 'coursedir:' + options.courseDir;
                job.verbose(`Trying lock ${lockName}`);
                namedLocks.tryLock(lockName, (err, lock) => {
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

        const _checkHash = () => {
            debug('create job: checkHash');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Check commit hash',
                job_sequence_id: job_sequence_id,
                on_success: _writeFile,
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                job.verbose('Get commit hash of original file');
                getCommitHash(fileEdit, (err) => {
                    if (err) {
                        job.fail(err);
                    } else if (fileEdit.editHash == fileEdit.origHash) {
                        job.verbose('The commit hash has not changed since you started editing');
                        job.succeed();
                    } else {
                        job.fail(new Error(`Outdated commit hash. The file in the repo is ahead of the file on which your saved draft is based.`));
                    }
                });
            });
        };

        const _writeFile = () => {
            debug('create job: writeFile');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Write saved draft to disk',
                job_sequence_id: job_sequence_id,
                on_success: _unstage,
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                job.verbose('Trying to write file');
                const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
                fs.writeFile(fullPath, b64DecodeUnicode(fileEdit.editContents), 'utf8', (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        debug(`Wrote file to ${fullPath}`);
                        job.verbose(`Wrote file to ${fullPath}`);
                        job.succeed();
                    }
                });
            });
        };

        const _unstage = function() {
            debug('create job: unstage');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'push_to_remote',
                description: 'Unstage all changes',
                command: 'git',
                arguments: ['reset'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _add,
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _add = function() {
            debug('create job: add');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'push_to_remote',
                description: 'Stage changes to file being edited',
                command: 'git',
                arguments: ['add', path.join(fileEdit.dirName, fileEdit.fileName)],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _commit,
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _commit = function() {
            debug('create job: commit');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'push_to_remote',
                description: 'Commit changes',
                command: 'git',
                arguments: ['commit', '-m', `"in-browser change to ${fileEdit.fileName} by ${fileEdit.uid}"`],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _push,
                on_error: _cleanupAfterCommit,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _push = function() {
            debug('create job: push');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'push_to_remote',
                description: 'Push to remote',
                command: 'git',
                arguments: ['push'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _unlock,
                on_error: _cleanupAfterPush,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _unlock = () => {
            debug('create job: unlock');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Unlock',
                job_sequence_id: job_sequence_id,
                on_success: (jobSequenceHasFailed ? _help : _deleteSavedDraft),
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
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

        const _deleteSavedDraft = () => {
            debug('create job: deleteSavedDraft');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Delete saved draft',
                job_sequence_id: job_sequence_id,
                on_success: _updateCommitHash,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                sqldb.query(sql.soft_delete_file_edit, {
                    user_id: fileEdit.userID,
                    course_id: fileEdit.courseID,
                    dir_name: fileEdit.dirName,
                    file_name: fileEdit.fileName,
                }, (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.verbose('Deleted saved draft');
                        job.succeed();
                    }
                });
            });
        };

        const _updateCommitHash = () => {
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
                ERR(err, (e) => logger.error(e));
                if (fileEdit.needToSync) {
                    _syncFromDisk();
                } else {
                    _reloadQuestionServers();
                }
            });
        };

        const _syncFromDisk = () => {
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'sync_from_disk',
                description: 'Sync course',
                job_sequence_id: job_sequence_id,
                on_success: _reloadQuestionServers,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
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
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'reload_question_servers',
                description: 'Reload server.js code (for v2 questions)',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
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

        const _cleanupAfterPush = (id) => {
            debug(`Job id ${id} has failed (this was a git push)`);
            jobSequenceHasFailed = true;
            showHelpJob = true;
            showHelpMsg = 'Failed to push. The most likely cause is that another\n'
                        + 'user made changes to other course files while you were\n'
                        + 'editing. To confirm, look for the phrase "Updates were\n'
                        + 'rejected because the remote contains work that you do not\n'
                        + 'have locally" in the log above. In this case, you can:\n\n'
                        + ' (1) Sync the course\n'
                        + ' (2) Resume editing your draft\n'
                        + ' (3) Save and sync your draft\n\n'
                        + 'It is possible that another user made changes to the\n'
                        + 'file that you were editing, in particular. In this case,\n'
                        + 'when you resume editing your draft, you will see a\n'
                        + 'warning that will tell you how to proceed without losing\n'
                        + 'any of your changes.';
            debug('create job: roll back commit');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'push_to_remote',
                description: 'Roll back commit',
                command: 'git',
                arguments: ['reset', '--hard', 'HEAD~1'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _unlock,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _cleanupAfterCommit = (id) => {
            debug(`Job id ${id} has failed (this was a git commit)`);
            jobSequenceHasFailed = true;
            showHelpJob = true;
            showHelpMsg = 'Failed to commit changes. The most likely cause is\n'
                        + 'that there were no changes to commit. To confirm, look\n'
                        + 'for the phrase "Your branch is up to date" in the log\n'
                        + 'above. In this case, you can simply return to the\n'
                        + 'previous page to start editing.';
            _unlock();
        };

        const _cleanup = (id) => {
            debug(`Job id ${id} has failed`);
            jobSequenceHasFailed = true;
            _unlock();
        };

        const _help = () => {
            if (showHelpJob) {
                debug('create job: help');
                const jobOptions = {
                    course_id: options.course_id,
                    user_id: options.user_id,
                    authn_user_id: options.authn_user_id,
                    type: 'push_to_remote',
                    description: 'Help',
                    job_sequence_id: job_sequence_id,
                    no_job_sequence_update: true,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, (err, job) => {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }

                    job.verbose(showHelpMsg);
                    job.succeed();

                    serverJobs.failJobSequence(job_sequence_id);
                });
            } else {
                serverJobs.failJobSequence(job_sequence_id);
            }
        };

        _lock();
    });
}

module.exports = router;
