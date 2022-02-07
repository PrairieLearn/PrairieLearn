const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });
const _ = require('lodash');

const chunks = require('../../lib/chunks');
const config = require('../../lib/config');
const ERR = require('async-stacktrace');

/**
 * Serves scripts and styles for v3 elements. Only serves .js and .css files, or any
 * static files from an element's "clientFilesElement" directory.
 */

const EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesElement';

router.get('/*', function (req, res, next) {
  const filename = req.params[0];
  const pathSpl = path.normalize(filename).split('/');
  const valid =
    pathSpl[1] === CLIENT_FOLDER ||
    _.some(EXTENSION_WHITELIST, (extension) => filename.endsWith(extension));
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
  const sendFileOptions = {
    immutable: isCached,
    maxAge: isCached ? '31536000s' : 0,
  };

  if (isCached) {
    // `middlewares/cors.js` disables caching for all routes by default.
    // We need to remove this header so that `res.sendFile` can set it
    // correctly.
    res.removeHeader('Cache-Control');
  }

  let elementFilesDir;
  if (res.locals.course) {
    // Files should be served from the course directory
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    chunks.ensureChunksForCourse(res.locals.course.id, { type: 'elements' }, (err) => {
      if (ERR(err, next)) return;
      elementFilesDir = path.join(coursePath, 'elements');
      res.sendFile(filename, { root: elementFilesDir, ...sendFileOptions });
    });
  } else {
    elementFilesDir = path.join(__dirname, '..', '..', 'elements');
    res.sendFile(filename, { root: elementFilesDir, ...sendFileOptions });
  }
});

module.exports = router;
