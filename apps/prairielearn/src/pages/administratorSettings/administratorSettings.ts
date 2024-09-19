import * as express from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';

import { cache } from '@prairielearn/cache';
import * as error from '@prairielearn/error';

import * as chunks from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { IdSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';

import { AdministratorSettings } from './administratorSettings.html.js';

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
      } catch {
        throw new error.HttpStatusError(
          400,
          `could not split course_ids into an array of integers: ${course_ids_string}`,
        );
      }
      const jobSequenceId = await chunks.generateAllChunksForCourseList(course_ids, authn_user_id);
      res.redirect(res.locals.urlPrefix + '/administrator/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'sync_context_documents' && isEnterprise()) {
      if (!config.openAiApiKey || !config.openAiOrganization) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }

      const client = new OpenAI({
        apiKey: config.openAiApiKey,
        organization: config.openAiOrganization,
      });

      const { syncContextDocuments } = await import('../../ee/lib/contextEmbeddings.js');
      const jobSequenceId = await syncContextDocuments(client, res.locals.authn_user.user_id);
      res.redirect('/pl/administrator/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
