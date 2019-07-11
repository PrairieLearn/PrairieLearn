var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var filePaths = require('../../lib/file-paths');

router.get('/:filename', function(req, res, next) {
    var question = res.locals.question;
    var course = res.locals.course;
    var filename = 'text/' + req.params.filename;
    filePaths.questionFilePath(filename, question.directory, course.path, question, function(err, fullPath, effectiveFilename, rootPath) {
        if (ERR(err, next)) return;
        res.sendFile(effectiveFilename, {root: rootPath});
    });
});

module.exports = router;
