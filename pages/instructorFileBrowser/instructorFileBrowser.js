const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const editHelpers = require('../shared/editHelpers');
const fs = require('fs-extra');
const error = require('@prairielearn/prairielib/error');
const async = require('async');

function canEditFile(file) {
    // If you add to this list, you also need to add aceMode handlers in instructorFileEditor.js
    const extCanEdit = ['.py', '.html', '.json', '.txt', '.md'];
    return extCanEdit.includes(path.extname(file));
}

function canMoveFile(file) {
    const cannotMove = ['info.json', 'infoAssessment.json', 'infoCourseInstance.json', 'infoCourse.json'];
    return (! cannotMove.includes(path.basename(file)));
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
    } else if (res.locals.navPage == 'instance_admin') {
        paths.rootPath = path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name);
        paths.invalidRootPaths = [
            path.join(paths.rootPath, 'assessments'),
        ];
    } else if (res.locals.navPage == 'assessment') {
        paths.rootPath = path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name, 'assessments', res.locals.assessment.tid);
        paths.invalidRootPaths = [];
    } else if (res.locals.navPage == 'question') {
        paths.rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid);
        paths.invalidRootPaths = [];
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

    if (!contains(paths.rootPath, paths.workingPath)) {
        return callback(new Error(`Working directory must be inside ${paths.rootPath} from navPage ${res.locals.navPage}`));
    }
    if (paths.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, paths.workingPath))) {
        return callback(new Error(`Working directory must not be inside any of ${paths.invalidRootPaths} from navPage ${res.locals.navPage}`));
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
            debug(`add ${dir} to branch`);
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
                        const movable = canMoveFile(filepath);
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




    // FIXME
    //
    // You need three things here:
    //  - validRootPath
    //  - invalidRootPaths
    //  - browsePath, or whatever we want to call it, with respect to which "input paths" are defined
    //      FIXME: should call this "working path" (or "working dir") to be consistent with shell terminology (e.g., "pwd")
    //
    getPaths(req, res, (err, paths) => {
        if (ERR(err, next)) return;
        editHelpers.processFileAction(req, res, {
            container: {
                rootPath: paths.rootPath,
                invalidRootPaths: paths.invalidRootPaths,
            },
        }, next);
    })
});

module.exports = router;
