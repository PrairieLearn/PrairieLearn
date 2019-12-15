const ERR = require('async-stacktrace');
const debug = require('debug')('prairielearn:editHelpers');
const logger = require('../../lib/logger');
const serverJobs = require('../../lib/server-jobs');
const namedLocks = require('../../lib/named-locks');
const syncFromDisk = require('../../sync/syncFromDisk');
const courseUtil = require('../../lib/courseUtil');
const requireFrontend = require('../../lib/require-frontend');
const config = require('../../lib/config');
const sha256 = require('crypto-js/sha256');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const uuidv4 = require('uuid/v4');

class Editor {
    constructor(params) {
        this.locals = params.locals;
    }

    write(callback) {
        callback(new Error('write must be defined in a subclass'));
    }

    contains(parentPath, childPath) {
        const relPath = path.relative(parentPath, childPath);
        return (!(relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)));
    }

    canEdit(callback) {
        // Do not allow users to edit without permission
        if (!this.locals.authz_data.has_course_permission_edit) return callback(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (this.locals.course.options.isExampleCourse) {
            return callback(new Error(`Access denied (cannot edit the example course)`));
        }

        if (this.contained) {
            // FIXME
            return callback(new Error('FIXME'));

            // if (this.contained.some((workingPath) => (!this.contains(this.container.rootPath, workingPath)))) {
            //     return callback(new Error(`all paths ${this.contained} must be inside ${this.container.rootPath}`));
            // }
            //
            // if (this.contained.some((workingPath) => (this.container.invalidRootPaths.some((invalidRootPath) => this.contains(invalidRootPath, workingPath))))) {
            //     return callback(new Error(`all paths ${this.contained} must be outside all paths ${this.container.invalidRootPaths}`));
            // }
        }

        callback(null);
    }

    doEdit(callback) {
        const options = {
            course_id: this.locals.course.id,
            user_id: this.locals.user.user_id,
            authn_user_id: this.locals.authz_data.authn_user.user_id,
            type: 'sync',
            description: this.description,
            courseDir: this.locals.course.path,
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
                    working_directory: this.locals.course.path,
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
                    working_directory: this.locals.course.path,
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

                    this.write((err) => {
                        if (ERR(err, (e) => logger.error(e))) {
                            job.fail(err);
                        } else {
                            job.succeed();
                        }
                    });
                });
            };

            const _add = () => {
                debug(`${job_sequence_id}: _add`);
                const jobOptions = {
                    course_id: options.course_id,
                    user_id: options.user_id,
                    authn_user_id: options.authn_user_id,
                    job_sequence_id: job_sequence_id,
                    type: 'git_add',
                    description: 'Stage changes',
                    command: 'git',
                    arguments: ['add'].concat(this.pathsToAdd),
                    working_directory: this.locals.course.path,
                    env: gitEnv,
                    on_success: _commit,
                    on_error: _cleanupAfterWrite,
                    no_job_sequence_update: true,
                };
                serverJobs.spawnJob(jobOptions);
            };

            const _commit = () => {
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
                        '-c', `user.name="${this.locals.user.name}"`,
                        '-c', `user.email="${this.locals.user.uid}"`,
                        'commit', '-m', this.commitMessage,
                    ],
                    working_directory: this.locals.course.path,
                    env: gitEnv,
                    on_success: _push,
                    on_error: _cleanupAfterWrite,
                    no_job_sequence_update: true,
                };
                serverJobs.spawnJob(jobOptions);
            };

            const _push = () => {
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
                    working_directory: this.locals.course.path,
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
                courseUtil.updateCourseCommitHash(this.locals.course, (err) => {
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
                    syncFromDisk.syncDiskToSql(this.locals.course.path, this.locals.course.id, job, (err) => {
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
                    const coursePath = this.locals.course.path;
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
                    working_directory: this.locals.course.path,
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

function processFileAction(req, res, params, next) {
    // NOTE: This function is meant to do things to *files* and not to directories
    // (or anything else). However, nowhere do we check that it is actually being
    // applied to a file and not to a directory.

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
        const oldFilePath = path.join(req.body.working_path, req.body.old_file_name);
        const newFilePath = path.join(req.body.working_path, req.body.new_file_name);
        if (oldFilePath == newFilePath) {
            debug('new file name is the same as old file name, so abort rename');
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
                        if (req.body.was_viewing_file) {
                            res.redirect(`${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodeURIComponent(path.relative(res.locals.course.path, newFilePath))}`);
                        } else {
                            res.redirect(req.originalUrl);
                        }
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
            debug('should add a new file');
            filePath = path.join(req.body.working_path, req.file.originalname);
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
                    debug('new contents are the same as old contents, so abort upload');
                    res.redirect(req.originalUrl);
                    return;
                } else {
                    debug('new contents are different from old contents, so continue with upload');
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

class AssessmentCopyEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `${this.locals.course_instance.short_name}: copy assessment ${this.locals.assessment.tid}`;
    }

    write(callback) {
        debug('AssessmentCopyEditor: write()');
        const assessmentsPath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name, 'assessments');
        async.waterfall([
            (callback) => {
                debug(`Generate unique TID in ${assessmentsPath}`);
                fs.readdir(assessmentsPath, (err, filenames) => {
                    if (ERR(err, callback)) return;

                    let number = 1;
                    filenames.forEach((filename) => {
                        const regex = new RegExp(`^${this.locals.assessment_set.abbreviation}([0-9]+)$`);
                        let found = filename.match(regex);
                        if (found) {
                            const foundNumber = parseInt(found[1]);
                            if (foundNumber >= number) {
                                number = foundNumber + 1;
                            }
                        }
                    });

                    this.tid = `${this.locals.assessment_set.abbreviation}${number}`;
                    this.assessmentNumber = number,
                    this.assessmentPath = path.join(assessmentsPath, this.tid);
                    this.pathsToAdd = [
                        this.assessmentPath,
                    ];
                    this.commitMessage = `${this.locals.course_instance.short_name}: copy assessment ${this.locals.assessment.tid} to ${this.tid}`;
                    callback(null);
                });
            },
            (callback) => {
                const fromPath = path.join(assessmentsPath, this.locals.assessment.tid);
                const toPath = this.assessmentPath;
                debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
                fs.copy(fromPath, toPath, {overwrite: false, errorOnExist: true}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Read infoAssessment.json`);
                fs.readJson(path.join(this.assessmentPath, 'infoAssessment.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    callback(null, infoJson);
                });
            },
            (infoJson, callback) => {
                debug(`Write infoAssessment.json with new title, uuid, and number`);
                infoJson.title = 'Replace this title';
                infoJson.uuid = uuidv4();
                infoJson.number = `${this.assessmentNumber}`;
                fs.writeJson(path.join(this.assessmentPath, 'infoAssessment.json'), infoJson, {spaces: 4}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }
}

class AssessmentDeleteEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `${this.locals.course_instance.short_name}: delete assessment ${this.locals.assessment.tid}`;
    }

    write(callback) {
        debug('AssessmentDeleteEditor: write()');
        const deletePath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name, 'assessments', this.locals.assessment.tid);
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                deletePath,
            ];
            this.commitMessage = `${this.locals.course_instance.short_name}: delete assessment ${this.locals.assessment.tid}`;
            callback(null);
        });
    }
}

class AssessmentRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.tid_new = params.tid_new;
        this.description = `${this.locals.course_instance.short_name}: rename assessment ${this.locals.assessment.tid}`;
    }

    canEdit(callback) {
        if (path.dirname(this.tid_new) !== '.') return callback(new Error(`Invalid TID: ${this.tid_new}`));
        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('AssessmentRenameEditor: write()');
        const oldPath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name, 'assessments', this.locals.assessment.tid);
        const newPath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name, 'assessments', this.tid_new);
        debug(`Move files\n from ${oldPath}\n to ${newPath}`);
        fs.move(oldPath, newPath, {overwrite: false}, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                oldPath,
                newPath,
            ];
            this.commitMessage = `${this.locals.course_instance.short_name}: rename assessment ${this.locals.assessment.tid} to ${this.tid_new}`;
            callback(null);
        });
    }
}

class CourseInstanceCopyEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Copy course instance ${this.locals.course_instance.short_name}`;
    }

    getNextNameShort(name) {
        let found = name.match(new RegExp(`^([A-Za-z]{2})([0-9]{2})$`));
        debug(`getNextNameShort:\n${found}`);
        if (found) {
            const seasons = ['Sp', 'Su', 'Fa'];
            for (let i = 0; i < 3; i++) {
                if (found[1] == seasons[i]) {
                    if (i == 2) return `${seasons[0]}${(parseInt(found[2]) + 1).toString().padStart(2, '0')}`;
                    else return `${seasons[i + 1]}${parseInt(found[2]).toString().padStart(2, '0')}`;
                }
            }
        }
        return '';
    }

    getNextNameLong(name) {
        let found = name.match(new RegExp(`^([A-Za-z]+)([0-9]{4})$`));
        debug(`getNextNameLong:\n${found}`);
        if (found) {
            const seasons = ['Spring', 'Summer', 'Fall'];
            for (let i = 0; i < 3; i++) {
                if (found[1] == seasons[i]) {
                    if (i == 2) return `${seasons[0]}${(parseInt(found[2]) + 1).toString().padStart(2, '0')}`;
                    else return `${seasons[i + 1]}${parseInt(found[2]).toString().padStart(2, '0')}`;
                }
            }
        }
        return '';
    }

    getPrefixAndNumber(name) {
        let found = name.match(new RegExp('^(?<prefix>.*)_copy(?<number>[0-9]+)$'));
        debug(`getPrefixAndNumber:\n${found}`);
        if (found) {
            return {
                'prefix': found.groups.prefix,
                'number': parseInt(found.groups.number),
            };
        } else {
            return null;
        }
    }

    write(callback) {
        debug('CourseInstanceCopyEditor: write()');
        const courseInstancesPath = path.join(this.locals.course.path, 'courseInstances');
        async.waterfall([
            (callback) => {
                debug(`Generate unique short_name in ${courseInstancesPath}`);
                fs.readdir(courseInstancesPath, (err, filenames) => {
                    if (ERR(err, callback)) return;

                    // Make some effort to create the next sane short_name
                    this.short_name = '';
                    if (! this.short_name) {
                        let short_name = this.getNextNameShort(this.locals.course_instance.short_name);
                        if (! filenames.includes(short_name)) {
                            this.short_name = short_name;
                        }
                    }
                    if (! this.short_name) {
                        let short_name = this.getNextNameLong(this.locals.course_instance.short_name);
                        if (! filenames.includes(short_name)) {
                            this.short_name = short_name;
                        }
                    }

                    // Fall back to <name>_copyXX
                    if (! this.short_name) {
                        // Make some effort to avoid <name>_copy1_copy1_...
                        let prefix;
                        let number;
                        let prefixAndNumber = this.getPrefixAndNumber(this.locals.course_instance.short_name);
                        if (prefixAndNumber) {
                            prefix = prefixAndNumber.prefix;
                            number = prefixAndNumber.number + 1;
                        } else {
                            prefix = this.locals.course_instance.short_name;
                            number = 1;
                        }
                        filenames.forEach((filename) => {
                            let found = filename.match(new RegExp(`^${prefix}_copy([0-9]+)$`));
                            if (found) {
                                const foundNumber = parseInt(found[1]);
                                if (foundNumber >= number) {
                                    number = foundNumber + 1;
                                }
                            }
                        });
                        this.short_name = `${prefix}_copy${number}`;
                    }

                    this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
                    this.pathsToAdd = [
                        this.courseInstancePath,
                    ];
                    this.commitMessage = `copy course instance ${this.locals.course_instance.short_name} to ${this.short_name}`;
                    callback(null);
                });
            },
            (callback) => {
                const fromPath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name);
                const toPath = this.courseInstancePath;
                debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
                fs.copy(fromPath, toPath, {overwrite: false, errorOnExist: true}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Read infoCourseInstance.json`);
                fs.readJson(path.join(this.courseInstancePath, 'infoCourseInstance.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    callback(null, infoJson);
                });
            },
            (infoJson, callback) => {
                debug(`Write infoCourseInstance.json with new title, uuid, and number`);
                infoJson.longName = `Replace this long name (${this.short_name})`;
                infoJson.uuid = uuidv4();
                fs.writeJson(path.join(this.courseInstancePath, 'infoCourseInstance.json'), infoJson, {spaces: 4}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }
}

class CourseInstanceDeleteEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Delete course instance ${this.locals.course_instance.short_name}`;
    }

    write(callback) {
        debug('CourseInstanceDeleteEditor: write()');
        const deletePath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name);
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                deletePath,
            ];
            this.commitMessage = `delete course instance ${this.locals.course_instance.short_name}`;
            callback(null);
        });
    }
}

class CourseInstanceRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.ciid_new = params.ciid_new;
        this.description = `Rename course instance ${this.locals.course_instance.short_name}`;
    }

    canEdit(callback) {
        if (path.dirname(this.ciid_new) !== '.') return callback(new Error(`Invalid CIID: ${this.ciid_new}`));
        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('CourseInstanceRenameEditor: write()');
        const oldPath = path.join(this.locals.course.path, 'courseInstances', this.locals.course_instance.short_name);
        const newPath = path.join(this.locals.course.path, 'courseInstances', this.ciid_new);
        debug(`Move files\n from ${oldPath}\n to ${newPath}`);
        fs.move(oldPath, newPath, {overwrite: false}, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                oldPath,
                newPath,
            ];
            this.commitMessage = `rename course instance ${this.locals.course_instance.short_name} to ${this.ciid_new}`;
            callback(null);
        });
    }
}


// function contains(parentPath, childPath) {
//     const relPath = path.relative(parentPath, childPath);
//     return (!(relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)));
// }
//
// function canEdit(params, callback) {
//     const res = params.res;
//
//     // Do not allow users to edit without permission
//     if (!res.locals.authz_data.has_course_permission_edit) return callback(new Error('Access denied'));
//
//     // Do not allow users to edit the exampleCourse
//     if (res.locals.course.options.isExampleCourse) {
//         return callback(new Error(`attempting to edit example course`));
//     }
//
//     if (params.contained) {
//         if (params.contained.some((workingPath) => (!contains(params.container.rootPath, workingPath)))) {
//             return callback(new Error(`all paths ${params.contained} must be inside ${params.container.rootPath}`));
//         }
//
//         if (params.contained.some((workingPath) => (params.container.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, workingPath))))) {
//             return callback(new Error(`all paths ${params.contained} must be outside all paths ${params.container.invalidRootPaths}`));
//         }
//     }
//
//     callback(null);
// }

module.exports = {
    // doEdit,
    // canEdit,
    processFileAction,
    // contains,
    // Editor,
    AssessmentCopyEditor,
    AssessmentDeleteEditor,
    AssessmentRenameEditor,
    CourseInstanceCopyEditor,
    CourseInstanceDeleteEditor,
    CourseInstanceRenameEditor,
};
