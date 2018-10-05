var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var fs = require('fs');
var path = require('path');
const uuidv4 = require('uuid/v4');
// const serverJobs = require('../../lib/server-jobs');

const namedLocks = require('../../lib/named-locks');

const { exec } = require('child_process');

var sql = sqlLoader.loadSqlEquiv(__filename);

const b64EncodeUnicode = function(str) {
    // (1) use encodeURIComponent to get percent-encoded UTF-8
    // (2) convert percent encodings to raw bytes
    // (3) convert raw bytes to Base64
    return Buffer.from(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    })).toString('base64');
};

const getData = function(filename, callback) {
    fs.readFile(filename, {
        encoding: 'utf8'
    }, function(err, data) {
        if (err) {
            return callback('Error reading file: ' + filename + ': ' + err);
        }
        callback(null, data);
    });
};

router.get('/', function(req, res, next) {
    if (_.isEmpty(req.query)) {
        return next(error.make(400, 'no file in query', {
            locals: res.locals,
            body: req.body
        }));
    }

    const file_path = path.join(res.locals.course.path, req.query.file);
    fs.stat(file_path, function(err, stat) {
        if (err == null) {

            // Read file before getting hash so we are conservative later when
            // deciding whether or not this file has been changed.

            getData(file_path, function(err, data) {
                if (ERR(err, next)) return;

                getCommitHash(res.locals.course.path, req.query.file, (err, hash) => {
                    if (ERR(err, next)) return;

                    res.locals.editorData = {
                        'uuid': uuidv4(),
                        'file': req.query.file,
                        'contents': b64EncodeUnicode(data),
                        'hash': hash,
                    };

                    // FIXME: add these...
                    // job_sequence_id: req.params.job_sequence_id,
                    // course_id: res.locals.course ? res.locals.course.id : null,

                    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                });
            });
        } else {
            return next(error.make(400, 'file ' + req.query.file + ' does not exist', {
                locals: res.locals,
                body: req.body
            }));
        }
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

const saveAndSync = function() {

};



// const saveAndSync = function(locals, callback) {
//     const options = {
//         course_id: locals.course.id,
//         user_id: locals.user.user_id,
//         authn_user_id: locals.authz_data.authn_user.user_id,
//         type: 'save_and_sync',
//         description: 'Pull from remote git repository',
//     };
//     serverJobs.createJobSequence(options, function(err, job_sequence_id) {
//         if (ERR(err, callback)) return;
//         callback(null, job_sequence_id);
//
//         const gitEnv = process.env;
//         if (config.gitSshCommand != null) {
//             gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
//         }
//
//         // We've now triggered the callback to our caller, but we
//         // continue executing below to launch the jobs themselves.
//
//         // First define the jobs.
//         //
//         // After either cloning or pulling from Git, we'll need to load and
//         // store the current commit hash in the database
//         const updateCommitHash = () => {
//             courseUtil.updateCourseCommitHash(locals.course, (err) => {
//                 ERR(err, (e) => logger.error(e));
//                 syncStage2();
//             });
//         };
//
//         // We will start with either 1A or 1B below.
//
//         const syncStage1A = function() {
//             const jobOptions = {
//                 course_id: locals.course.id,
//                 user_id: locals.user.user_id,
//                 authn_user_id: locals.authz_data.authn_user.user_id,
//                 job_sequence_id: job_sequence_id,
//                 type: 'clone_from_git',
//                 description: 'Clone from remote git repository',
//                 command: 'git',
//                 arguments: ['clone', locals.course.repository, locals.course.path],
//                 env: gitEnv,
//                 on_success: updateCommitHash,
//             };
//             serverJobs.spawnJob(jobOptions);
//         };
//
//         const syncStage1B = function() {
//             const jobOptions = {
//                 course_id: locals.course.id,
//                 user_id: locals.user.user_id,
//                 authn_user_id: locals.authz_data.authn_user.user_id,
//                 job_sequence_id: job_sequence_id,
//                 type: 'pull_from_git',
//                 description: 'Pull from remote git repository',
//                 command: 'git',
//                 arguments: ['pull', '--force'],
//                 working_directory: locals.course.path,
//                 env: gitEnv,
//                 on_success: updateCommitHash,
//             };
//             serverJobs.spawnJob(jobOptions);
//         };
//
//         const syncStage2 = function() {
//             const jobOptions = {
//                 course_id: locals.course.id,
//                 user_id: locals.user.user_id,
//                 authn_user_id: locals.authz_data.authn_user.user_id,
//                 type: 'sync_from_disk',
//                 description: 'Sync git repository to database',
//                 job_sequence_id: job_sequence_id,
//                 on_success: syncStage3,
//             };
//             serverJobs.createJob(jobOptions, function(err, job) {
//                 if (err) {
//                     logger.error('Error in createJob()', err);
//                     serverJobs.failJobSequence(job_sequence_id);
//                     return;
//                 }
//                 syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, function(err) {
//                     if (err) {
//                         job.fail(err);
//                     } else {
//                         job.succeed();
//                     }
//                 });
//             });
//         };
//
//         const syncStage3 = function() {
//             const jobOptions = {
//                 course_id: locals.course.id,
//                 user_id: locals.user.user_id,
//                 authn_user_id: locals.authz_data.authn_user.user_id,
//                 type: 'reload_question_servers',
//                 description: 'Reload question server.js code',
//                 job_sequence_id: job_sequence_id,
//                 last_in_sequence: true,
//             };
//             serverJobs.createJob(jobOptions, function(err, job) {
//                 if (err) {
//                     logger.error('Error in createJob()', err);
//                     serverJobs.failJobSequence(job_sequence_id);
//                     return;
//                 }
//                 const coursePath = locals.course.path;
//                 requireFrontend.undefQuestionServers(coursePath, job, function(err) {
//                     if (err) {
//                         job.fail(err);
//                     } else {
//                         job.succeed();
//                     }
//                 });
//             });
//         };
//
//         // Start the first job.
//         fs.access(locals.course.path, function(err) {
//             if (err) {
//                 // path does not exist, start with 'git clone'
//                 syncStage1A();
//             } else {
//                 // path exists, start with 'git pull'
//                 syncStage1B();
//             }
//         });
//     });
// };











router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));
    if (req.body.__action == 'save_and_sync') {

        // FIXME: server jobs, logger

        console.log(req.body);

        // Get file name
        const fileName = req.body.__file;

        // Get old hash
        const oldHash = req.body.__hash;

        console.log(fileName);
        console.log(oldHash);

        // Get commit lock
        const lockName = 'coursedir:' + res.locals.course.path;
        // logger.verbose(`Trying lock ${lockName}`);
        namedLocks.tryLock(lockName, (err, lock) => {
            // FIXME: should "next" really appear where "callback" was?
            if (ERR(err, next)) return;
            if (lock == null) {
                // logger.verbose(`Did not acquire lock ${lockName}`);
                // callback(new Error(`Another user is already syncing or modifying the course: ${courseDir}`));
                return next(error.make(400, 'Another user is already syncing or modifying the course: ${res.locals.course.path}', {
                    locals: res.locals,
                    body: req.body
                }));
            } else {
                // logger.verbose(`Acquired lock ${lockName}`);
                console.log('acquired lock');
                console.log('trying to get new hash:');
                console.log(' path: ' + res.locals.course.path)
                console.log(' file: ' + fileName)

                // Get new hash
                getCommitHash(res.locals.course.path, fileName, (err, newHash) => {
                    namedLocks.releaseLock(lock, (lockErr) => {
                        if (ERR(lockErr, next)) return;
                        if (ERR(err, next)) return;

                        console.log('released lock');
                        console.log('old: ' + oldHash);
                        console.log('new: ' + newHash);
                        console.log('new == old: ' + String(oldHash == newHash));
                        // logger.verbose(`Released lock ${lockName}`);
                        // callback(null);

                        res.redirect(req.originalUrl);
                    });
                    // if (ERR(err, next)) return;



                    // res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                });


                // this._syncDiskToSqlWithLock(courseDir, course_id, logger, (err) => {
                //     namedLocks.releaseLock(lock, (lockErr) => {
                //         if (ERR(lockErr, callback)) return;
                //         if (ERR(err, callback)) return;
                //         logger.verbose(`Released lock ${lockName}`);
                //         callback(null);
                //     });
                // });
            }
        });




        // const jobOptions = {
        //     course_id: res.locals.course.id,
        //     user_id: res.locals.user.user_id,
        //     authn_user_id: res.locals.authz_data.authn_user.user_id,
        //     type: 'save_and_sync',
        //     description: 'FIXME: Replace this text with a description of what is being done',
        //     job_sequence_id: job_sequence_id,
        //     on_success: syncStage3,
        // };
        // serverJobs.createJob(jobOptions, function(err, job) {
        //     if (err) {
        //         logger.error('Error in createJob()', err);
        //         serverJobs.failJobSequence(job_sequence_id);
        //         return;
        //     }
        //     syncFromDisk.syncDiskToSql(locals.course.path, locals.course.id, job, function(err) {
        //         if (err) {
        //             job.fail(err);
        //         } else {
        //             job.succeed();
        //         }
        //     });
        // });


    } else {
        return next(error.make(400, 'unknown __action', {
            locals: res.locals,
            body: req.body
        }));
    }




    // if (!res.locals.authz_data.has_course_permission_own) return next(new Error('Insufficient permissions'));
    // if (req.body.__action == 'course_permissions_insert_by_user_uid') {
    //     let params = [
    //         res.locals.course.id,
    //         req.body.uid,
    //         req.body.course_role,
    //         res.locals.authz_data.authn_user.user_id,
    //     ];
    //     sqldb.call('course_permissions_insert_by_user_uid', params, function(err, _result) {
    //         if (ERR(err, next)) return;
    //         res.redirect(req.originalUrl);
    //     });
    // } else if (req.body.__action == 'course_permissions_update_role') {
    //     let params = [
    //         res.locals.course.id,
    //         req.body.user_id,
    //         req.body.course_role,
    //         res.locals.authz_data.authn_user.user_id,
    //     ];
    //     sqldb.call('course_permissions_update_role', params, function(err, _result) {
    //         if (ERR(err, next)) return;
    //         res.redirect(req.originalUrl);
    //     });
    // } else if (req.body.__action == 'course_permissions_delete') {
    //     var params = [
    //         res.locals.course.id,
    //         req.body.user_id,
    //         res.locals.authz_data.authn_user.user_id,
    //     ];
    //     sqldb.call('course_permissions_delete', params, function(err, _result) {
    //         if (ERR(err, next)) return;
    //         res.redirect(req.originalUrl);
    //     });
    // } else {
    //     return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    // }
});

module.exports = router;
