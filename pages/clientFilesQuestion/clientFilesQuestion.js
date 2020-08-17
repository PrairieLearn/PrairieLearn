var path = require('path');
var express = require('express');
var router = express.Router();

const chunks = require('../../lib/chunks');

router.get('/*', function(req, res, _next) {
    var filename = req.params[0];
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    var clientFilesDir = path.join(
        coursePath,
        'questions',
        res.locals.question.directory,
        'clientFilesQuestion',
    );
    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
