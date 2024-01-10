// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import AnsiUp from 'ansi_up';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { AssessmentQuestionSchema, IdSchema, TopicSchema } from '../../lib/db-types';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: z.number().nullable(),
  alternative_group_number: z.number().nullable(),
  alternative_group_size: z.string().nullable(),
  assessment_question_advance_score_perc: z.number().nullable(),
  avg_question_score_perc: z.number().nullable(),
  display_name: z.string().nullable(),
  number: z.string().nullable(),
  open_issue_count: z.string().nullable(),
  other_assessments: z
    .array(
      z.object({
        color: z.string(),
        label: z.string(),
        assessment_id: IdSchema,
        course_instance_id: IdSchema,
      }),
    )
    .nullable(),
  sync_errors_ansified: z.string().optional(),
  sync_errors: z.string().nullable(),
  sync_warnings_ansified: z.string().optional(),
  sync_warnings: z.string().nullable(),
  topic: TopicSchema.nullable(),
  qid: z.string(),
  start_new_zone: z.boolean().nullable(),
  tags: z
    .array(
      z.object({
        color: z.string(),
        id: IdSchema,
        name: z.string(),
      }),
    )
    .nullable(),
  title: z.string().nullable(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean().nullable(),
  zone_has_max_points: z.boolean().nullable(),
  zone_max_points: z.number().nullable(),
  zone_number_choose: z.number().nullable(),
  zone_number: z.number().nullable(),
  zone_title: z.string().nullable(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questions = await sqldb.queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionRowSchema,
    );
    res.locals.questions = questions.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
