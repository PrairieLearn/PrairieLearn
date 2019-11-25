const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const editHelpers = require('../shared/editHelpers');

router.get('/', function(req, res, next) {
    debug('GET /');
    debug('get files');
    editHelpers.getFiles({
        courseDir: res.locals.course.path,
        baseDir: res.locals.course.path,
        clientFilesDir: 'clientFilesCourse',
        serverFilesDir: 'serverFilesCourse',
        ignoreDirs: ['questions', 'elements', 'courseInstances'],
    }, (err, files) => {
        if (err) {
            if (err.code == 'ENOENT') res.locals.files = undefined;
            else return ERR(err, next);
        } else {
            res.locals.files = files;
        }

        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    debug('POST /');
    editHelpers.processFileAction(req, res, {
        container: res.locals.course.path,
    }, next);
});

module.exports = router;
