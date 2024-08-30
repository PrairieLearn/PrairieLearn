import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getRuntimeDirectoryForCourse, ensureChunksForCourseAsync } from '../../lib/chunks.js';
import { config } from '../../lib/config.js';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async function (req, res) {
    const filename = req.params[0];
    if (!filename) {
      throw new HttpStatusError(400, 'No filename provided within clientFilesCourse directory');
    }

    // If the route includes a `cachebuster` param, we'll set the `immutable`
    // and `maxAge` options on the `Cache-Control` header. This router is
    // mounted twice - one with the cachebuster in the URL, and once without it
    // for backwards compatibility. See `server.js` for more details.
    //
    // As with `/assets/`, we assume that question files are likely to change
    // when running in dev mode, so we skip caching entirely in that case.
    const isCached = !!req.params.cachebuster && (!config.devMode || true);
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

    const coursePath = getRuntimeDirectoryForCourse(res.locals.course);
    await ensureChunksForCourseAsync(res.locals.course.id, { type: 'clientFilesCourse' });

    const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
    res.sendFile(filename, { root: clientFilesDir, ...sendFileOptions });
  }),
);

export default router;
