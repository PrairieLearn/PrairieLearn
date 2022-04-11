const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });
const _ = require('lodash');

const config = require('../../lib/config');

/**
 * Serves scripts and styles for element extensions. Only serves .js and .css files, or any
 * static files from an extension's "clientFilesExtension" directory.
 */

const FILE_TYPE_EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesExtension';

router.get('/*', function (req, res, next) {
  const filename = req.params[0];
  let pathSpl = path.normalize(filename).split('/');
  const valid =
    pathSpl[2] === CLIENT_FOLDER ||
    _.some(FILE_TYPE_EXTENSION_WHITELIST, (extension) => filename.endsWith(extension));
  if (!valid) {
    res.status(404);
    const err = new Error('Unable to serve that file');
    err.status = 404;
    return next(err);
  }

  // If the route includes a `cachebuster` param, we'll set the `immutable`
  // and `maxAge` options on the `Cache-Control` header. This router is
  // mounted twice - one with the cachebuster in the URL, and once without it
  // for backwards compatibility. See `server.js` for more details.
  //
  // As with `/assets/`, we assume that element files are likely to change
  // when running in dev mode, so we skip caching entirely in that case.
  const isCached = !!req.params.cachebuster && !config.devMode;

  if (isCached) {
    // `middlewares/cors.js` disables caching for all routes by default.
    // We need to remove this header so that `res.sendFile` can set it
    // correctly.
    res.removeHeader('Cache-Control');
  }

  let elementFilesDir = path.join(res.locals.course.path, 'elementExtensions');
  res.sendFile(filename, {
    root: elementFilesDir,
    immutable: isCached,
    maxAge: isCached ? '31536000s' : 0,
  });
});

module.exports = router;
