const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });
const _ = require('lodash');
const ERR = require('async-stacktrace');

const error = require('@prairielearn/error');
const { config } = require('../../lib/config');
const chunks = require('../../lib/chunks');

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
    next(error.make(404, 'Unable to serve that file'));
    return;
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

  const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
  chunks.ensureChunksForCourse(res.locals.course.id, { type: 'elementExtensions' }, (err) => {
    if (ERR(err, next)) return;

    const elementFilesDir = path.join(coursePath, 'elementExtensions');
    res.sendFile(filename, {
      root: elementFilesDir,
      immutable: isCached,
      maxAge: isCached ? '31536000s' : 0,
    });
  });
});

module.exports = router;
