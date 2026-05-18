import { createOpenAI } from '@ai-sdk/openai';
import { Router } from 'express';

import { cache } from '@prairielearn/cache';
import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import {
  AI_GRADING_MODEL_IDS,
  type AiGradingModelId,
} from '../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { QUESTION_BENCHMARKING_OPENAI_MODEL } from '../../ee/lib/ai-question-generation-benchmark.js';
import * as chunks from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAllNewsItems, setNewsItemHidden } from '../../models/news-items.js';

import { AdministratorSettings } from './administratorSettings.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const newsItems = await selectAllNewsItems();
    res.send(AdministratorSettings({ resLocals: res.locals, newsItems }));
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
    } else if (req.body.__action === 'delete_ai_grading_eval_courses') {
      if (!config.devMode) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }
      const { deleteAllAiGradingEvalCourses } =
        await import('../../ee/lib/ai-grading-eval/delete-eval-courses.js');
      const jobSequenceId = await deleteAllAiGradingEvalCourses(res.locals.authn_user);
      res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}`);
    } else if (req.body.__action === 'run_ai_grading_eval') {
      if (!config.devMode) {
        throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
      }
      if (!config.aiGradingEvalRepository) {
        throw new error.HttpStatusError(
          400,
          'aiGradingEvalRepository is not configured. Set it in config.json.',
        );
      }

      const rawModels = req.body.models;
      const modelList: string[] = Array.isArray(rawModels)
        ? rawModels
        : typeof rawModels === 'string' && rawModels.length > 0
          ? [rawModels]
          : [];
      const models: AiGradingModelId[] = [];
      for (const m of modelList) {
        if (!(AI_GRADING_MODEL_IDS as readonly string[]).includes(m)) {
          throw new error.HttpStatusError(400, `Unknown AI grading model: ${m}`);
        }
        models.push(m as AiGradingModelId);
      }
      if (models.length === 0) {
        throw new error.HttpStatusError(400, 'Select at least one AI grading model.');
      }

      const creditDollars = Number(req.body.credit_dollars);
      if (!Number.isFinite(creditDollars) || creditDollars < 0) {
        throw new error.HttpStatusError(400, 'credit_dollars must be a non-negative number.');
      }
      const creditMilliDollars = Math.round(creditDollars * 1000);

      const { runAiGradingEval } = await import('../../ee/lib/ai-grading-eval/ai-grading-eval.js');
      const jobSequenceId = await runAiGradingEval({
        repository: config.aiGradingEvalRepository,
        branch: config.aiGradingEvalBranch,
        models,
        creditMilliDollars,
        user: res.locals.authn_user,
      });
      res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}`);
    } else if (req.body.__action === 'sync_news_feed') {
      const { fetchAndCacheNewsItems } = await import('../../lib/news-feed.js');
      await fetchAndCacheNewsItems();
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'hide_news_item') {
      await setNewsItemHidden(IdSchema.parse(req.body.news_item_id), true);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'unhide_news_item') {
      await setNewsItemHidden(IdSchema.parse(req.body.news_item_id), false);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
