const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const editHelpers = require('../shared/editHelpers');
const fs = require('fs-extra');
const async = require('async');
const hljs = require('highlight.js');
const fileType = require('file-type');
const isBinaryFile = require('isbinaryfile').isBinaryFile;

function canEditFile(file) {
    // If you add to this list, you also need to add aceMode handlers in instructorFileEditor.js
    const extCanEdit = ['.py', '.html', '.json', '.txt', '.md', '.mustache', '.css', '.csv', '.js', '.m'];
    return extCanEdit.includes(path.extname(file));
}

function isHidden(item) {
    return (item[0] == '.');
}

function getPaths(req, res, callback) {
    let paths = {
        coursePath: res.locals.course.path,
    };

    if (res.locals.navPage == 'course_admin') {
        paths.rootPath = res.locals.course.path;
        paths.invalidRootPaths = [
            path.join(paths.rootPath, 'questions'),
            path.join(paths.rootPath, 'courseInstances'),
        ];
        paths.cannotMove = [
            path.join(paths.rootPath, 'infoCourse.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesCourse');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesCourse');
        paths.urlPrefix = `${res.locals.urlPrefix}/course_admin`;
    } else if (res.locals.navPage == 'instance_admin') {
        paths.rootPath = path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name);
        paths.invalidRootPaths = [
            path.join(paths.rootPath, 'assessments'),
        ];
        paths.cannotMove = [
            path.join(paths.rootPath, 'infoCourseInstance.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesCourseInstance');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesCourseInstance');
        paths.urlPrefix = `${res.locals.urlPrefix}/instance_admin`;
    } else if (res.locals.navPage == 'assessment') {
        paths.rootPath = path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name, 'assessments', res.locals.assessment.tid);
        paths.invalidRootPaths = [];
        paths.cannotMove = [
            path.join(paths.rootPath, 'infoAssessment.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesAssessment');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesAssessment');
        paths.urlPrefix = `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}`;
    } else if (res.locals.navPage == 'question') {
        paths.rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
        paths.invalidRootPaths = [];
        paths.cannotMove = [
            path.join(paths.rootPath, 'info.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesQuestion');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesQuestion');
        paths.testsDir = path.join(paths.rootPath, 'tests');
        paths.urlPrefix = `${res.locals.urlPrefix}/question/${res.locals.question.id}`;
    } else {
        return callback(new Error(`Invalid navPage: ${res.locals.navPage}`));
    }

    if (req.params[0]) {
        try {
            paths.workingPath = path.join(res.locals.course.path, decodeURIComponent(req.params[0]));
        } catch(err) {
            return callback(new Error(`Invalid path: ${req.params[0]}`));
        }
    } else {
        paths.workingPath = paths.rootPath;
    }
    paths.workingPathRelativeToCourse = path.relative(res.locals.course.path, paths.workingPath);

    if (paths.workingPath == paths.rootPath) {
        paths.specialDirs = [];
        if (paths.clientDir) {
            paths.specialDirs.push({
                label: 'Client',
                path: paths.clientDir,
                info: `This file will be placed in the subdirectory <code>${path.basename(paths.clientDir)}</code> and will be accessible from the student's webbrowser.`,
            });
        }
        if (paths.serverDir) {
            paths.specialDirs.push({
                label: 'Server',
                path: paths.serverDir,
                info: `This file will be placed in the subdirectory <code>${path.basename(paths.serverDir)}</code> and will be accessible only from the server. It will not be accessible from the student's webbrowser.`,
            });
        }
        if (paths.testsDir) {
            paths.specialDirs.push({
                label: 'Test',
                path: paths.testsDir,
                info: `This file will be placed in the subdirectory <code>${path.basename(paths.testsDir)}</code> and will be accessible only from the server. It will not be accessible from the student's webbrowser. This is appropriate for code to support <a href='https://prairielearn.readthedocs.io/en/latest/externalGrading/'>externally graded questions</a>.`,
            });
        }
    }

    if (!editHelpers.contains(paths.rootPath, paths.workingPath)) {
        let err = new Error('Invalid working directory');
        err.info =  `<p>The working directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.workingPath}</pre></div>` +
                    `<p>must be inside the root directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.rootPath}</pre></div>` +
                    `<p>when looking at <code>${res.locals.navPage}</code> files.</p>`;
        return callback(err);
    }

    const found = paths.invalidRootPaths.find((invalidRootPath) => editHelpers.contains(invalidRootPath, paths.workingPath));
    if (found) {
        let err = new Error('Invalid working directory');
        err.info =  `<p>The working directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.workingPath}</pre></div>` +
                    `<p>must <em>not</em> be inside the directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${found}</pre></div>` +
                    `<p>when looking at <code>${res.locals.navPage}</code> files.</p>`;
        return callback(err);
    }

    let curPath = res.locals.course.path;
    paths.branch = [{
        name: path.basename(curPath),
        path: path.relative(res.locals.course.path, curPath),
        canView: editHelpers.contains(paths.rootPath, curPath),
    }];
    path.relative(res.locals.course.path, paths.workingPath).split(path.sep).forEach((dir) => {
        if (dir) {
            curPath = path.join(curPath, dir);
            paths.branch.push({
                name: path.basename(curPath),
                path: path.relative(res.locals.course.path, curPath),
                canView: editHelpers.contains(paths.rootPath, curPath),
            });
        }
    });

    callback(null, paths);
}

function browseDirectory(file_browser, callback) {
    async.waterfall([
        (callback) => {
            fs.readdir(file_browser.paths.workingPath, (err, filenames) => {
                if (ERR(err, callback)) return;
                callback(null, filenames);
            });
        },
        (filenames, callback) => {
            file_browser.files = [];
            file_browser.dirs = [];
            async.eachOfSeries(filenames.sort(), (filename, index, callback) => {
                if (isHidden(filename)) return callback(null);
                const filepath = path.join(file_browser.paths.workingPath, filename);
                fs.lstat(filepath, (err, stats) => {
                    if (ERR(err, callback)) return;
                    if (stats.isFile()) {
                        const editable = canEditFile(filepath);
                        const movable = !file_browser.paths.cannotMove.includes(filepath);
                        file_browser.files.push({
                            id: index,
                            name: filename,
                            path: path.relative(file_browser.paths.coursePath, filepath),
                            dir: file_browser.paths.workingPath,
                            canEdit: editable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
                            canUpload: file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
                            canDownload: file_browser.has_course_permission_edit,
                            canRename: movable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
                            canDelete: movable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
                            canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) => editHelpers.contains(invalidRootPath, filepath)),
                        });
                    } else if (stats.isDirectory()) {
                        file_browser.dirs.push({
                            id: index,
                            name: filename,
                            path: path.relative(file_browser.paths.coursePath, filepath),
                            canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) => editHelpers.contains(invalidRootPath, filepath)),
                        });
                    }
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

function browseFile(file_browser, callback) {
    async.waterfall([
        (callback) => {
            fs.readFile(file_browser.paths.workingPath, (err, contents) => {
                if (ERR(err, callback)) return;
                callback(null, contents);
            });
        },
        (contents, callback) => {
            isBinaryFile(contents).then((result) => {
                debug(`isBinaryFile: ${result}`);
                file_browser.isBinary = result;
                if (result) {
                    try { // FIXME (check for PDF, etc.)
                    const type = fileType(contents);
                        debug(`file type: ${type}`);
                        if (type) {
                            if (type.mime.startsWith('image')) {
                                file_browser.isImage = true;
                            } else if (type.mime == ('application/pdf')) {
                                file_browser.isPDF = true;
                            }
                        }
                        callback(null);
                    } catch(err) {
                        callback(new Error('Invalid file contents'));
                    }
                } else {
                    debug(`found a text file`);
                    file_browser.isText = true;
                    file_browser.contents = hljs.highlightAuto(contents.toString('utf8')).value;
                    callback(null);
                }
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null); // should never get here
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        const filepath = file_browser.paths.workingPath;
        const editable = !file_browser.isBinary;
        const movable = !file_browser.paths.cannotMove.includes(filepath);
        file_browser.file = {
            id: 0,
            name: path.basename(file_browser.paths.workingPath),
            path: path.relative(file_browser.paths.coursePath, filepath),
            dir: path.dirname(file_browser.paths.workingPath),
            canEdit: editable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
            canUpload: file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
            canDownload: file_browser.has_course_permission_edit,
            canRename: movable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
            canDelete: movable && file_browser.has_course_permission_edit && (! file_browser.isExampleCourse),
            canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) => editHelpers.contains(invalidRootPath, filepath)),
        };
        callback(null);
    });
}

router.get('/*', function(req, res, next) {
    debug('GET /');
    let file_browser = {
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        isExampleCourse: res.locals.course.options.isExampleCourse,
    };
    async.waterfall([
        (callback) => {
            debug('get paths');
            getPaths(req, res, (err, paths) => {
                if (ERR(err, callback)) return;
                file_browser.paths = paths;
                callback(null);
            });
        },
        (callback) => {
            fs.lstat(file_browser.paths.workingPath, (err, stats) => {
                if (ERR(err, callback)) return;
                callback(null, stats);
            });
        },
        (stats, callback) => {
            if (stats.isDirectory()) {
                file_browser.isFile = false;
                browseDirectory(file_browser, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else if (stats.isFile()) {
                file_browser.isFile = true;
                browseFile(file_browser, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(new Error(`Invalid working path - ${file_browser.paths.workingPath} is neither a directory nor a file`));
            }
        },
    ], (err) => {
        if (err) {
            if ((err.code == 'ENOENT') && (file_browser.paths.branch.length > 1)) {
                res.redirect(`${res.locals.urlPrefix}/${res.locals.navPage}/file_view/${encodeURIComponent(file_browser.paths.branch.slice(-2)[0].path)}`);
                return;
            } else {
                return ERR(err, next);
            }
        }
        res.locals.file_browser = file_browser;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/*', function(req, res, next) {
    debug('POST /');
    getPaths(req, res, (err, paths) => {
        if (ERR(err, next)) return;
        editHelpers.processFileAction(req, res, {
            container: {
                rootPath: paths.rootPath,
                invalidRootPaths: paths.invalidRootPaths,
            },
        }, next);
    });
});

module.exports = router;
