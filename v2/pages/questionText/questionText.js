var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var filePaths = require('../../lib/file-paths');

router.get('/:filename', function(req, res, next) {
    var question = res.locals.question;
    var course = res.locals.course;
    var filename = req.params.filename;
    filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
        if (ERR(err, next)) return;
        var rootPath = path.join(questionPath, "text");
        res.sendFile(filename, {root: rootPath});
    });
});

module.exports = router;
