import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { QuestionSchema } from '../../../lib/db-types.js';

import {
  InstructorAIGenerateDraftsPage,
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

    res.send(InstructorAIGenerateDraftsPage({ resLocals: res.locals, drafts }));
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
        sql.select_drafts_by_course_id,
        { course_id: res.locals.course.id.toString() },
        QuestionSchema,
      );

      for (const question of questions) {
        const client = getCourseFilesClient();

        const result = await client.deleteQuestion.mutate({
          course_id: res.locals.course.id,
          user_id: res.locals.user.user_id,
          authn_user_id: res.locals.authn_user.user_id,
          has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
          question_id: question.id,
        });

        if (result.status === 'error') {
          throw new error.HttpStatusError(500, `Cannot delete draft question: ${question.qid}`);
        }
      }

      res.redirect(`${res.locals.urlPrefix}/ai_generate_question_drafts`);
    }
  }),
);

export default router;
