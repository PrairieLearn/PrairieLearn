const ERR = require('async-stacktrace');
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
                    working_directory: this.course.path,
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
                    working_directory: this.course.path,
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
                    on_error: _finishWithFailure,
                    no_job_sequence_update: true,
                };
                serverJobs.createJob(jobOptions, (err, job) => {
                    if (ERR(err, (e) => logger.error(e))) {
                        _finishWithFailure();
                        return;
                    }
                    syncFromDisk.syncDiskToSql(this.course.path, this.course.id, job, (err) => {
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
                    working_directory: this.course.path,
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
                debug(`Generate unique TID in ${assessmentsPath}`);
                fs.readdir(assessmentsPath, (err, filenames) => {
                    if (ERR(err, callback)) return;

                    let number = 1;
                    filenames.forEach((filename) => {
                        const regex = new RegExp(`^${this.assessment_set.abbreviation}([0-9]+)$`);
                        let found = filename.match(regex);
                        if (found) {
                            const foundNumber = parseInt(found[1]);
                            if (foundNumber >= number) {
                                number = foundNumber + 1;
                            }
                        }
                    });

                    this.tid = `${this.assessment_set.abbreviation}${number}`;
                    this.assessmentNumber = number,
                    this.assessmentPath = path.join(assessmentsPath, this.tid);
                    this.pathsToAdd = [
                        this.assessmentPath,
                    ];
                    this.commitMessage = `${this.course_instance.short_name}: copy assessment ${this.assessment.tid} to ${this.tid}`;
                    callback(null);
                });
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
                debug(`Write infoAssessment.json with new title, uuid, and number`);
                infoJson.title = 'Replace this title';
                this.uuid = uuidv4();       // <-- store uuid so we can find the new assessment in the DB
                infoJson.uuid = this.uuid;
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
                debug(`Generate unique TID in ${assessmentsPath}`);
                fs.readdir(assessmentsPath, (err, filenames) => {
                    let number = 1;

                    if (err) {
                        // if the code is ENOENT, then the "assessments" folder does
                        // not exist, and so there are no assessments yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);
                    } else {
                        filenames.forEach((filename) => {
                            let found = filename.match(/^HW([0-9]+)$/);
                            if (found) {
                                const foundNumber = parseInt(found[1]);
                                if (foundNumber >= number) {
                                    number = foundNumber + 1;
                                }
                            }
                        });
                    }

                    this.tid = `HW${number}`;
                    this.assessmentNumber = number,
                    this.assessmentPath = path.join(assessmentsPath, this.tid);
                    this.pathsToAdd = [
                        this.assessmentPath,
                    ];
                    this.commitMessage = `${this.course_instance.short_name}: add assessment ${this.tid}`;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Write infoAssessment.json`);

                this.uuid = uuidv4();       // <-- store uuid so we can find the new assessment in the DB

                // "number" may not be unique - that's ok, the user can change it later -
                // what's important is that "tid" is unique (see above), because that's a
                // directory name
                let infoJson = {
                    uuid: this.uuid,
                    type: 'Homework',
                    title: 'Replace this title',
                    set: 'Homework',
                    number: `${this.assessmentNumber}`,
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
        const courseInstancesPath = path.join(this.course.path, 'courseInstances');
        async.waterfall([
            (callback) => {
                debug(`Generate unique short_name in ${courseInstancesPath}`);
                fs.readdir(courseInstancesPath, (err, filenames) => {
                    if (ERR(err, callback)) return;

                    // Make some effort to create the next sane short_name
                    this.short_name = '';
                    if (! this.short_name) {
                        let short_name = this.getNextNameShort(this.course_instance.short_name);
                        if (! filenames.includes(short_name)) {
                            this.short_name = short_name;
                        }
                    }
                    if (! this.short_name) {
                        let short_name = this.getNextNameLong(this.course_instance.short_name);
                        if (! filenames.includes(short_name)) {
                            this.short_name = short_name;
                        }
                    }

                    // Fall back to <name>_copyXX
                    if (! this.short_name) {
                        // Make some effort to avoid <name>_copy1_copy1_...
                        let prefix;
                        let number;
                        let prefixAndNumber = this.getPrefixAndNumber(this.course_instance.short_name);
                        if (prefixAndNumber) {
                            prefix = prefixAndNumber.prefix;
                            number = prefixAndNumber.number + 1;
                        } else {
                            prefix = this.course_instance.short_name;
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
                    this.commitMessage = `copy course instance ${this.course_instance.short_name} to ${this.short_name}`;
                    callback(null);
                });
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
                debug(`Write infoCourseInstance.json with new title, uuid, and number`);
                infoJson.longName = `Replace this long name (${this.short_name})`;
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

    getNextNameShort() {
        const today = new Date();
        const month = today.getMonth();
        let nextSeason;
        let nextYear = today.getFullYear() - 2000;
        if (month <= 4) {
            nextSeason = 'Su';
        } else if (month <= 7) {
            nextSeason = 'Fa';
        } else {
            nextSeason = 'Sp';
            nextYear += 1;
        }
        return `${nextSeason}${nextYear.toString().padStart(2, '0')}`;
    }

    write(callback) {
        debug('CourseInstanceAddEditor: write()');
        const courseInstancesPath = path.join(this.course.path, 'courseInstances');
        async.waterfall([
            (callback) => {
                debug(`Generate unique short_name in ${courseInstancesPath}`);
                fs.readdir(courseInstancesPath, (err, filenames) => {
                    if (err) {
                        // if the code is ENOENT, then the "courseInstances" folder does
                        // not exist, and so there are no course instances yet - otherwise,
                        // something has gone wrong
                        if (err.code == 'ENOENT') filenames = [];
                        else return ERR(err, callback);
                    }

                    // Make some effort to create a sane short_name
                    this.short_name = '';
                    if (! this.short_name) {
                        let short_name = this.getNextNameShort();
                        if (! filenames.includes(short_name)) {
                            this.short_name = short_name;
                        }
                    }

                    // Fall back to courseInstanceX
                    if (! this.short_name) {
                        let number = 1;
                        filenames.forEach((filename) => {
                            let found = filename.match(/^courseInstance([0-9]+)$/);
                            if (found) {
                                const foundNumber = parseInt(found[1]);
                                if (foundNumber >= number) {
                                    number = foundNumber + 1;
                                }
                            }
                        });
                        this.short_name = `courseInstance${number}`;
                    }

                    this.courseInstancePath = path.join(courseInstancesPath, this.short_name);
                    this.pathsToAdd = [
                        this.courseInstancePath,
                    ];
                    this.commitMessage = `add course instance ${this.short_name}`;
                    callback(null);
                });
            },
            (callback) => {
                debug(`Write infoCourseInstance.json`);

                this.uuid = uuidv4();       // <-- store uuid so we can find the new course instance in the DB

                // "number" may not be unique - that's ok, the user can change it later -
                // what's important is that "tid" is unique (see above), because that's a
                // directory name
                let infoJson = {
                    uuid: this.uuid,
                    longName: `Replace this long name (${this.short_name})`,
                    userRoles: {},
                    allowAccess: [],
                };

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
                debug(`Generate unique QID`);
                fs.readdir(questionsPath, (err, filenames) => {
                    let number = 1;

                    if (err) {
                        // if the code is ENOENT, then the "questions" folder does
                        // not exist, and so there are no questions yet - otherwise,
                        // something has gone wrong
                        if (err.code != 'ENOENT') return ERR(err, callback);
                    } else {
                        filenames.forEach((filename) => {
                            let found = filename.match(/^question-([0-9]+)$/);
                            if (found) {
                                const foundNumber = parseInt(found[1]);
                                if (foundNumber >= number) {
                                    number = foundNumber + 1;
                                }
                            }
                        });
                    }

                    this.qid = `question-${number}`;
                    this.questionPath = path.join(questionsPath, this.qid);
                    this.pathsToAdd = [
                        this.questionPath,
                    ];
                    this.commitMessage = `add question ${this.qid}`;
                    callback(null);
                });
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
                infoJson.title = 'Replace this title';
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
                debug(`Generate unique QID`);
                fs.readdir(questionsPath, (err, filenames) => {
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

                    this.qid = `question-${number}`;
                    this.questionPath = path.join(this.course.path, 'questions', this.qid);
                    this.pathsToAdd = [
                        this.questionPath,
                    ];
                    this.commitMessage = `copy question ${this.question.qid} to ${this.qid}`;
                    callback(null);
                });
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
                infoJson.title = 'Replace this title';
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
                debug(`Generate unique QID`);
                fs.readdir(questionsPath, (err, filenames) => {
                    if (ERR(err, callback)) return;

                    if (filenames.includes(this.from_qid)) {
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
                        this.qid = `question-${number}`;
                    } else {
                        this.qid = this.from_qid;
                    }

                    this.questionPath = path.join(questionsPath, this.qid);
                    this.pathsToAdd = [
                        this.questionPath,
                    ];
                    this.commitMessage = `copy question ${this.from_qid} (from course ${this.from_course_short_name}) to ${this.qid}`;
                    callback(null);
                });
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
                infoJson.title = 'Replace this title';
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
        if (!contains(this.container.rootPath, this.oldPath)) {
            let err = new Error('Invalid file path');
            err.info =  `<p>The file's old path</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.oldPath}</pre></div>` +
                        `<p>must be inside the root directory</p>` +
                        `<div class="container"><pre class="bg-dark text-white rounded p-2">${this.container.rootPath}</pre></div>`;
            return callback(err);
        }

        if (!contains(this.container.rootPath, this.oldPath)) {
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
