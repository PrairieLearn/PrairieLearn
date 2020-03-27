var path = require('path');
var express = require('express');
var router = express.Router();

router.get('/*', function(req, res, _next) {
    var filename = req.params[0];
    console.log(filename);
    var clientFilesDir = path.join(
        res.locals.course.path,
        'questions',
    );
    console.log(clientFilesDir);
    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
