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
    exec,
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
        debug(`Could not find an ace mode to match extension: ${ext}`)
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
    exec('git rev-parse HEAD:' + path.join(fileEdit.dirName, fileEdit.fileName), execOptions, (err, stdout) => {
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
                    if (result.rows[0].commit_hash == fileEdit.origHash) {
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
                        callback(new Error('Outdated commit hash'));
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
                fileEdit.didDeleteEdit = true;
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
    };
    serverJobs.createJobSequence(options, (err, job_sequence_id) => {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        const _pushToRemote = () => {
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'push_to_remote',
                description: 'Push',
                job_sequence_id: job_sequence_id,
                on_success: _updateCommitHash,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }
                pushToRemoteGitRepository(locals.course.path, fileEdit, job, (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        const _updateCommitHash = () => {
            courseUtil.updateCourseCommitHash(locals.course, (err) => {
                ERR(err, (e) => logger.error(e));
                _syncFromDisk();
            });
        };

        const _syncFromDisk = () => {
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'sync_from_disk',
                description: 'Sync git repository to database',
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
                description: 'Reload question server.js code',
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

        _pushToRemote();
    });
}


function pushToRemoteGitRepository(courseDir, fileEdit, job, callback) {
    const lockName = 'coursedir:' + courseDir;
    job.verbose(`Trying lock ${lockName}`);
    namedLocks.tryLock(lockName, (err, lock) => {
        if (ERR(err, callback)) return;
        if (lock == null) {
            job.verbose(`Did not acquire lock ${lockName}`);
            callback(new Error(`Another user is already syncing or modifying the course: ${courseDir}`));
        } else {
            job.verbose(`Acquired lock ${lockName}`);
            async.series([
                (callback) => {
                    pushToRemoteGitRepositoryWithLock(courseDir, fileEdit, job, (err) => {
                        namedLocks.releaseLock(lock, (lockErr) => {
                            if (ERR(lockErr, callback)) return;
                            if (ERR(err, callback)) return;
                            job.verbose(`Released lock ${lockName}`);
                            callback(null);
                        });
                    });
                },
                (callback) => {
                    job.verbose('Delete saved draft');
                    sqldb.query(sql.soft_delete_file_edit, {
                        user_id: fileEdit.userID,
                        course_id: fileEdit.courseID,
                        dir_name: fileEdit.dirName,
                        file_name: fileEdit.fileName,
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }
    });
}

function pushToRemoteGitRepositoryWithLock(courseDir, fileEdit, job, callback) {
    async.series([
        (callback) => {
            job.verbose('Get commit hash of original file');
            getCommitHash(fileEdit, (err) => {
                if (ERR(err, callback)) return;
                job.verbose('Check that commit hash has not changed');
                if (fileEdit.editHash == fileEdit.origHash) {
                    callback(null);
                } else {
                    callback(new Error(`Outdated commit hash (file in repo is ahead of file on which draft is based)`));
                }
            });
        },
        (callback) => {
            job.verbose('Write file to disk');
            const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
            fs.writeFile(fullPath, b64DecodeUnicode(fileEdit.editContents), 'utf8', (err) => {
                if (ERR(err, callback)) return;
                debug(`Wrote file to ${fullPath}`);
                callback(null);
            });
        },
        (callback) => {
            // Do this just in case...
            job.verbose('Unstage all other changes');
            const execOptions = {
                cwd: fileEdit.coursePath,
                env: process.env,
            };
            exec(`git reset`, execOptions, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            job.verbose('Add');
            const execOptions = {
                cwd: fileEdit.coursePath,
                env: process.env,
            };
            exec(`git add ${path.join(fileEdit.dirName, fileEdit.fileName)}`, execOptions, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            job.verbose('Commit');
            const execOptions = {
                cwd: fileEdit.coursePath,
                env: process.env,
            };
            exec(`git diff-index --quiet HEAD || git commit -m "in-browser change to ${fileEdit.fileName} by ${fileEdit.uid}"`, execOptions, (err, stdout) => {
                if (ERR(err, callback)) {
                    debug(err);
                    debug(stdout);
                    return;
                }
                callback(null);
            });
        },
        (callback) => {
            job.verbose('Push');
            const execOptions = {
                cwd: fileEdit.coursePath,
                env: process.env,
            };
            exec(`git push`, execOptions, (err) => {
                if (err) {
                    debug('Error on git push - roll back the commit and abort');
                    const execOptions = {
                        cwd: fileEdit.coursePath,
                        env: process.env,
                    };
                    exec(`git reset --hard HEAD~1`, execOptions, (resetErr) => {
                        if (ERR(resetErr, callback)) return;
                        ERR(err, callback);
                        return;
                    });
                } else {
                    callback(null);
                }
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

module.exports = router;
