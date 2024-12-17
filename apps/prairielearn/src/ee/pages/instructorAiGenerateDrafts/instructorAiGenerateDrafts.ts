import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { IdSchema } from '../../../lib/db-types.js';

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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (req.body.__action === 'delete_drafts') {
      const questions = await queryRows(
        sql.select_draft_questions_by_course_id,
        { course_id: res.locals.course.id.toString() },
        z.object({ id: IdSchema, qid: z.string() }),
      );

      const client = getCourseFilesClient();

      const result = await client.batchDeleteQuestions.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_ids: questions.map((question) => question.id),
      });

      if (result.status === 'error') {
        throw new error.HttpStatusError(
          500,
          `Cannot delete all draft questions in: (${questions.map((question) => question.qid).join(', ')})`,
        );
      }

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
