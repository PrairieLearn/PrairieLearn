import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import * as chunks from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { type Course } from '../../lib/db-types.js';
import { APP_ROOT_PATH } from '../../lib/paths.js';
import { selectCourseById } from '../../models/course.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Serves scripts and styles for v3 elements. Only serves .js and .css files, or any
 * static files from an element's "clientFilesElement" directory.
 */

const EXTENSION_WHITELIST = ['.js', '.css'];
const CLIENT_FOLDER = 'clientFilesElement';

export default function (options = { publicQuestionEndpoint: false, coreElements: false }) {
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

      let elementFilesDir: string;
      if (options.coreElements) {
        elementFilesDir = path.join(APP_ROOT_PATH, 'elements');
      } else if (options.publicQuestionEndpoint) {
        const has_publicly_shared_question = await sqldb.queryRow(
          sql.select_has_publicly_shared_question,
          { course_id: req.params.course_id },
          z.boolean(),
        );
        if (!has_publicly_shared_question) {
          throw new HttpStatusError(404, 'Not Found');
        }
        const course = await selectCourseById(req.params.course_id);
        const coursePath = chunks.getRuntimeDirectoryForCourse(course);
        await chunks.ensureChunksForCourseAsync(course.id, { type: 'elements' });

        elementFilesDir = path.join(coursePath, 'elements');
      } else {
        let question_course: Course;
        if (req.params.producing_course_id) {
          const producing_course_id = z.string().parse(req.params.producing_course_id);
          const has_shared_question = await sqldb.queryRow(
            sql.select_has_shared_question,
            { consuming_course_id: res.locals.course.id, producing_course_id },
            z.boolean(),
          );
          if (!has_shared_question) {
            throw new HttpStatusError(404, 'Not Found');
          }

          question_course = await selectCourseById(producing_course_id);
        } else {
          question_course = res.locals.course;
        }
        const coursePath = chunks.getRuntimeDirectoryForCourse(question_course);
        await chunks.ensureChunksForCourseAsync(question_course.id, { type: 'elements' });

        elementFilesDir = path.join(coursePath, 'elements');
      }

      res.sendFile(filename, { root: elementFilesDir, ...sendFileOptions });
    }),
  );
  return router;
}
