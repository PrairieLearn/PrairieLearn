var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
const async = require('async');
var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var fs = require('fs-extra');
const os = require('os');
var path = require('path');
const uuidv4 = require('uuid/v4');
const debug = require('debug')('prairielearn:instructorFileEditor');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');

const {
    exec
} = require('child_process');

var sql = sqlLoader.loadSqlEquiv(__filename);

function b64EncodeUnicode(str) {
    // (1) use encodeURIComponent to get percent-encoded UTF-8
    // (2) convert percent encodings to raw bytes
    // (3) convert raw bytes to Base64
    return Buffer.from(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
        })).toString('base64');
}

function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(Buffer.from(str, 'base64').toString().split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

router.get('/', function(req, res, next) {
    if (_.isEmpty(req.query)) {
        return next(error.make(400, 'no file in query', {
            locals: res.locals,
            body: req.body
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
            const execOptions = {
                cwd: fileEdit.coursePath,
                env: process.env,
            };
            exec('git rev-parse HEAD:' + path.join(fileEdit.dirName, fileEdit.fileName), execOptions, (err, stdout) => {
                if (ERR(err, callback)) return;
                fileEdit.origHash = stdout.trim();
                callback(null);
            });
        },
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
                        fileEdit.editID = result.rows[0].id;
                        debug('Read contents of file edit')
                        readEdit(fileEdit, (err) => {
                            if (ERR(err, callback)) return;
                            fileEdit.didReadEdit = true;
                            callback(null);
                        });
                    } else {
                        debug('Delete file edit (outdated commit hash)');
                        async.series([
                            (callback) => {
                                debug('Delete file edit from database');
                                sqldb.query(sql.delete_file_edit, {
                                    user_id: fileEdit.userID,
                                    course_id: fileEdit.courseID,
                                    id: fileEdit.editID,
                                    file_name: fileEdit.fileName,
                                }, (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            },
                            (callback) => {
                                debug('Delete file edit from disk');
                                deleteEdit(fileEdit, (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            }
                        ], (err) => {
                            if (ERR(err, callback)) return;
                            fileEdit.didDeleteEdit = true;
                            callback(null);
                        });
                    }
                } else {
                    callback(null);
                }
            });
        },
        (callback) => {
            if (!('editID' in fileEdit)) {
                debug('Create file edit');
                async.series([
                    (callback) => {
                        const params = {
                            user_id: fileEdit.userID,
                            course_id: fileEdit.courseID,
                            dir_name: fileEdit.dirName,
                            file_name: fileEdit.fileName,
                            commit_hash: fileEdit.origHash
                        };
                        sqldb.queryOneRow(sql.insert_file_edit, params, function(err, result) {
                            if (ERR(err, callback)) return;
                            fileEdit.editID = result.rows[0].id;
                            debug(`Created file edit in database with id ${fileEdit.editID}`);
                            callback(null);
                        });
                    },
                    (callback) => {
                        debug('Write file edit');
                        writeEdit(fileEdit, fileEdit.origContents, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    }
                ], (err) => {
                    if (ERR(err, callback)) return;
                    fileEdit.didWriteEdit = true;
                    callback(null);
                });
            } else {
                callback(null);
            }
        }
    ], (err) => {
        if (ERR(err, next)) return;
        res.locals.fileEdit = fileEdit;
        debug("Render");
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

const getCommitHash = function(course_path, file_path, callback) {
    const execOptions = {
        cwd: course_path,
        env: process.env,
    };

    exec('git rev-parse HEAD:' + file_path, execOptions, (err, stdout) => {
        if (err) {
            callback(new Error(`Could not get git status; exited with code ${err.code}`));
        } else {
            // stdout buffer
            callback(null, stdout.trim());
        }
    });
};






router.post('/', function(req, res, next) {
    debug(`Responding to post with action ${req.body.__action}`);
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));

    let fileEdit = {
        userID: req.body.file_edit_user_id,
        courseID: req.body.file_edit_course_id,
        editID: req.body.file_edit_id,
        dirName: req.body.file_edit_dir_name,
        fileName: req.body.file_edit_file_name,
    };

    if (req.body.__action == 'save_draft') {
        debug('Save draft: overwrite file edit');
        writeEdit(fileEdit, req.body.file_edit_contents, (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'revert_to_draft') {
        debug('Revert to draft: reload page to discard changes');
        res.redirect(req.originalUrl);
    } else if (req.body.__action == 'revert_to_original') {
        debug('Revert to original: delete file edit');
        async.series([
            (callback) => {
                debug('Delete file edit from database');
                sqldb.query(sql.delete_file_edit, {
                    user_id: fileEdit.userID,
                    course_id: fileEdit.courseID,
                    id: fileEdit.editID,
                    file_name: fileEdit.fileName,
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug('Delete file edit from disk');
                deleteEdit(fileEdit, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }
        ], (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'save_and_sync') {
        debug('Save and sync');
        async.waterfall([
            (callback) => {
                debug('Save and sync: overwrite file edit');
                writeEdit(fileEdit, req.body.file_edit_contents, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                saveAndSync(res.locals, (err, job_sequence_id) => {
                    if (ERR(err, callback)) return;
                    callback(null, job_sequence_id);
                });
            }
        ], (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });

        // FIXME: args (pass fileEdit)
        // FIXME: implement saveAndSync

    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {locals: res.locals, body: req.body}));
    }


    // get commit lock
    //


    // if (req.body.__action == 'save_and_sync') {
    //
    //     // FIXME: server jobs, logger
    //
    //     console.log(req.body);
    //
    //     // Get file name
    //     const fileName = req.body.__file;
    //
    //     // Get old hash
    //     const oldHash = req.body.__hash;
    //
    //     console.log(fileName);
    //     console.log(oldHash);
    //
    //     // Get commit lock
    //     const lockName = 'coursedir:' + res.locals.course.path;
    //     // logger.verbose(`Trying lock ${lockName}`);
    //     namedLocks.tryLock(lockName, (err, lock) => {
    //         // FIXME: should "next" really appear where "callback" was?
    //         if (ERR(err, next)) return;
    //         if (lock == null) {
    //             // logger.verbose(`Did not acquire lock ${lockName}`);
    //             // callback(new Error(`Another user is already syncing or modifying the course: ${courseDir}`));
    //             return next(error.make(400, `Another user is already syncing or modifying the course: ${res.locals.course.path}`, {
    //                 locals: res.locals,
    //                 body: req.body
    //             }));
    //         } else {
    //             // logger.verbose(`Acquired lock ${lockName}`);
    //             console.log('acquired lock');
    //             console.log('trying to get new hash:');
    //             console.log(' path: ' + res.locals.course.path)
    //             console.log(' file: ' + fileName)
    //
    //             // Get new hash
    //             getCommitHash(res.locals.course.path, fileName, (err, newHash) => {
    //                 namedLocks.releaseLock(lock, (lockErr) => {
    //                     if (ERR(lockErr, next)) return;
    //                     if (ERR(err, next)) return;
    //
    //                     console.log('released lock');
    //                     console.log('old: ' + oldHash);
    //                     console.log('new: ' + newHash);
    //                     console.log('new == old: ' + String(oldHash == newHash));
    //                     // logger.verbose(`Released lock ${lockName}`);
    //                     // callback(null);
    //
    //                     res.redirect(req.originalUrl);
    //                 });
    //                 // if (ERR(err, next)) return;
    //
    //
    //
    //                 // res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    //             });
    //
    //
    //             // this._syncDiskToSqlWithLock(courseDir, course_id, logger, (err) => {
    //             //     namedLocks.releaseLock(lock, (lockErr) => {
    //             //         if (ERR(lockErr, callback)) return;
    //             //         if (ERR(err, callback)) return;
    //             //         logger.verbose(`Released lock ${lockName}`);
    //             //         callback(null);
    //             //     });
    //             // });
    //         }
    //     });
    //
    //
    //
    //
    //     // const jobOptions = {
    //     //     course_id: res.locals.course.id,
    //     //     user_id: res.locals.user.user_id,
    //     //     authn_user_id: res.locals.authz_data.authn_user.user_id,
    //     //     type: 'save_and_sync',
    //     //     description: 'FIXME: Replace this text with a description of what is being done',
    //     //     job_sequence_id: job_sequence_id,
    //     //     on_success: syncStage3,
    //     // };
    //     // serverJobs.createJob(jobOptions, function(err, job) {
    //     //     if (err) {
    //     //         logger.error('Error in createJob()', err);
    //     //         serverJobs.failJobSequence(job_sequence_id);
    //     //         return;
    //     //     }
    //     //     syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, function(err) {
    //     //         if (err) {
    //     //             job.fail(err);
    //     //         } else {
    //     //             job.succeed();
    //     //         }
    //     //     });
    //     // });
    //
    //
    // } else {
    //     return next(error.make(400, 'unknown __action', {
    //         locals: res.locals,
    //         body: req.body
    //     }));
    // }
    //
    //
    //
    //
    // // if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));
    // // if (req.body.__action == 'course_permissions_insert_by_user_uid') {
    // //     let params = [
    // //         res.locals.course.id,
    // //         req.body.uid,
    // //         req.body.course_role,
    // //         res.locals.authz_data.authn_user.user_id,
    // //     ];
    // //     sqldb.call('course_permissions_insert_by_user_uid', params, function(err, _result) {
    // //         if (ERR(err, next)) return;
    // //         res.redirect(req.originalUrl);
    // //     });
    // // } else if (req.body.__action == 'course_permissions_update_role') {
    // //     let params = [
    // //         res.locals.course.id,
    // //         req.body.user_id,
    // //         req.body.course_role,
    // //         res.locals.authz_data.authn_user.user_id,
    // //     ];
    // //     sqldb.call('course_permissions_update_role', params, function(err, _result) {
    // //         if (ERR(err, next)) return;
    // //         res.redirect(req.originalUrl);
    // //     });
    // // } else if (req.body.__action == 'course_permissions_delete') {
    // //     var params = [
    // //         res.locals.course.id,
    // //         req.body.user_id,
    // //         res.locals.authz_data.authn_user.user_id,
    // //     ];
    // //     sqldb.call('course_permissions_delete', params, function(err, _result) {
    // //         if (ERR(err, next)) return;
    // //         res.redirect(req.originalUrl);
    // //     });
    // // } else {
    // //     return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    // // }
});

function readEdit(fileEdit, callback) {
    const dirName = getDevDirName();
    const fileName = getDevFileName(fileEdit.userID, fileEdit.courseID, fileEdit.editID, fileEdit.fileName);
    fs.readFile(path.join(dirName, fileName), 'utf8', (err, contents) => {
        if (ERR(err, callback)) return;
        fileEdit.editContents = b64EncodeUnicode(contents);
        callback(null);
    });
}

function deleteEdit(fileEdit, callback) {
    const dirName = getDevDirName();
    const fileName = getDevFileName(fileEdit.userID, fileEdit.courseID, fileEdit.editID, fileEdit.fileName);
    fs.unlink(path.join(dirName, fileName), (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function writeEdit(fileEdit, contents, callback) {
    const dirName = getDevDirName();
    const fileName = getDevFileName(fileEdit.userID, fileEdit.courseID, fileEdit.editID, fileEdit.fileName);
    async.series([
        (callback) => {
            debug("Ensure file edit directory exists");
            fs.mkdirs(dirName, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.writeFile(path.join(dirName, fileName), b64DecodeUnicode(contents), 'utf8', (err) => {
                if (ERR(err, callback)) return;
                debug(`Created file edit on local disk with name ${fileName}`);
                fileEdit.editContents = contents;
                callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}


/**
 * Returns the path to the directory where the file edits should be written to
 * while running in development (local) mode.
 *
 * If we're running natively, this return $HOME/.pl_file_edits/edit_<editID>.
 * If we're running in Docker, this return /file_edits/edit_<editID>.
 *
 * On Windows, we use $USERPROFILE instead of $HOME.
 */
function getDevDirName() {
    if (process.env.HOST_JOBS_DIR) {
        // We're probably running in Docker
        return '/file_edits';
    } else {
        // We're probably running natively
        if (process.env.FILE_EDITS_DIR) {
            // The user wants to use a custom edits dir
            return process.env.FILE_EDITS_DIR;
        } else {
            return path.resolve(path.join(os.homedir(), '.pl_file_edits'));
        }
    }
}

function getDevFileName(userID, courseID, editID, fileName) {
    return `edit_${userID}_${courseID}_${editID}_${fileName}`;
}

const saveAndSync = function(locals, callback) {
    const options = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'push_to_remote_git_repository',
        description: 'Push to remote git repository',
    };
    serverJobs.createJobSequence(options, (err, job_sequence_id) => {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        const jobOptions = {
            course_id: options.course_id,
            user_id: options.user_id,
            authn_user_id: options.authn_user_id,
            type: 'push_to_remote_git_repository',
            description: 'Push to remote...',
            job_sequence_id: job_sequence_id,
            last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, (err, job) => {
            if (err) {
                logger.error('Error in createJob()', err);
                serverJobs.failJobSequence(job_sequence_id);
                return;
            }
            job.verbose('Doing the first thing...');
            job.succeed();
        });
    });
}




module.exports = router;
