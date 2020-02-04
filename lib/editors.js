const ERR = require('async-stacktrace');
const _ = require('lodash');
const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const namedLocks = require('../lib/named-locks');
const syncFromDisk = require('../sync/syncFromDisk');
const courseUtil = require('../lib/courseUtil');
const requireFrontend = require('../lib/require-frontend');
const config = require('../lib/config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const fs = require('fs-extra');
const async = require('async');
const uuidv4 = require('uuid/v4');
const sha256 = require('crypto-js/sha256');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

function contains(parentPath, childPath) {
    const relPath = path.relative(parentPath, childPath);
    return (!(relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)));
}

class Editor {
    constructor(params) {
        this.authz_data = params.locals.authz_data;
        this.course = params.locals.course;
        this.user = params.locals.user;
        this.course_instance = params.locals.course_instance;
        this.assessment = params.locals.assessment;
        this.assessment_set = params.locals.assessment_set;
        this.question = params.locals.question;
    }

    write(callback) {
        callback(new Error('write must be defined in a subclass'));
    }

    canEdit(callback) {
        // Do not allow users to edit without permission
        if (!this.authz_data.has_course_permission_edit) return callback(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (this.course.options.isExampleCourse) {
            return callback(new Error(`Access denied (cannot edit the example course)`));
        }

        callback(null);
    }

    doEdit(callback) {
        const options = {
            course_id: this.course.id,
            user_id: this.user.user_id,
            authn_user_id: this.authz_data.authn_user.user_id,
            type: 'sync',
            description: this.description,
            courseDir: this.course.path,
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
                    on_success: (config.fileEditorUseGit ? () => {_clean(_write, _cleanup);} : _write),
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

            const _clean = (on_success, on_error) => {
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
                    working_directory: this.course.path,
                    env: gitEnv,
                    on_success: () => {_reset(on_success, on_error);},
                    on_error: on_error,
                    no_job_sequence_update: true,
                };
                serverJobs.spawnJob(jobOptions);
            };

            const _reset = (on_success, on_error) => {
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
                    working_directory: this.course.path,
                    env: gitEnv,
                    on_success: on_success,
                    on_error: on_error,
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
                    on_success: (config.fileEditorUseGit ? _add : _syncFromDisk),
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
                    working_directory: this.course.path,
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
                        '-c', `user.name="${this.user.name}"`,
                        '-c', `user.email="${this.user.uid}"`,
                        'commit', '-m', this.commitMessage,
                    ],
                    working_directory: this.course.path,
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
                    working_directory: this.course.path,
                    env: gitEnv,
                    on_success: _updateCommitHash,
                    on_error: _cleanupAfterCommit,
                    no_job_sequence_update: true,
                };
                serverJobs.spawnJob(jobOptions);
            };

