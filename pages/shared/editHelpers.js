const ERR = require('async-stacktrace');
const debug = require('debug')('prairielearn:editHelpers');
const logger = require('../../lib/logger');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
const config = require('../../lib/config');
const klaw = require('klaw');
const sha256 = require('crypto-js/sha256');
const path = require('path');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const async = require('async');
const error = require('@prairielearn/prairielib/error');

function canEditFile(file) {
    const extCanEdit = ['.py', '.html', '.json', '.txt', '.md'];
    return extCanEdit.includes(path.extname(file));
}

function canMoveFile(file) {
    const cannotMove = ['info.json', 'infoAssessment.json', 'infoCourseInstance.json', 'infoCourse.json'];
    return (! cannotMove.includes(path.basename(file)));
}

function getFiles(options, callback) {
    let files = [];
    let clientFiles = [];
    let serverFiles = [];
    let index = 0;

    const ignoreHidden = item => {
        const basename = path.basename(item);
        return basename === '.' || basename[0] !== '.';
    }

    const walker = klaw(options.baseDir, {filter: ignoreHidden});

    options.ignoreDirs = options.ignoreDirs || [];

    walker.on('readable', () => {
        let item;
        while (item = walker.read()) {
            if (!item.stats.isDirectory()) {
                const relPath = path.relative(options.baseDir, item.path);
                const prefix = relPath.split(path.sep)[0];
                const file = {
                    name: relPath,
                    path: path.relative(options.courseDir, item.path),
                    editable: canEditFile(item.path),
                    moveable: canMoveFile(item.path),
                    id: index,
                };
                if (prefix == options.clientFilesDir) {
                    clientFiles.push(file);
                } else if (prefix == options.serverFilesDir) {
                    serverFiles.push(file);
                } else if (! options.ignoreDirs.includes(prefix)) {
                    files.push(file);
                }
                index++;
            }
        }
    });

    walker.on('error', (err, item) => {
        if (ERR(err, callback)) return;
    });

    walker.on('end', () => {
        callback(null, {
            files: files,
            clientFiles: clientFiles,
            serverFiles: serverFiles,
        });
    });
}

function getHashFromBuffer(buffer) {
    return sha256(buffer.toString('utf8')).toString();
}

function file_delete_write(edit, callback) {
    debug(`Delete ${edit.filePath}`);
    // This will silently do nothing if edit.filePath no longer exists.
    fs.remove(edit.filePath, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            edit.filePath,
        ];
        edit.commitMessage = `in-browser edit: delete file ${edit.filePath}`;
        callback(null);
    });
}

