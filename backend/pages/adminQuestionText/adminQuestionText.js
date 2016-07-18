var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var filePaths = require('../../file-paths');
var courseDB = require("../../course-db");

router.get('/:filename', function(req, res, next) {
    var question = req.locals.question;
    var course = req.locals.course;
    var filename = req.params.filename;
    filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
        if (err) {logger.error('could not determine questionPath', err); return res.status(500).end();}
        var rootPath = path.join(questionPath, "text");
        res.sendFile(filename, {root: rootPath});
    });
});

module.exports = router;
