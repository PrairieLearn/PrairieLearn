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
const sha256 = require('crypto-js/sha256');
const base64url = require('base64url');
const jobSequenceResults = require('../../lib/jobSequenceResults');

const {exec} = require('child_process');

const sql = sqlLoader.loadSqlEquiv(__filename);

function getUrl(baseUrl, filePath) {
    return baseUrl + `?file=${filePath}`;
}

router.get('/instructorFileEditorClient.js', (req, res) => {
    debug('Responding to request for /instructorFileEditorClient.js');
    res.sendFile(path.join(__dirname, './instructorFileEditorClient.js'));
});

router.get('/', (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));

    debug(req.query);

    if (_.isEmpty(req.query)) {
        return next(error.make(400, 'no query', {
            locals: res.locals,
            body: req.body,
        }));
    }

    if (!('file' in req.query)) {
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
        redirectResult: req.query.result,
        redirectUrl: getUrl(req.baseUrl, req.query.file),
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

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return next(error.make(400, `attempting to edit file inside example course: ${req.query.file}`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    // Do not allow users to edit files outside the course
    const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
    const relPath = path.relative(fileEdit.coursePath, fullPath);
    debug(`Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`);
    if (relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)) {
        return next(error.make(400, `attempting to edit file outside course directory: ${req.query.file}`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    async.series([
        (callback) => {
            debug('Read from db')
            readEdit(fileEdit, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug('Read from disk');
            fs.readFile(fullPath, 'utf8', (err, contents) => {
                if (ERR(err, callback)) return;
                fileEdit.diskContents = b64EncodeUnicode(contents);
                fileEdit.diskHash = getHash(fileEdit.diskContents);
                callback(null);
            });
        },
        (callback) => {
            if (fileEdit.jobSequenceId == null) {
                callback(null);
            } else {
                debug('Read job sequence');
                jobSequenceResults.getJobSequence(fileEdit.jobSequenceId, res.locals.course.id, (err, job_sequence) => {
                    if (ERR(err, callback)) return;
                    fileEdit.jobSequence = job_sequence;
                    callback(null);
                });
            }
        },
    ], (err) => {
        if (ERR(err, next)) return;

        fileEdit.doChoiceDialog = false;

        if ('editID' in fileEdit) {
            // There is a recently saved draft ...
            if ((!fileEdit.editPushed) && (fileEdit.editHash != fileEdit.diskHash)) {
                // ...that was not written to disk and that differs from what is on disk.
                fileEdit.doChoiceDialog = true;
                if (fileEdit.origHash == fileEdit.diskHash) {
                    fileEdit.alertChoiceSameHash = true;
                } else {
                    fileEdit.alertChoiceDiffHash = true;
                }
            }

            fileEdit.alertPushSuccess = fileEdit.editPushed;
            fileEdit.alertPushFailure = !fileEdit.editPushed;
        }

        if (!fileEdit.doChoiceDialog) {
            fileEdit.editContents = fileEdit.diskContents;
            fileEdit.origHash = fileEdit.diskHash;
        }

        debug('Render');
        res.locals.fileEdit = fileEdit;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));

    let fileEdit = {
        userID: req.body.file_edit_user_id,
        courseID: req.body.file_edit_course_id,
        dirName: req.body.file_edit_dir_name,
        fileName: req.body.file_edit_file_name,
        origHash: req.body.file_edit_orig_hash,
        coursePath: res.locals.course.path,
        uid: res.locals.user.uid,
        user_name: res.locals.user.name,
        redirectUrl: getUrl(req.baseUrl, path.join(req.body.file_edit_dir_name, req.body.file_edit_file_name)),
    };

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return next(error.make(400, `attempting to edit file inside example course: ${req.query.file}`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    // Do not allow users to edit files outside the course
    const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
    const relPath = path.relative(fileEdit.coursePath, fullPath);
    debug(`Edit file in browser\n fileName: ${fileEdit.fileName}\n coursePath: ${fileEdit.coursePath}\n fullPath: ${fullPath}\n relPath: ${relPath}`);
    if (relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)) {
        return next(error.make(400, `attempting to edit file outside course directory: ${req.query.file}`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    if (req.body.__action == 'discard_draft') {
        debug('Discard Draft');
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'save_and_sync') {
        debug('Save and sync');

        // The "Save and Sync" button is enabled only when changes have been made
        // to the file, so - in principle - it should never be the case that editHash
        // and origHash are the same. We will treat this is a catastrophic error.
        fileEdit.editHash = getHash(req.body.file_edit_contents);
        if (fileEdit.editHash == fileEdit.origHash) {
            return next(error.make(400, `attempting to save a file without having made any changes: ${req.query.file}`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        async.series([
            (callback) => {
                debug('Write edit to db');
                createEdit(fileEdit, req.body.file_edit_contents, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug('Write edit to disk (also push and sync if necessary)');
                saveAndSync(fileEdit, res.locals, (err) => {
                    // If there is an error, log it and pass null to the callback.
                    if (ERR(err, (err) => logger.info(err))) {
                        callback(null);
                        return;
                    }
                    callback(null);
                });
            },
        ], (err) => {
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

function getHash(contents) {
    return base64url.encode(sha256(contents).toString());
}

function getS3Key(editID, fileName) {
    return `edit_${editID}/${fileName}`;
}

function readEdit(fileEdit, callback) {
    selectEdit(fileEdit, (err) => {
        if (ERR(err, callback)) return;
        if ('editID' in fileEdit) {
            debug('Read contents of file edit');
            if (config.fileEditorUseAws) {
                const params = {
                    Bucket: config.fileEditorS3Bucket,
                    Key: getS3Key(fileEdit.editID, fileEdit.fileName),
                };
                const s3 = new AWS.S3();
                s3.getObject(params, (err, data) => {
                    if (ERR(err, callback)) return;
                    fileEdit.editContents = b64EncodeUnicode(data.Body);
                    fileEdit.editHash = getHash(fileEdit.editContents);
                    callback(null);
                });
            } else {
                const fullPath = path.join(fileEdit.localTmpDir, fileEdit.fileName);
                fs.readFile(fullPath, 'utf8', (err, contents) => {
                    if (ERR(err, callback)) return;
                    debug(`Got contents from ${fullPath}`);
                    fileEdit.editContents = b64EncodeUnicode(contents);
                    fileEdit.editHash = getHash(fileEdit.editContents);
                    callback(null);
                });
            }
        } else {
            callback(null);
        }
    });
}

function selectEdit(fileEdit, callback) {
    sqldb.beginTransaction((err, client, done) => {
        if (ERR(err, callback)) return;
        async.series([
            (callback) => {
                const params = {
                    user_id: fileEdit.userID,
                    course_id: fileEdit.courseID,
                    dir_name: fileEdit.dirName,
                    file_name: fileEdit.fileName,
                };
                debug(`Looking for previously saved drafts`);
                sqldb.queryWithClient(client, sql.select_file_edit, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    if (result.rows.length > 0) {
                        debug(`Found ${result.rows.length} saved drafts, the first of which has id ${result.rows[0].id}`);
                        if (result.rows[0].age < 24) {
                            fileEdit.editID = result.rows[0].id;
                            fileEdit.origHash = result.rows[0].orig_hash;
                            fileEdit.editPushed = result.rows[0].pushed;
                            fileEdit.jobSequenceId = result.rows[0].job_sequence_id;
                            if (config.fileEditorUseAws) {
                                fileEdit.s3_bucket = result.rows[0].s3_bucket;
                            } else {
                                fileEdit.localTmpDir = result.rows[0].local_tmp_dir;
                            }
                            debug(`This draft was ${fileEdit.editPushed ? "pushed" : "not pushed"}`);
                        } else {
                            debug(`Rejected this draft, which had age ${result.rows[0].age} >= 24 hours`);
                        }
                    }
                    callback(null);
                });
            },
            (callback) => {
                const params = {
                    user_id: fileEdit.userID,
                    course_id: fileEdit.courseID,
                    dir_name: fileEdit.dirName,
                    file_name: fileEdit.fileName,
                };
                sqldb.queryWithClient(client, sql.soft_delete_file_edit, params, (err) => {
                    if (ERR(err, callback)) return;
                    debug('Deleted all previously saved drafts');
                    callback(null);
                });
            },
        ], (err) => {
            sqldb.endTransaction(client, done, err, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
}

function markEditWithJobSequenceId(fileEdit, job_sequence_id, callback) {
    sqldb.query(sql.mark_file_edit_with_job_sequence_id, {
        id: fileEdit.editID,
        job_sequence_id: job_sequence_id,
    }, (err) => {
        if (ERR(err, callback)) return;
        debug('Marked saved draft with job sequence id');
        callback(null);
    });
}

function markEditAsPushed(fileEdit, callback) {
    sqldb.query(sql.mark_file_edit_as_pushed, {
        id: fileEdit.editID,
    }, (err) => {
        if (ERR(err, callback)) return;
        debug('Marked saved draft as pushed');
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
            };
            sqldb.query(sql.soft_delete_file_edit, params, (err) => {
                if (ERR(err, callback)) return;
                debug('Deleted all previously saved drafts');
                callback(null);
            });
        },
        (callback) => {
            const params = {
                user_id: fileEdit.userID,
                course_id: fileEdit.courseID,
                dir_name: fileEdit.dirName,
                file_name: fileEdit.fileName,
                orig_hash: fileEdit.origHash,
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

function pushEdit(fileEdit, callback) {
    let gitEnv = process.env;
    if (config.gitSshCommand != null) {
        gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
    }
    const execOptions = {
        cwd: fileEdit.coursePath,
        env: gitEnv,
    };
    async.series([
        (callback) => {
            debug('Git reset - unstage all changes');
            exec('git reset', execOptions, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug('Git add - stage changes to file being edited');
            exec(`git add ${path.join(fileEdit.dirName, fileEdit.fileName)}`, execOptions, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug('Git commit');
            const cmd = 'git' +
                        `-c user.name="${fileEdit.user_name}"` +
                        `-c user.email="${fileEdit.uid}"` +
                        `-m "in-browser change to ${fileEdit.fileName}"`;
            exec(cmd, execOptions, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug('Git push');
            exec(`git push`, execOptions, (err, stdout, stderr) => {
                if (err) {
                    debug('Cleanup - git reset to  roll back commit');
                    exec(`git reset --hard HEAD~1`, execOptions, (cleanupErr) => {
                        if (ERR(cleanupErr, callback)) return;
                        if (ERR(err, callback)) return;
                        // should never get to this line (we know err is non-null)
                        callback(null);
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

function saveEditWithLock(fileEdit, locals, callback) {
    const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
    async.series([
        (callback) => {
            debug(`Read file from ${fullPath}`);
            fs.readFile(fullPath, 'utf8', (err, contents) => {
                if (ERR(err, callback)) return;
                debug('Check hash of file on disk');
                fileEdit.diskHash = getHash(b64EncodeUnicode(contents));
                if (fileEdit.origHash != fileEdit.diskHash) {
                    // FIXME - say which user
                    return callback(new Error(`Another user made changes to the file you were editing.`));
                }
                callback(null);
            });
        },
        (callback) => {
            debug(`Write file to ${fullPath}`);
            fs.writeFile(fullPath, b64DecodeUnicode(fileEdit.editContents), 'utf8', (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            if (!config.fileEditorUseGit) return callback(null);
            pushEdit(fileEdit, (err) => {
                if (err) {
                    debug('Cleanup - git checkout to revert changes to file on disk');
                    exec(`git checkout ${path.join(fileEdit.dirName, fileEdit.fileName)}`, execOptions, (cleanupErr) => {
                        if (ERR(cleanupErr, callback)) return;
                        if (ERR(err, callback)) return;
                        // should never get to this line (we know err is non-null)
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            });
        },
        (callback) => {
            debug('Mark edit as pushed (or just written to disk, if no git)');
            markEditAsPushed(fileEdit, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);


        // if (err) {
        //     // If there was an error - for any reason - we soft-delete the
        //     // file edit from the database. We do this because our priority
        //     // is to make sure the user isn't trapped with a file edit that
        //     // they cannot read and also cannot soft-delete. We accept the
        //     // risk (for now) that the user may lose their saved changes.
        //     debug('Soft-delete file edit from db (error when trying to read file edit)');
        //     sqldb.query(sql.soft_delete_file_edit, {
        //         user_id: fileEdit.userID,
        //         course_id: fileEdit.courseID,
        //         dir_name: fileEdit.dirName,
        //         file_name: fileEdit.fileName,
        //     }, (deleteErr) => {
        //         if (ERR(deleteErr, callback)) return;
        //         if (ERR(err, callback)) return;
        //         // Should never get to this line (we know err is non-null)
        //         callback(null);
        //     });
        // } else {
        //     callback(null);
        // }
    });
}

function saveEdit(fileEdit, locals, callback) {
    const lockName = 'coursedir:' + locals.course.path;
    debug(`Try lock ${lockName}`)
    namedLocks.tryLock(lockName, (err, lock) => {
        if (ERR(err, (err) => logger.info(err))) {
            callback(null);
            return;
        }

        if (lock == null) {
            logger.info(`Failed to get named lock because another user is already syncing or modifying the course: ${options.courseDir}`);
            callback(null);
            return;
        }

        debug(`Acquired lock ${lockName}`)
        saveEditWithLock(fileEdit, locals, (err) => {
            namedLocks.releaseLock(lock, (lockErr) => {
                if (ERR(lockErr, (lockErr) => logger.info(lockErr))) {
                    callback(null);
                    return;
                }

                debug(`Released lock ${lockName}`);

                if (ERR(err, (err) => logger.info(err))) {
                    callback(null);
                    return;
                }

                callback(null);
            });
        });
    });
}

function saveAndSync(fileEdit, locals, callback) {

    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync',
        description: 'Save and sync an in-browser edit to a file',
        courseDir: locals.course.path,
    };

    serverJobs.createJobSequence(options, (err, job_sequence_id) => {
        let gitEnv = process.env;
        if (config.gitSshCommand != null) {
            gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
        }

        let courseLock;

        let jobSequenceHasFailed = false;
        let showHelpJob = false;
        let showHelpMsg = '';

        const _markEditWithJobSequenceId = () => {
            debug('create job: markEditWithJobSequenceId');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'mark_edit_with_job_sequence_id',
                description: 'Add job sequence id to edit in database',
                job_sequence_id: job_sequence_id,
                on_success: _lock,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                debug('Add job sequence id to edit in database');
                markEditWithJobSequenceId(fileEdit, job_sequence_id, (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.verbose('Marked edit with job sequence id');
                        job.succeed();
                    }
                });
            });
        };

        const _lock = () => {
            debug('create job: lock');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'lock',
                description: 'Lock',
                job_sequence_id: job_sequence_id,
                on_success: _checkHash,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
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
                type: 'check_hash',
                description: 'Check hash',
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

                const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
                fs.readFile(fullPath, 'utf8', (err, contents) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        fileEdit.diskHash = getHash(b64EncodeUnicode(contents));
                        if (fileEdit.origHash != fileEdit.diskHash) {
                            job.fail(new Error(`Another user made changes to the file you were editing.`));
                        } else {
                            job.verbose('No changes were made to the file since you started editing.');
                            job.succeed();
                        }
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
                type: 'write_file',
                description: 'Write saved draft to disk',
                job_sequence_id: job_sequence_id,
                on_success: (config.fileEditorUseGit ? _unstage : _markEditAsPushed),
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

                // FIXME - remove!
                myFail((err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        debug(`Wrote file to ${fullPath}`);
                        job.verbose(`Wrote file to ${fullPath}`);
                        job.succeed();
                    }
                });

                // // FIXME - uncomment!
                //
                // const fullPath = path.join(fileEdit.coursePath, fileEdit.dirName, fileEdit.fileName);
                // fs.writeFile(fullPath, b64DecodeUnicode(fileEdit.editContents), 'utf8', (err) => {
                //     if (err) {
                //         job.fail(err);
                //     } else {
                //         debug(`Wrote file to ${fullPath}`);
                //         job.verbose(`Wrote file to ${fullPath}`);
                //         job.succeed();
                //     }
                // });
            });
        };

        const _unstage = function() {
            debug('create job: unstage');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_reset',
                description: 'Unstage all changes',
                command: 'git',
                arguments: ['reset'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _add,
                on_error: _cleanupAfterWrite,
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
                type: 'git_add',
                description: 'Stage changes to file being edited',
                command: 'git',
                arguments: ['add', path.join(fileEdit.dirName, fileEdit.fileName)],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _commit,
                on_error: _cleanupAfterWrite,
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
                type: 'git_commit',
                description: 'Commit changes',
                command: 'git',
                arguments: [
                    '-c', `user.name="${fileEdit.user_name}"`,
                    '-c', `user.email="${fileEdit.uid}"`,
                    'commit', '-m', `in-browser change to ${fileEdit.fileName}`,
                ],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _push,
                on_error: _cleanupAfterWrite,
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
                type: 'git_push',
                description: 'Push to remote',
                command: 'git',
                arguments: ['push'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _markEditAsPushed,
                on_error: _cleanupAfterCommit,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _markEditAsPushed = () => {
            debug('create job: markEditAsPushed');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'mark_edit_as_pushed',
                description: 'Mark edit as pushed (or just written to disk, if no git)',
                job_sequence_id: job_sequence_id,
                on_success: _unlock,
                on_error: _cleanup,
                no_job_sequence_update: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                debug('Mark edit as pushed (or just written to disk, if no git)');
                markEditAsPushed(fileEdit, (err) => {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.verbose('Marked edit as pushed');
                        job.succeed();
                    }
                });
            });
        };

        const _unlock = () => {
            debug('create job: unlock');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'unlock',
                description: 'Unlock',
                job_sequence_id: job_sequence_id,
                on_success: (jobSequenceHasFailed ? _finishWithFailure : _finishWithSuccess),
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
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

        const _finishWithSuccess = () => {
            debug(`finish job sequence id=${job_sequence_id} with success`);

            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                type: 'finish',
                description: 'Finish job sequence',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, (jobErr, job) => {
                if (jobErr) {
                    logger.error('Error in createJob()', jobErr);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                job.succeed();
                if (ERR(err, (err) => logger.info(err))) {
                    callback(null, job_sequence_id);
                    return;
                }
                callback(null, job_sequence_id);
            });
        };

        const _finishWithFailure = () => {
            debug(`finish job sequence id=${job_sequence_id} with failure`);
            serverJobs.failJobSequence(job_sequence_id);
            if (ERR(err, (err) => logger.info(err))) {
                callback(null, job_sequence_id);
                return;
            }
            callback(null, job_sequence_id);
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

        const _cleanupAfterCommit = (id) => {
            debug(`Job id ${id} has failed (after git commit)`);
            jobSequenceHasFailed = true;
            debug('create job: roll back commit');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_reset',
                description: 'Roll back commit',
                command: 'git',
                arguments: ['reset', '--hard', 'HEAD~1'],
                working_directory: fileEdit.coursePath,
                env: gitEnv,
                on_success: _cleanupAfterWrite,
                on_error: _finishWithFailure,
                no_job_sequence_update: true,
            };
            serverJobs.spawnJob(jobOptions);
        };

        const _cleanupAfterWrite = (id) => {
            debug(`Job id ${id} has failed (after write)`);
            jobSequenceHasFailed = true;
            debug('create job: revert changes to file on disk');
            const jobOptions = {
                course_id: options.course_id,
                user_id: options.user_id,
                authn_user_id: options.authn_user_id,
                job_sequence_id: job_sequence_id,
                type: 'git_checkout',
                description: 'Git checkout to revert changes to file on disk',
                command: 'git',
                arguments: ['checkout', path.join(fileEdit.dirName, fileEdit.fileName)],
                working_directory: fileEdit.coursePath,
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

        _markEditWithJobSequenceId();
    });
}

function saveAndSyncOld(locals, fileEdit, callback) {
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
                description: 'Check hash',
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

                job.verbose('Get hash of original file');
                fileEdit.origHash = getHash(fileEdit.origContents);

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
                on_success: (config.fileEditorUseGit ? _unstage : _unlock),
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
                arguments: [
                    '-c', `user.name="${fileEdit.user_name}"`,
                    '-c', `user.email="${fileEdit.uid}"`,
                    'commit', '-m', `in-browser change to ${fileEdit.fileName}`,
                ],
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

function mySucceed(callback) {
    callback(null);
}

function myFail(callback) {
    callback(new Error('fail on purpose'));
}

module.exports = router;
