import * as express from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { approximateInputCost, initializeAiQuestionGenerationCache } from '../../../lib/ai-grading.js';
import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { AiQuestionGenerationPromptSchema, IdSchema } from '../../../lib/db-types.js';
import { generateQuestion } from '../../lib/aiQuestionGeneration.js';

import {
  DraftMetadataWithQidSchema,
  GenerationFailure,
  InstructorAIGenerateDrafts,
  RateLimitError
} from './instructorAiGenerateDrafts.html.js';


const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

const aiQuestionGenerationCache = initializeAiQuestionGenerationCache();

function assertCanCreateQuestion(resLocals: Record<string, any>) {
  // Do not allow users to edit without permission
  if (!resLocals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }

  // Do not allow users to edit the exampleCourse
  if (resLocals.course.example_course) {
    throw new error.HttpStatusError(403, 'Access denied (cannot edit the example course)');
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    const drafts = await queryRows(
      sql.select_draft_generation_info_by_course_id,
      { course_id: res.locals.course.id },
      DraftMetadataWithQidSchema,
    );

    res.send(InstructorAIGenerateDrafts({ resLocals: res.locals, drafts }));
  }),
);

router.get(
  '/generation_logs.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }
    const file = await queryRows(
      sql.select_ai_question_generation_prompts_by_course_id,
      { course_id: res.locals.course.id },
      AiQuestionGenerationPromptSchema,
    );

    res.json(file);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    if (!config.openAiApiKey || !config.openAiOrganization) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }

    const client = new OpenAI({
      apiKey: config.openAiApiKey,
      organization: config.openAiOrganization,
    });

    if (req.body.__action === 'generate_question') {
      console.log('user id', `${res.locals.user.user_id}-rate-limit`);
      let lastIntervalCost = await aiQuestionGenerationCache.get(`${res.locals.user.user_id}-rate-limit`) ?? 0;
      const userRateLimitStart = await aiQuestionGenerationCache.get(`${res.locals.user.user_id}-rate-limit-start`) as Date | null;
      
      // The rate limit interval has passed; begin a new interval
      if (userRateLimitStart && userRateLimitStart < new Date(Date.now() - config.aiQuestionGenerationRateLimitIntervalMs)) {
        await aiQuestionGenerationCache.del(`${res.locals.user.user_id}-rate-limit`);
        aiQuestionGenerationCache.set(`${res.locals.user.user_id}-rate-limit-start`, new Date(), config.aiQuestionGenerationRateLimitIntervalMs);
        lastIntervalCost = 0;
      }

      const approxInputCost = approximateInputCost(req.body.prompt);

      console.log('lastIntervalCost', lastIntervalCost);
      console.log('approxInputCost', approxInputCost);

      if (lastIntervalCost + approxInputCost > config.aiQuestionGenerationRateLimit) {
        res.send(
          RateLimitError({
            // If the user has more tokens than some threshold (50, in this case),
            // they can shorten their message to avoid reaching the rate limit.
            canShortenMessage: config.aiQuestionGenerationRateLimit - lastIntervalCost > (config.costPerMillionInputTokens * 50)
          })
        ); 
        return;
      }

      const result = await generateQuestion({
        client,
        courseId: res.locals.course.id,
        authnUserId: res.locals.authn_user.user_id,
        prompt: req.body.prompt,
        userId: res.locals.authn_user.user_id,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
      });

      const completionCost = (
        (config.costPerMillionInputTokens * (result.inputTokens ?? 0)) + 
        (config.costPerMillionCompletionTokens * (result.completionTokens ?? 0))
      ) / 1e6;

      console.log('completionCost', completionCost);

      aiQuestionGenerationCache.set(`${res.locals.user.user_id}-rate-limit`, lastIntervalCost + completionCost, config.aiQuestionGenerationRateLimitIntervalMs);
      if (!userRateLimitStart) {
        aiQuestionGenerationCache.set(`${res.locals.user.user_id}-rate-limit-start`, new Date(), config.aiQuestionGenerationRateLimitIntervalMs);
      }

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_editor/${result.questionId}`,
        });
        res.send();
      } else {
        res.send(
          GenerationFailure({
            urlPrefix: res.locals.urlPrefix,
            jobSequenceId: result.jobSequenceId,
          }),
        );
      }
    } else if (req.body.__action === 'delete_drafts') {
      const questions = await queryRows(
        sql.select_draft_questions_by_course_id,
        { course_id: res.locals.course.id.toString() },
        IdSchema,
      );

      const client = getCourseFilesClient();


      const result = await client.batchDeleteQuestions.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_ids: questions,
      });

      if (result.status === 'error') {
        throw new error.HttpStatusError(500, 'Failed to delete all draft questions.');
      }

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
