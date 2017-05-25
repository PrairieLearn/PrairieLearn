var path = require('path');
var express = require('express');
var router = express.Router();

router.get('/*', function(req, res) {
    var filename = req.params[0];
    var clientFilesDir = path.join(
        res.locals.course.path,
        'questions',
        res.locals.question.directory,
        'clientFilesQuestion'
    );
    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
