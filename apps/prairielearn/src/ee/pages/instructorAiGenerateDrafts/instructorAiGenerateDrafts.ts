import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { AiQuestionGenerationPromptSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { editQuestionWithAgent, getAgenticModel } from '../../lib/ai-question-generation/agent.js';
import { getIntervalUsage } from '../../lib/aiQuestionGeneration.js';

import {
  DraftMetadataWithQidSchema,
  InstructorAIGenerateDrafts,
  RateLimitExceeded,
} from './instructorAiGenerateDrafts.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function assertCanCreateQuestion(resLocals: UntypedResLocals) {
  // Do not allow users to edit without permission
  if (!resLocals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }

  // Do not allow users to edit the exampleCourse
  if (resLocals.course.example_course) {
    throw new error.HttpStatusError(403, 'Access denied (cannot edit the example course)');
  }
}

router.use(
  asyncHandler(async (req, res, next) => {
    if (!(await features.enabledFromLocals('ai-question-generation', res.locals))) {
      throw new error.HttpStatusError(403, 'Feature not enabled');
    }
    next();
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    const drafts = await queryRows(
      sql.select_draft_generation_info_by_course_id,
      { course_id: res.locals.course.id },
      DraftMetadataWithQidSchema,
    );

    res.send(
      InstructorAIGenerateDrafts({
        resLocals: res.locals,
        drafts,
      }),
    );
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

    if (
      !config.aiQuestionGenerationOpenAiApiKey ||
      !config.aiQuestionGenerationOpenAiOrganization
    ) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }

    if (req.body.__action === 'generate_question') {
      const intervalCost = await getIntervalUsage(res.locals.authn_user);

      // Note: we only check current interval usage here, not the prompt's estimated cost.
      // A large prompt can exceed the limit, but estimating cost up front is unreliable.
      if (intervalCost > config.aiQuestionGenerationRateLimitDollars) {
        res.send(RateLimitExceeded());
        return;
      }

      const { model, modelId } = getAgenticModel();
      const result = await editQuestionWithAgent({
        model,
        modelId,
        course: res.locals.course,
        user: res.locals.authn_user,
        authnUser: res.locals.authn_user,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
        prompt: req.body.prompt,
      });

      res.set({
        'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_editor/${result.question.id}`,
      });
      res.send();
    } else if (req.body.__action === 'delete_drafts') {
      const questions = await queryRows(
        sql.select_draft_questions_by_course_id,
        { course_id: res.locals.course.id.toString() },
        IdSchema,
      );

      const client = getCourseFilesClient();

      const result = await client.batchDeleteQuestions.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
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
