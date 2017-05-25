var path = require('path');
var express = require('express');
var router = express.Router();


router.get('/*', function(req, res, _next) {
    var filename = req.params[0];
    var clientFilesDir = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'clientFilesCourseInstance'
    );
    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
