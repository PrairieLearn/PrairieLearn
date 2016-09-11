var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var filePaths = require('../../file-paths');
var courseDB = require("../../course-db");

router.get('/*', function(req, res, next) {
    var course = res.locals.course;
    var filename = req.params[0];
    var clientFilesDir = path.join(res.locals.course.path, "clientFiles");
    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
