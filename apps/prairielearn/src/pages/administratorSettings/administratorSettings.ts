import asyncHandler = require('express-async-handler');
import * as express from 'express';
import { cache } from '@prairielearn/cache';

import * as error from '@prairielearn/error';
import * as chunks from '../../lib/chunks';
import { AdministratorSettings } from './administratorSettings.html';
import { IdSchema } from '../../lib/db-types';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(AdministratorSettings({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'invalidate_question_cache') {
      await cache.reset();
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_chunks') {
      const course_ids_string: string = req.body.course_ids || '';
      const authn_user_id: string = res.locals.authn_user.user_id;

      let course_ids: string[];
      try {
        course_ids = course_ids_string.split(',').map((x) => IdSchema.parse(x));
      } catch (err) {
        throw error.make(
          400,
          `could not split course_ids into an array of integers: ${course_ids_string}`,
        );
      }
      const jobSequenceId = await chunks.generateAllChunksForCourseList(course_ids, authn_user_id);
      res.redirect(res.locals.urlPrefix + '/administrator/jobSequence/' + jobSequenceId);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
