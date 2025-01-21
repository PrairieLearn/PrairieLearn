import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { AiGenerationPromptSchema } from '../../../lib/db-types.js';

import {
  InstructorAIGenerateDrafts,
  DraftMetadataWithQidSchema,
} from './instructorAiGenerateDrafts.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const drafts = await queryRows(
      sql.select_draft_generation_info_by_course_id,
      { course_id: res.locals.course.id },
      DraftMetadataWithQidSchema,
    );

    res.send(InstructorAIGenerateDrafts({ resLocals: res.locals, drafts }));
  }),
);

router.get('/generation_logs.json', asyncHandler(async (req, res) => {
  if (!res.locals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }
  
  const file = await queryRows(
    sql.select_ai_question_generation_prompts_by_course_id,
    { course_id: res.locals.course.id },
    AiGenerationPromptSchema,
  );

  res.send(file);

}))

export default router;
