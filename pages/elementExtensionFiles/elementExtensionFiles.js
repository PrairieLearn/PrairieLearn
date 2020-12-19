const path = require('path');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

/**
 * Serves scripts and styles for element extensions. Only serves .js and .css files, or any
 * static files from an extension's "clientFilesExtension" directory. 
 */

const FILE_TYPE_EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesExtension';

router.get('/*', function(req, res, next) {
    const filename = req.params[0];
    let pathSpl = path.normalize(filename).split('/');
    const valid = pathSpl[2] == CLIENT_FOLDER ||
          _.some(FILE_TYPE_EXTENSION_WHITELIST, (extension) => filename.endsWith(extension));
    if (!valid) {
        res.status(404);
        const err = new Error('Unable to serve that file');
        err.status = 404;
        return next(err);
    }

    let elementFilesDir = path.join(res.locals.course.path, 'elementExtensions');
    res.sendFile(filename, {root: elementFilesDir});
});

module.exports = router;
