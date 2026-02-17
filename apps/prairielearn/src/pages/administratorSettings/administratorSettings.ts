import { createOpenAI } from '@ai-sdk/openai';
import { Router } from 'express';

import { cache } from '@prairielearn/cache';
import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { QUESTION_BENCHMARKING_OPENAI_MODEL } from '../../ee/lib/ai-question-generation-benchmark.js';
import * as chunks from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { AdministratorSettings } from './administratorSettings.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    res.send(AdministratorSettings({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if (!res.locals.is_administrator) throw new Error('Insufficient permissions');

    if (req.body.__action === 'invalidate_question_cache') {
      await cache.reset();
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_chunks') {
      const course_ids_string: string = req.body.course_ids || '';
      const authn_user_id: string = res.locals.authn_user.id;

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
      if (
        !config.aiQuestionGenerationOpenAiApiKey ||
        !config.aiQuestionGenerationOpenAiOrganization
      ) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }

      const openai = createOpenAI({
        apiKey: config.aiQuestionGenerationOpenAiApiKey,
        organization: config.aiQuestionGenerationOpenAiOrganization,
      });

      const { syncContextDocuments } = await import('../../ee/lib/contextEmbeddings.js');
      const jobSequenceId = await syncContextDocuments(
        openai.textEmbeddingModel('text-embedding-3-small'),
        res.locals.authn_user.id,
      );
      res.redirect('/pl/administrator/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'benchmark_question_generation') {
      // We intentionally only enable this in dev mode since it could pollute
      // the production database.
      if (
        !config.aiQuestionGenerationOpenAiApiKey ||
        !config.aiQuestionGenerationOpenAiOrganization ||
        !config.devMode
      ) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }

      const openai = createOpenAI({
        apiKey: config.aiQuestionGenerationOpenAiApiKey,
        organization: config.aiQuestionGenerationOpenAiOrganization,
      });

      const { benchmarkAiQuestionGeneration } =
        await import('../../ee/lib/ai-question-generation-benchmark.js');
      const jobSequenceId = await benchmarkAiQuestionGeneration({
        evaluationModel: openai(QUESTION_BENCHMARKING_OPENAI_MODEL),
        user: res.locals.authn_user,
      });
      res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}`);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