            const _updateCommitHash = () => {
                debug(`${job_sequence_id}: _updateCommitHash`);
                courseUtil.updateCourseCommitHash(this.course, (err) => {
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
                    on_error: _cleanup,
                    no_job_sequence_update: true,
                };
                serverJobs.createJob(jobOptions, (err, job) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        _finishWithFailure();
                        return;
                    }
                    syncFromDisk._syncDiskToSqlWithLock(this.course.path, this.course.id, job, (err) => {
                        if (ERR(err, (e) => logger.error(e))) {
                            debug('_syncDiskToSqlWithLock(): failure');
                            job.fail(err);
                        } else {
                            debug('_syncDiskToSqlWithLock(): success');
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
                    on_success: _unlock,
                    on_error: _cleanup,
                    no_job_sequence_update: true,
                };
                serverJobs.createJob(jobOptions, (err, job) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        _finishWithFailure();
                        return;
                    }
                    const coursePath = this.course.path;
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
                _reset(_unlock, _unlock);
            };

            const _cleanupAfterWrite = (id) => {
                debug(`Job id ${id} has failed (after write)`);
                jobSequenceHasFailed = true;
                _clean(_unlock, _unlock);
            };

            const _cleanup = (id) => {
                debug(`Job id ${id} has failed`);
                jobSequenceHasFailed = true;
                _unlock();
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
                    on_success: (jobSequenceHasFailed ? _finishWithFailure : _finishWithSuccess),
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

    getNamesForCopy(oldShortName, shortNames, oldLongName, longNames) {
        function getBaseShortName(oldname) {
            const found = oldname.match(new RegExp(`^(.*)_copy[0-9]+$`));
            if (found) {
                return found[1];
            } else {
                return oldname;
            }
        }

        function getBaseLongName(oldname) {
            debug(oldname);
            const found = oldname.match(new RegExp(`^(.*) \\(copy [0-9]+\\)$`));
            debug(found);
            if (found) {
                return found[1];
            } else {
                return oldname;
            }
        }

        function getNumberShortName(basename, oldnames) {
            let number = 1;
            oldnames.forEach((oldname) => {
                const found = oldname.match(new RegExp(`^${basename}_copy([0-9]+)$`));
                if (found) {
                    const foundNumber = parseInt(found[1]);
                    if (foundNumber >= number) {
                        number = foundNumber + 1;
                    }
                }
            });
            return number;
        }

        function getNumberLongName(basename, oldnames) {
            let number = 1;
            oldnames.forEach((oldname) => {
                const found = oldname.match(new RegExp(`^${basename} \\(copy ([0-9]+)\\)$`));
                if (found) {
                    const foundNumber = parseInt(found[1]);
                    if (foundNumber >= number) {
                        number = foundNumber + 1;
                    }
                }
            });
            return number;
        }

        const baseShortName = getBaseShortName(oldShortName);
        const baseLongName = getBaseLongName(oldLongName);
        const numberShortName = getNumberShortName(baseShortName, shortNames);
        const numberLongName = getNumberLongName(baseLongName, longNames);
        const number = (numberShortName > numberLongName) ? numberShortName : numberLongName;
        return {
            shortName: `${baseShortName}_copy${number}`,
            longName: `${baseLongName} (copy ${number})`,
        };
    }

    getNamesForAdd(shortNames, longNames) {
        function getNumberShortName(oldnames) {
            let number = 1;
            oldnames.forEach((oldname) => {
                const found = oldname.match(new RegExp(`^New_([0-9]+)$`));
                if (found) {
                    const foundNumber = parseInt(found[1]);
                    if (foundNumber >= number) {
                        number = foundNumber + 1;
                    }
                }
            });
            return number;
        }

        function getNumberLongName(oldnames) {
            let number = 1;
            oldnames.forEach((oldname) => {
                const found = oldname.match(new RegExp(`^New \\(([0-9]+)\\)$`));
                if (found) {
                    const foundNumber = parseInt(found[1]);
                    if (foundNumber >= number) {
                        number = foundNumber + 1;
                    }
                }
            });
            return number;
        }

        const numberShortName = getNumberShortName(shortNames);
        const numberLongName = getNumberLongName(longNames);
        const number = (numberShortName > numberLongName) ? numberShortName : numberLongName;
        return {
            shortName: `New_${number}`,
            longName: `New (${number})`,
        };
    }
}

class AssessmentCopyEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid}`;
    }

    write(callback) {
        debug('AssessmentCopyEditor: write()');
        const assessmentsPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name, 'assessments');
        async.waterfall([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_assessments_with_course_instance, {course_instance_id: this.course_instance.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'title');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(assessmentsPath, (err, filenames) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesShort = filenames;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate TID and Title`);
                let names = this.getNamesForCopy(this.assessment.tid, this.oldNamesShort, this.assessment.title, this.oldNamesLong);
                this.tid = names.shortName;
                this.assessmentTitle = names.longName;
                this.assessmentPath = path.join(assessmentsPath, this.tid);
                this.pathsToAdd = [
                    this.assessmentPath,
                ];
                this.commitMessage = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid} to ${this.tid}`;
                callback(null);
            },
            (callback) => {
                const fromPath = path.join(assessmentsPath, this.assessment.tid);
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
                debug(`Write infoAssessment.json with new title and uuid`);
                infoJson.title = this.assessmentTitle;
                this.uuid = uuidv4();       // <-- store uuid so we can find the new assessment in the DB
                infoJson.uuid = this.uuid;
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
        this.description = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
    }

    write(callback) {
        debug('AssessmentDeleteEditor: write()');
        const deletePath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name, 'assessments', this.assessment.tid);
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                deletePath,
            ];
            this.commitMessage = `${this.course_instance.short_name}: delete assessment ${this.assessment.tid}`;
            callback(null);
        });
    }
}

class AssessmentRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.tid_new = params.tid_new;
        this.description = `${this.course_instance.short_name}: rename assessment ${this.assessment.tid}`;
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
        const oldPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name, 'assessments', this.assessment.tid);
        const newPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name, 'assessments', this.tid_new);
        debug(`Move files\n from ${oldPath}\n to ${newPath}`);
        fs.move(oldPath, newPath, {overwrite: false}, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                oldPath,
                newPath,
            ];
            this.commitMessage = `${this.course_instance.short_name}: rename assessment ${this.assessment.tid} to ${this.tid_new}`;
            callback(null);
        });
    }
}

class AssessmentAddEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `${this.course_instance.short_name}: add assessment`;
    }

    write(callback) {
        debug('AssessmentAddEditor: write()');
        const assessmentsPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name, 'assessments');
        async.series([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_assessments_with_course_instance, {course_instance_id: this.course_instance.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'title');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(assessmentsPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "assessments" folder does
                        // not exist, and so there are no assessments yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);

                        this.oldNamesShort = [];
                    } else {
                        this.oldNamesShort = filenames;
                    }
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate TID and Title`);
                let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
                this.tid = names.shortName;
                this.assessmentTitle = names.longName;
                this.assessmentPath = path.join(assessmentsPath, this.tid);
                this.pathsToAdd = [
                    this.assessmentPath,
                ];
                this.commitMessage = `${this.course_instance.short_name}: add assessment ${this.tid}`;
                callback(null);
            },
            (callback) => {
                debug(`Write infoAssessment.json`);

                this.uuid = uuidv4();       // <-- store uuid so we can find the new assessment in the DB

                let infoJson = {
                    uuid: this.uuid,
                    type: 'Homework',
                    title: this.assessmentTitle,
                    set: 'Homework',
                    number: '1',
                    allowAccess: [],
                    zones: [],
                };

                // We use outputJson to create the directory this.assessmentsPath if it
                // does not exist (which it shouldn't). We use the file system flag 'wx'
                // to throw an error if this.assessmentPath already exists.
                fs.outputJson(path.join(this.assessmentPath, 'infoAssessment.json'), infoJson, {spaces: 4, flag: 'wx'}, (err) => {
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

class CourseInstanceCopyEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Copy course instance ${this.course_instance.short_name}`;
    }

    write(callback) {
        debug('CourseInstanceCopyEditor: write()');
        const courseInstancesPath = path.join(this.course.path, 'courseInstances');
        async.waterfall([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_course_instances_with_course, {course_id: this.course.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'long_name');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(courseInstancesPath, (err, filenames) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesShort = filenames;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate short_name and long_name`);
                let names = this.getNamesForCopy(this.course_instance.short_name, this.oldNamesShort, this.course_instance.long_name, this.oldNamesLong);
                this.short_name = names.shortName;
                this.long_name = names.longName;
                this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
                this.pathsToAdd = [
                    this.courseInstancePath,
                ];
                this.commitMessage = `copy course instance ${this.course_instance.short_name} to ${this.short_name}`;
                callback(null);
            },
            (callback) => {
                const fromPath = path.join(courseInstancesPath, this.course_instance.short_name);
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
                if (! config.devMode) {
                    debug(`Ensure ${this.user.uid} has role Instructor in new course instance`);
                    // this will either create or modify the role associated with this.user.uid
                    // (if the role was already 'Instructor', this will do nothing)
                    infoJson['userRoles'] = infoJson['userRoles'] || {};
                    infoJson.userRoles[this.user.uid] = 'Instructor';
                }
                debug(`Write infoCourseInstance.json with new longName and uuid`);
                infoJson.longName = this.long_name;
                this.uuid = uuidv4();       // <-- store uuid so we can find the new course instance in the DB
                infoJson.uuid = this.uuid;
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
        this.description = `Delete course instance ${this.course_instance.short_name}`;
    }

    write(callback) {
        debug('CourseInstanceDeleteEditor: write()');
        const deletePath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name);
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                deletePath,
            ];
            this.commitMessage = `delete course instance ${this.course_instance.short_name}`;
            callback(null);
        });
    }
}

class CourseInstanceRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.ciid_new = params.ciid_new;
        this.description = `Rename course instance ${this.course_instance.short_name}`;
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
        const oldPath = path.join(this.course.path, 'courseInstances', this.course_instance.short_name);
        const newPath = path.join(this.course.path, 'courseInstances', this.ciid_new);
        debug(`Move files\n from ${oldPath}\n to ${newPath}`);
        fs.move(oldPath, newPath, {overwrite: false}, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                oldPath,
                newPath,
            ];
            this.commitMessage = `rename course instance ${this.course_instance.short_name} to ${this.ciid_new}`;
            callback(null);
        });
    }
}

class CourseInstanceAddEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Add course instance`;
    }

    write(callback) {
        debug('CourseInstanceAddEditor: write()');
        const courseInstancesPath = path.join(this.course.path, 'courseInstances');
        async.waterfall([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_course_instances_with_course, {course_id: this.course.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'long_name');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(courseInstancesPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "courseInstances" folder does
                        // not exist, and so there are no course instances yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);

                        this.oldNamesShort = [];
                    } else {
                        this.oldNamesShort = filenames;
                    }
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate short_name and long_name`);
                let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
                this.short_name = names.shortName;
                this.long_name = names.longName;
                this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
                this.pathsToAdd = [
                    this.courseInstancePath,
                ];
                this.commitMessage = `add course instance ${this.short_name}`;
                callback(null);
            },
            (callback) => {
                debug(`Write infoCourseInstance.json`);

                this.uuid = uuidv4();       // <-- store uuid so we can find the new course instance in the DB

                let infoJson = {
                    uuid: this.uuid,
                    longName: this.long_name,
                    userRoles: {},
                    allowAccess: [],
                };

                if (! config.devMode) {
                    debug(`Ensure ${this.user.uid} has role Instructor in new course instance`);
                    infoJson.userRoles[this.user.uid] = 'Instructor';
                }

                // We use outputJson to create the directory this.courseInstancePath if it
                // does not exist (which it shouldn't). We use the file system flag 'wx' to
                // throw an error if this.courseInstancePath already exists.
                fs.outputJson(path.join(this.courseInstancePath, 'infoCourseInstance.json'), infoJson, {spaces: 4, flag: 'wx'}, (err) => {
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

class QuestionAddEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Add question`;
    }

    write(callback) {
        debug('QuestionAddEditor: write()');
        const questionsPath = path.join(this.course.path, 'questions');
        async.waterfall([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_questions_with_course, {course_id: this.course.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'title');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(questionsPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "questions" folder does
                        // not exist, and so there are no questions yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);

                        this.oldNamesShort = [];
                    } else {
                        this.oldNamesShort = filenames;
                    }
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate qid and title`);
                let names = this.getNamesForAdd(this.oldNamesShort, this.oldNamesLong);
                this.qid = names.shortName;
                this.questionTitle = names.longName;
                this.questionPath = path.join(questionsPath, this.qid);
                this.pathsToAdd = [
                    this.questionPath,
                ];
                this.commitMessage = `add question ${this.qid}`;
                callback(null);
            },
            (callback) => {
                const fromPath = path.join(__dirname, '..', 'exampleCourse', 'questions', 'demoCalculation');
                const toPath = this.questionPath;
                debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
                fs.copy(fromPath, toPath, {overwrite: false, errorOnExist: true}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Read info.json`);
                fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    callback(null, infoJson);
                });
            },
            (infoJson, callback) => {
                debug(`Write info.json with new title and uuid`);
                infoJson.title = this.questionTitle;
                this.uuid = uuidv4();       // <-- store uuid so we can find the new question in the DB
                infoJson.uuid = this.uuid;
                fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, {spaces: 4}, (err) => {
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

class QuestionDeleteEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Delete question ${this.question.qid}`;
    }

    write(callback) {
        debug('QuestionDeleteEditor: write()');
        const deletePath = path.join(this.course.path, 'questions', this.question.qid);
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                deletePath,
            ];
            this.commitMessage = `delete question ${this.question.qid}`;
            callback(null);
        });
    }
}

class QuestionRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.qid_new = params.qid_new;
        this.description = `Rename question ${this.question.qid}`;
    }

    canEdit(callback) {
        if (path.dirname(this.qid_new) !== '.') return callback(new Error(`Invalid QID: ${this.qid_new}`));
        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('QuestionRenameEditor: write()');
        const questionsPath = path.join(this.course.path, 'questions');
        async.waterfall([
            (callback) => {
                const oldPath = path.join(questionsPath, this.question.qid);
                const newPath = path.join(questionsPath, this.qid_new);
                debug(`Move files\n from ${oldPath}\n to ${newPath}`);
                fs.move(oldPath, newPath, {overwrite: false}, (err) => {
                    if (ERR(err, callback)) return;
                    this.pathsToAdd = [
                        oldPath,
                        newPath,
                    ];
                    this.commitMessage = `rename question ${this.question.qid} to ${this.qid_new}`;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Find all assessments (in all course instances) that contain ${this.question.qid}`);
                sqldb.query(sql.select_assessments_with_question, {question_id: this.question.id}, function(err, result) {
                    if (ERR(err, callback)) return;
                    callback(null, result.rows);
                });
            },
            (assessments, callback) => {
                debug(`For each assessment, read/write infoAssessment.json to replace ${this.question.qid} with ${this.qid_new}`);
                async.eachSeries(assessments, (assessment, callback) => {
                    let infoPath = path.join(this.course.path,
                                             'courseInstances',
                                             assessment.course_instance_directory,
                                             'assessments',
                                             assessment.assessment_directory,
                                             'infoAssessment.json');
                    this.pathsToAdd.push(infoPath);
                    async.waterfall([
                        (callback) => {
                            debug(`Read ${infoPath}`);
                            fs.readJson(infoPath, (err, infoJson) => {
                                if (ERR(err, callback)) return;
                                callback(null, infoJson);
                            });
                        },
                        (infoJson, callback) => {
                            debug(`Find/replace QID in ${infoPath}`);
                            let found = false;
                            infoJson.zones.forEach((zone) => {
                                zone.questions.forEach((question) => {
                                    if (question.alternatives) {
                                        question.alternatives.forEach((alternative) => {
                                            if (alternative.id == this.question.qid) {
                                                alternative.id = this.qid_new;
                                                found = true;
                                            }
                                        });
                                    } else if (question.id == this.question.qid) {
                                        question.id = this.qid_new;
                                        found = true;
                                    }
                                });
                            });
                            if (! found) logger.info(`Should have but did not find ${this.question.qid} in ${infoPath}`);
                            debug(`Write ${infoPath}`);
                            fs.writeJson(infoPath, infoJson, {spaces: 4}, (err) => {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                    ], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
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
}

class QuestionCopyEditor extends Editor {
    constructor(params) {
        super(params);
        this.description = `Copy question ${this.question.qid}`;
    }

    write(callback) {
        debug('QuestionCopyEditor: write()');
        const questionsPath = path.join(this.course.path, 'questions');
        async.waterfall([
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_questions_with_course, {course_id: this.course.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'title');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(questionsPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "questions" folder does
                        // not exist, and so there are no questions yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);

                        this.oldNamesShort = [];
                    } else {
                        this.oldNamesShort = filenames;
                    }
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate qid and title`);
                let names = this.getNamesForCopy(this.question.qid, this.oldNamesShort, this.question.title, this.oldNamesLong);
                this.qid = names.shortName;
                this.questionTitle = names.longName;
                this.questionPath = path.join(questionsPath, this.qid);
                this.pathsToAdd = [
                    this.questionPath,
                ];
                this.commitMessage = `copy question ${this.question.qid} to ${this.qid}`;
                callback(null);
            },
            (callback) => {
                const fromPath = path.join(questionsPath, this.question.qid);
                const toPath = this.questionPath;
                debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
                fs.copy(fromPath, toPath, {overwrite: false, errorOnExist: true}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Read info.json`);
                fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    callback(null, infoJson);
                });
            },
            (infoJson, callback) => {
                debug(`Write info.json with new title and uuid`);
                infoJson.title = this.questionTitle;
                this.uuid = uuidv4();       // <-- store uuid so we can find the new question in the DB
                infoJson.uuid = this.uuid;
                fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, {spaces: 4}, (err) => {
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

class QuestionTransferEditor extends Editor {
    constructor(params) {
        super(params);
        this.from_qid = params.from_qid;
        this.from_course_short_name = params.from_course_short_name;
        this.from_path = params.from_path;
        this.description = `Copy question ${this.from_qid} from course ${this.from_course_short_name}`;
    }

    write(callback) {
        debug('QuestionTransferEditor: write()');
        const questionsPath = path.join(this.course.path, 'questions');
        async.waterfall([
            (callback) => {
                debug(`Get title of question that is being copied`);
                fs.readJson(path.join(this.from_path, 'info.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    this.from_title = infoJson.title || 'Empty Title';
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing long names');
                sqldb.query(sql.select_questions_with_course, {course_id: this.course.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    this.oldNamesLong = _.map(result.rows, 'title');
                    callback(null);
                });
            },
            (callback) => {
                debug('Get all existing short names');
                fs.readdir(questionsPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "questions" folder does
                        // not exist, and so there are no questions yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);

                        this.oldNamesShort = [];
                    } else {
                        this.oldNamesShort = filenames;
                    }
                    callback(null);
                });
            },
            (callback) => {
                debug(`Generate qid and title`);
                if (this.oldNamesShort.includes(this.from_qid) || this.oldNamesLong.includes(this.from_title)) {
                    let names = this.getNamesForCopy(this.from_qid, this.oldNamesShort, this.from_title, this.oldNamesLong);
                    this.qid = names.shortName;
                    this.questionTitle = names.longName;
                } else {
                    this.qid = this.from_qid;
                    this.questionTitle = this.from_title;
                }
                this.questionPath = path.join(questionsPath, this.qid);
                this.pathsToAdd = [
                    this.questionPath,
                ];
                this.commitMessage = `copy question ${this.from_qid} (from course ${this.from_course_short_name}) to ${this.qid}`;
                callback(null);
            },
            (callback) => {
                const fromPath = this.from_path;
                const toPath = this.questionPath;
                debug(`Copy template\n from ${fromPath}\n to ${toPath}`);
                fs.copy(fromPath, toPath, {overwrite: false, errorOnExist: true}, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Read info.json`);
                fs.readJson(path.join(this.questionPath, 'info.json'), (err, infoJson) => {
                    if (ERR(err, callback)) return;
                    callback(null, infoJson);
                });
            },
            (infoJson, callback) => {
                debug(`Write info.json with new title and uuid`);
                infoJson.title = this.questionTitle;
                this.uuid = uuidv4();       // <-- store uuid so we can find the new question in the DB
                infoJson.uuid = this.uuid;
                fs.writeJson(path.join(this.questionPath, 'info.json'), infoJson, {spaces: 4}, (err) => {
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

class FileDeleteEditor extends Editor {
    constructor(params) {
        super(params);
        this.container = params.container;
        this.deletePath = params.deletePath;
        if (this.course.path == this.container.rootPath) {
            this.prefix = '';
        } else {
            this.prefix = `${path.basename(this.container.rootPath)}: `;
        }
        this.description = `${this.prefix}delete ${path.relative(this.container.rootPath, this.deletePath)}`;
    }

    canEdit(callback) {
        if (!contains(this.container.rootPath, this.deletePath)) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The path of the file to delete</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
                        `<p>must be inside the root directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
            return callback(err);
        }

        const found = this.container.invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, this.deletePath));
        if (found) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The path of the file to delete</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.deletePath}</pre></div>` +
                        `<p>must <em>not</em> be inside the directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
            return callback(err);
        }

        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('FileDeleteEditor: write()');
        // This will silently do nothing if deletePath no longer exists.
        fs.remove(this.deletePath, (err) => {
            if (ERR(err, callback)) return;
            this.pathsToAdd = [
                this.deletePath,
            ];
            this.commitMessage = this.description;
            callback(null);
        });
    }
}

class FileRenameEditor extends Editor {
    constructor(params) {
        super(params);
        this.container = params.container;
        this.oldPath = params.oldPath;
        this.newPath = params.newPath;
        if (this.course.path == this.container.rootPath) {
            this.prefix = '';
        } else {
            this.prefix = `${path.basename(this.container.rootPath)}: `;
        }
        this.description = `${this.prefix}rename ${path.relative(this.container.rootPath, this.oldPath)} to ${path.relative(this.container.rootPath, this.newPath)}`;
    }

    canEdit(callback) {
        debug('FileRenameEditor: canEdit()');
        if (!contains(this.container.rootPath, this.oldPath)) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file's old path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
                        `<p>must be inside the root directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
            return callback(err);
        }

        if (!contains(this.container.rootPath, this.newPath)) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file's new path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
                        `<p>must be inside the root directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
            return callback(err);
        }

        let found;

        found = this.container.invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, this.oldPath));
        if (found) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file's old path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
                        `<p>must <em>not</em> be inside the directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
            return callback(err);
        }

        found = this.container.invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, this.newPath));
        if (found) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file's new path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.newPath}</pre></div>` +
                        `<p>must <em>not</em> be inside the directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
            return callback(err);
        }

        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('FileRenameEditor: write()');
        async.series([
            (callback) => {
                debug(`ensure path exists`);
                fs.ensureDir(path.dirname(this.newPath), (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`rename file`);
                fs.rename(this.oldPath, this.newPath, (err) => {
                    if (ERR(err, callback)) return;
                    this.pathsToAdd = [
                        this.oldPath,
                        this.newPath,
                    ];
                    this.commitMessage = this.description;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }
}

class FileUploadEditor extends Editor {
    constructor(params) {
        super(params);
        this.container = params.container;
        this.filePath = params.filePath;
        this.fileContents = params.fileContents;
        if (this.course.path == this.container.rootPath) {
            this.prefix = '';
        } else {
            this.prefix = `${path.basename(this.container.rootPath)}: `;
        }
        this.description = `${this.prefix}upload ${path.relative(this.container.rootPath, this.filePath)}`;
    }

    getHashFromBuffer(buffer) {
        return sha256(buffer.toString('utf8')).toString();
    }

    shouldEdit(callback) {
        debug('look for old contents');
        fs.readFile(this.filePath, (err, contents) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    debug('no old contents, so continue with upload');
                    callback(null, true);
                } else {
                    ERR(err, callback);
                }
            } else {
                debug('get hash of old contents and of new contents');
                const oldHash = this.getHashFromBuffer(contents);
                const newHash = this.getHashFromBuffer(this.fileContents);
                debug('oldHash: ' + oldHash);
                debug('newHash: ' + newHash);
                if (oldHash == newHash) {
                    debug('new contents are the same as old contents, so abort upload');
                    callback(null, false);
                } else {
                    debug('new contents are different from old contents, so continue with upload');
                    callback(null, true);
                }
            }
        });
    }

    canEdit(callback) {
        if (!contains(this.container.rootPath, this.filePath)) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
                        `<p>must be inside the root directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
            return callback(err);
        }

        const found = this.container.invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, this.filePath));
        if (found) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
                        `<p>must <em>not</em> be inside the directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>`;
            return callback(err);
        }

        super.canEdit((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }

    write(callback) {
        debug('FileUploadEditor: write()');
        async.series([
            (callback) => {
                debug(`ensure path exists`);
                fs.ensureDir(path.dirname(this.filePath), (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                debug(`write file`);
                fs.writeFile(this.filePath, this.fileContents, (err) => {
                    if (ERR(err, callback)) return;
                    this.pathsToAdd = [
                        this.filePath,
                    ];
                    this.commitMessage = this.description;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }
}

module.exports = {
    AssessmentCopyEditor,
    AssessmentDeleteEditor,
    AssessmentRenameEditor,
    AssessmentAddEditor,
    CourseInstanceCopyEditor,
    CourseInstanceDeleteEditor,
    CourseInstanceRenameEditor,
    CourseInstanceAddEditor,
    QuestionCopyEditor,
    QuestionDeleteEditor,
    QuestionRenameEditor,
    QuestionAddEditor,
    QuestionTransferEditor,
    FileDeleteEditor,
    FileRenameEditor,
    FileUploadEditor,
};
