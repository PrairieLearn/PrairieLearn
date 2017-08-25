const path = require('path');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

/**
 * Serves scripts and styles for v3 elements. Only serves .js and .css files.
 */

const EXTENSION_WHITELIST = ['.js', '.css'];

router.get('/*', function(req, res, next) {
    const filename = req.params[0];
    const valid = _.some(EXTENSION_WHITELIST, (extension) => filename.endsWith(extension));
    if (!valid) {
        res.status(404);
        const err = new Error('Unable to serve that file');
        err.status = 404;
        return next(err);
    }

    let elementFilesDir;
    if (res.locals.course) {
        // Files should be served from the course directory
        elementFilesDir = path.join(res.locals.course.path, 'elements');
    } else {
        elementFilesDir = path.resolve(__dirname, '../../question-servers/elements/');
    }

    res.sendFile(filename, {root: elementFilesDir});
});

module.exports = router;
