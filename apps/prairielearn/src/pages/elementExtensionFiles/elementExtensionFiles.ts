import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getRuntimeDirectoryForCourse, ensureChunksForCourseAsync } from '../../lib/chunks.js';
import { config } from '../../lib/config.js';

const router = Router({ mergeParams: true });

/**
 * Serves scripts and styles for element extensions. Only serves .js and .css files, or any
 * static files from an extension's "clientFilesExtension" directory.
 */

const FILE_TYPE_EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesExtension';

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const filename = req.params[0];
    const pathSpl = path.normalize(filename).split('/');
    const valid =
      pathSpl[2] === CLIENT_FOLDER ||
      FILE_TYPE_EXTENSION_WHITELIST.some((extension) => filename.endsWith(extension));
    if (!valid) {
      throw new HttpStatusError(404, 'Unable to serve that file');
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

    const coursePath = getRuntimeDirectoryForCourse(res.locals.course);
    await ensureChunksForCourseAsync(res.locals.course.id, { type: 'elementExtensions' });

    const elementFilesDir = path.join(coursePath, 'elementExtensions');
    res.sendFile(filename, {
      root: elementFilesDir,
      immutable: isCached,
      maxAge: isCached ? '31536000s' : 0,
    });
  }),
);

export default router;
