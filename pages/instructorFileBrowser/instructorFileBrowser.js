const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const editHelpers = require('../shared/editHelpers');
const fs = require('fs-extra');
const async = require('async');

function canEditFile(file) {
    // If you add to this list, you also need to add aceMode handlers in instructorFileEditor.js
    const extCanEdit = ['.py', '.html', '.json', '.txt', '.md', '.mustache', '.css', '.csv', '.js', '.m'];
    return extCanEdit.includes(path.extname(file));
}

function isHidden(item) {
    return (item[0] == '.');
}

function contains(parentPath, childPath) {
    const relPath = path.relative(parentPath, childPath);
    return (!(relPath.split(path.sep)[0] == '..' || path.isAbsolute(relPath)));
}

function getPaths(req, res, callback) {
    let paths = {};

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
    } else if (res.locals.navPage == 'assessment') {
        paths.rootPath = path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name, 'assessments', res.locals.assessment.tid);
        paths.invalidRootPaths = [];
        paths.cannotMove = [
            path.join(paths.rootPath, 'infoAssessment.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesAssessment');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesAssessment');
    } else if (res.locals.navPage == 'question') {
        paths.rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
        paths.invalidRootPaths = [];
        paths.cannotMove = [
            path.join(paths.rootPath, 'info.json'),
        ];
        paths.clientDir = path.join(paths.rootPath, 'clientFilesQuestion');
        paths.serverDir = path.join(paths.rootPath, 'serverFilesQuestion');
        paths.testsDir = path.join(paths.rootPath, 'tests');
    } else {
        return callback(new Error(`Invalid navPage: ${res.locals.navPage}`));
    }

    if (typeof req.query.path == 'undefined') {
        paths.workingPath = paths.rootPath;
    } else {
        try {
            paths.workingPath = path.join(res.locals.course.path, req.query.path);
        } catch(err) {
            return callback(new Error(`Invalid query: path=${req.query.path}`));
        }
    }

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

    if (!contains(paths.rootPath, paths.workingPath)) {
        let err = new Error('Invalid working directory');
        err.info =  `<p>The working directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.workingPath}</pre></div>` +
                    `<p>must be inside the root directory</p>` +
                    `<div class="container"><pre class="bg-dark text-white rounded p-2">${paths.rootPath}</pre></div>` +
                    `<p>when looking at <code>${res.locals.navPage}</code> files.</p>`;
        return callback(err);
    }

    const found = paths.invalidRootPaths.find((invalidRootPath) => contains(invalidRootPath, paths.workingPath));
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
        canView: contains(paths.rootPath, curPath),
    }];
    path.relative(res.locals.course.path, paths.workingPath).split(path.sep).forEach((dir) => {
        if (dir) {
            curPath = path.join(curPath, dir);
            paths.branch.push({
                name: path.basename(curPath),
                path: path.relative(res.locals.course.path, curPath),
                canView: contains(paths.rootPath, curPath),
            });
        }
    });

    callback(null, paths);
}

router.get('/', function(req, res, next) {
    debug('GET /');

    const has_course_permission_edit = res.locals.authz_data.has_course_permission_edit;
    const isExampleCourse = res.locals.course.options.isExampleCourse;

    let file_browser = {};
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
            // Validate base directory - is it actually a directory?
            fs.lstat(file_browser.paths.workingPath, (err, stats) => {
                if (ERR(err, callback)) return;
                if (!stats.isDirectory()) return callback(new Error(`Attempting to browse a non-directory: ${file_browser.paths.workingPath}`));
                callback(null);
            });
        },
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
                            path: path.relative(res.locals.course.path, filepath),
                            canEdit: editable && has_course_permission_edit && (! isExampleCourse),
                            canUpload: has_course_permission_edit && (! isExampleCourse),
                            canDownload: has_course_permission_edit,
                            canRename: movable && has_course_permission_edit && (! isExampleCourse),
                            canDelete: movable && has_course_permission_edit && (! isExampleCourse),
                        });
                    } else if (stats.isDirectory()) {
                        file_browser.dirs.push({
                            id: index,
                            name: filename,
                            path: path.relative(res.locals.course.path, filepath),
                            canView: !file_browser.paths.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, filepath)),
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
        if (ERR(err, next)) return;
        res.locals.file_browser = file_browser;
        debug(res.locals.file_browser);
        debug(res.locals.file_browser.paths.branch);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
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
