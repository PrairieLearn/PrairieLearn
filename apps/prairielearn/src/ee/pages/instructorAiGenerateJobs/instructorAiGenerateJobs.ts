import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { DateFromISOString, IdSchema } from '../../../lib/db-types.js';

import { InstructorAIGenerateJobs } from './instructorAiGenerateJobs.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

const draftMetadataWithQidSchema = z.object({
  created_at: DateFromISOString.nullable(),
  created_by: IdSchema.nullable(),
  id: IdSchema,
  uid: z.string().nullable(),
  question_id: IdSchema.nullable(),
  updated_by: IdSchema.nullable(),
  qid: z.string().nullable(),
});
export type DraftMetadataWithQid = z.infer<typeof draftMetadataWithQidSchema>;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const drafts = await queryRows(
      sql.select_drafts_by_course_id,
      { course_id: res.locals.course.id },
      draftMetadataWithQidSchema,
    );

    res.send(InstructorAIGenerateJobs({ resLocals: res.locals, drafts }));
  }),
);

export default router;
