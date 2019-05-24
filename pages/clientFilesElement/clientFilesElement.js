const path = require('path');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

router.get('/*', function(req, res, _next) {
    var filename = req.params[0];
    /* The :element_id param doesn't get passed into req.params, so split on the URL */
    var pathspl = req.baseUrl.split('/');
    var element = pathspl[pathspl.length - 2]; 
    var clientFilesDir = path.join(
        res.locals.course.path,
        'elements',
        element,
        'clientFilesElement'
    );

    res.sendFile(filename, {root: clientFilesDir});
});

module.exports = router;