function file_rename_write(edit, callback) {
    debug(`Move:\n from ${edit.oldFilePath}\n to ${edit.newFilePath}`);
    async.series([
        (callback) => {
            debug(`ensure path exists`);
            fs.ensureDir(path.dirname(edit.newFilePath), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`rename file`);
            fs.rename(edit.oldFilePath, edit.newFilePath, (err) => {
                if (ERR(err, callback)) return;
                edit.pathsToAdd = [
                    edit.oldFilePath,
                    edit.newFilePath,
                ];
                edit.commitMessage = `in-browser edit: rename file ${edit.oldFilePath} to ${edit.newFilePath}`;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function file_upload_write(edit, callback) {
    debug(`Upload file ${edit.filePath}`);
    async.series([
        (callback) => {
            debug(`ensure path exists`);
            fs.ensureDir(path.dirname(edit.filePath), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`write file`);
            fs.writeFile(edit.filePath, edit.fileContents, (err) => {
                if (ERR(err, callback)) return;
                edit.pathsToAdd = [
                    edit.filePath,
                ];
                edit.commitMessage = `in-browser edit: upload file ${edit.filePath}`;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function delete_write(edit, callback) {
    debug(`Delete questions/${edit.qid}`);
    const questionPath = path.join(edit.coursePath, 'questions', edit.qid);
    // This will silently do nothing if questionPath no longer exists.
    fs.remove(questionPath, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            questionPath,
        ];
        edit.commitMessage = `in-browser edit: delete question ${edit.qid}`;
        callback(null);
    });
}

function copy_write(edit, callback) {
    async.waterfall([
        (callback) => {
            debug(`Generate unique QID`);
            fs.readdir(path.join(edit.coursePath, 'questions'), (err, filenames) => {
                if (ERR(err, callback)) return;

                let number = 1;
                filenames.forEach((filename) => {
                    let found = filename.match(/^question-([0-9]+)$/);
                    if (found) {
                        const foundNumber = parseInt(found[1]);
                        if (foundNumber >= number) {
                            number = foundNumber + 1;
                        }
                    }
                });

                edit.qid = `question-${number}`;
                edit.questionPath = path.join(edit.coursePath, 'questions', edit.qid);
                edit.pathsToAdd = [
                    edit.questionPath,
                ];
                edit.commitMessage = `in-browser edit: add question ${edit.qid}`;
                callback(null);
            });
        },
        (callback) => {
            debug(`Copy template\n from ${edit.templatePath}\n to ${edit.questionPath}`);
            fs.copy(edit.templatePath, edit.questionPath, {overwrite: false, errorOnExist: true}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`Read info.json`);
            fs.readJson(path.join(edit.questionPath, 'info.json'), (err, infoJson) => {
                if (ERR(err, callback)) return;
                callback(null, infoJson);
            });
        },
        (infoJson, callback) => {
            debug(`Write info.json with new title and uuid`);
            infoJson.title = 'Replace this title';
            infoJson.uuid = uuidv4();
            fs.writeJson(path.join(edit.questionPath, 'info.json'), infoJson, {spaces: 4}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function processFileAction(req, res, params, next) {
    if (req.body.__action == 'delete_file') {
        debug('Delete file');
        const filePath = path.join(res.locals.course.path, req.body.file_path);
        canEdit({req: req, res: res, container: params.container, contained: [filePath]}, (err) => {
            if (ERR(err, next)) return;

            let edit = {
                userID: res.locals.user.user_id,
                courseID: res.locals.course.id,
                coursePath: res.locals.course.path,
                uid: res.locals.user.uid,
                user_name: res.locals.user.name,
                filePath: filePath,
            };

            edit.description = 'Delete file in browser and sync';
            edit.write = file_delete_write;
            doEdit(edit, res.locals, (err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error(e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    res.redirect(req.originalUrl);
                }
            });
        });
    } else if (req.body.__action == 'rename_file') {
        debug('Rename file');
        const oldFilePath = path.join(params.container, req.body.old_file_name);
        const newFilePath = path.join(params.container, req.body.new_file_name);
        if (oldFilePath == newFilePath) {
            debug('new file name is the same as old file name, so abort rename')
            res.redirect(req.originalUrl);
        } else {
            canEdit({req: req, res: res, container: params.container, contained: [oldFilePath, newFilePath]}, (err) => {
                if (ERR(err, next)) return;

                let edit = {
                    userID: res.locals.user.user_id,
                    courseID: res.locals.course.id,
                    coursePath: res.locals.course.path,
                    uid: res.locals.user.uid,
                    user_name: res.locals.user.name,
                    oldFilePath: oldFilePath,
                    newFilePath: newFilePath,
                };

                edit.description = 'Rename file in browser and sync';
                edit.write = file_rename_write;
                doEdit(edit, res.locals, (err, job_sequence_id) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                    } else {
                        res.redirect(req.originalUrl);
                    }
                });
            });
        }
    } else if (req.body.__action == 'download_file') {
        debug('Download file');
        const filePath = path.join(res.locals.course.path, req.body.file_path);
        canEdit({req: req, res: res, container: params.container, contained: [filePath]}, (err) => {
            if (ERR(err, next)) return;
            res.attachment(path.basename(filePath));
            res.sendFile(filePath);
        });
    } else if (req.body.__action == 'upload_file') {
        debug('Upload file');
        let filePath;
        if (req.body.file_path) {
            debug('should replace old file');
            filePath = path.join(res.locals.course.path, req.body.file_path);
        } else {
            debug('should add a new file')
            filePath = path.join(params.container, req.body.file_dir, req.file.originalname);
        }
        debug('look for old contents');
        fs.readFile(filePath, (err, contents) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    debug('no old contents, so continue with upload');
                } else {
                    return ERR(err, next);
                }
            } else {
                debug('get hash of old contents and of new contents');
                const oldHash = getHashFromBuffer(contents);
                const newHash = getHashFromBuffer(req.file.buffer);
                debug('oldHash: ' + oldHash);
                debug('newHash: ' + newHash);
                if (oldHash == newHash) {
                    debug('new contents are the same as old contents, so abort upload')
                    res.redirect(req.originalUrl);
                    return;
                } else {
                    debug('new contents are different from old contents, so continue with upload')
                }
            }

            canEdit({req: req, res: res, container: params.container, contained: [filePath]}, (err) => {
                if (ERR(err, next)) return;
                let edit = {
                    userID: res.locals.user.user_id,
                    courseID: res.locals.course.id,
                    coursePath: res.locals.course.path,
                    uid: res.locals.user.uid,
                    user_name: res.locals.user.name,
                    filePath: filePath,
                    fileContents: req.file.buffer,
                };
                edit.description = 'Upload file in browser and sync';
                edit.write = file_upload_write;
                doEdit(edit, res.locals, (err, job_sequence_id) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                    } else {
                        res.redirect(req.originalUrl);
                    }
                });
            });
        });
    } else {
        return next(new Error('unknown __action: ' + req.body.__action));
    }
}

function canEdit(params, callback) {
    const res = params.res;
    const req = params.req;

    // Do not allow users to edit without permission
    if (!res.locals.authz_data.has_course_permission_edit) return callback(new Error('Access denied'));

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return callback(error.make(400, `attempting to edit example course`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    // Do not allow users to edit files outside the course
    if (params.fileName) {
        const fullPath = path.join(res.locals.course.path, params.fileName);
        const relPath = path.relative(res.locals.course.path, fullPath);
        if (relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)) {
            return callback(error.make(400, `attempting to edit file outside course directory: ${params.fileName}`, {
                locals: res.locals,
                body: req.body,
            }));
        }
    }

    callback(null);
}

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
                on_success: (config.fileEditorUseGit ? () => {_clean(_write, _unlock);} : _write),
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
                on_success: () => {_reset(on_success, on_failure);},
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
                });
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
    canEdit,
    processFileAction,
    getFiles,
};
