const path = require('path');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

/**
 * Serves scripts and styles for v3 elements. Only serves .js and .css files, or any
 * static files from an element's "clientFilesElement" directory.
 */

const EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesElement';

router.get('/*', function(req, res, next) {
    const filename = req.params[0];
    const pathSpl = path.normalize(filename).split('/');
    const valid = pathSpl[1] == CLIENT_FOLDER ||
          _.some(EXTENSION_WHITELIST, (extension) => filename.endsWith(extension));
    if (!valid) {
        res.status(404);
        const err = new Error('Unable to serve that file');
        err.status = 404;
        return next(err);
    }

    let elementFilesDir;
    if (res.locals.course) {
        // Files should be served from the course directory
        const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
        chunks.ensureChunksForCourse(res.locals.course.id, {'type': 'elements'}, (err) => {
            if (ERR(err, next)) return;
            elementFilesDir = path.join(coursePath, 'elements');
            res.sendFile(filename, {root: elementFilesDir});
        });
    } else {
        elementFilesDir = path.join(__dirname, '..', '..', 'elements');
        res.sendFile(filename, {root: elementFilesDir});
    }
});

module.exports = router;
