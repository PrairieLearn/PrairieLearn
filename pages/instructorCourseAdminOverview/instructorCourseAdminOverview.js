const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
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
        if (ERR(err, next)) return;
        res.locals.files = files;
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
