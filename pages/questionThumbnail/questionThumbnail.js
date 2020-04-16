var path = require('path');
var express = require('express');
var fs = require('fs');
var router = express.Router();

router.get('/:qid/:filename', function(req, res, _next) {
    var qid = req.params['qid'];
    var filename = req.params['filename'];
    var clientFilesDir = path.join(
        res.locals.course.path,
        'questions',
        qid,
    );
    res.sendFile(filename, {maxAge: 86400000 * 30, root: clientFilesDir});
});

module.exports = router;
