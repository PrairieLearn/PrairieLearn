// @ts-check
const asyncHandler = require('express-async-handler');
import * as path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';

import * as chunks from '../../lib/chunks';
import { config } from '../../lib/config';
import { APP_ROOT_PATH } from '../../lib/paths';
import { selectCourseById } from '../../models/course';
import { HttpStatusError } from '@prairielearn/error';
import { getQuestionCourse } from '../../lib/question-variant';
import { selectQuestionById } from '../../models/question';
import { selectVariantById } from '../../models/variant';
import { idsEqual } from '../../lib/id';

const router = Router({ mergeParams: true });

/**
 * Serves scripts and styles for v3 elements. Only serves .js and .css files, or any
 * static files from an element's "clientFilesElement" directory.
 */

const EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesElement';

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/*',
    asyncHandler(async (req, res) => {
      const filename = req.params[0];
      const pathSpl = path.normalize(filename).split('/');
      const valid =
        pathSpl[1] === CLIENT_FOLDER ||
        EXTENSION_WHITELIST.some((extension) => filename.endsWith(extension));
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

      // if (options.publicEndpoint) {
      //   res.locals.course = await selectCourseById(req.params.course_id);
      //   // TODO: don't actually assign this here if the element should come from core elements?
      // }

      let elementFilesDir;
      if (res.locals.course) {
        // Files should be served from the course directory
        let question_course;
        if (req.query.variant_id) {
          const variant = await selectVariantById(z.string().parse(req.query.variant_id));
          if (!variant || !idsEqual(variant.course_id, res.locals.course.id)) {
            throw new HttpStatusError(404, 'Not Found');
          }

          // the existence of the variant within the course validates that this course has sharing permissions on this question
          const question = await selectQuestionById(variant.question_id);
          question_course = await getQuestionCourse(question, res.locals.course);
        } else {
          question_course = res.locals.course;
        }
        const coursePath = chunks.getRuntimeDirectoryForCourse(question_course);
        await chunks.ensureChunksForCourseAsync(question_course.id, { type: 'elements' });

        elementFilesDir = path.join(coursePath, 'elements');
        res.sendFile(filename, { root: elementFilesDir, ...sendFileOptions });
      } else {
        elementFilesDir = path.join(APP_ROOT_PATH, 'elements');
        res.sendFile(filename, { root: elementFilesDir, ...sendFileOptions });
      }

      // on building different URLs to make it work: https://github.com/PrairieLearn/PrairieLearn/issues/8322
      // also edit here to point to those URLs is question course is different than variant course:
      // https://github.com/PrairieLearn/PrairieLearn/blob/72fe3496c8807e4c5b7ba2ad926c77900a2a9389/apps/prairielearn/src/question-servers/freeform.js#L[…]12
      // https://github.com/PrairieLearn/PrairieLearn/blob/72fe3496c8807e4c5b7ba2ad926c77900a2a9389/apps/prairielearn/src/question-servers/freeform.js#L[…]45
    }),
  );
  return router;
}
