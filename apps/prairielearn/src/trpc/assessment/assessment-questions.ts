import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  StaffCourseSchema,
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import type { CourseQuestionForPicker } from '../../pages/instructorAssessmentQuestions/types.js';

import { requireCoursePermissionPreview, t } from './init.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const courseQuestions = t.procedure.use(requireCoursePermissionPreview).query(async (opts) => {
  const courseQuestions = await selectQuestionsForCourse(opts.ctx.course.id, [
    opts.ctx.course_instance.id,
  ]);

  const result: CourseQuestionForPicker[] = courseQuestions.map((q) => ({
    id: q.id,
    qid: q.qid,
    title: q.title,
    grading_method: q.grading_method,
    topic: { id: q.topic.id, name: q.topic.name, color: q.topic.color },
    tags: q.tags?.map((t) => ({ id: t.id, name: t.name, color: t.color })) ?? null,
    assessments:
      q.assessments?.map((a) => ({
        assessment_id: a.assessment.id,
        label: a.assessment_set.abbreviation + a.assessment.number,
        color: a.assessment_set.color,
        assessment_set_abbreviation: a.assessment_set.abbreviation,
        assessment_set_name: a.assessment_set.name,
        assessment_set_color: a.assessment_set.color,
        assessment_number: a.assessment.number,
      })) ?? null,
  }));

  return result;
});

const QuestionByQidResultSchema = z.object({
  question: StaffQuestionSchema,
  topic: StaffTopicSchema,
  course: StaffCourseSchema,
  open_issue_count: z.number(),
  tags: z.array(StaffTagSchema),
});

export type QuestionByQidResult = z.infer<typeof QuestionByQidResultSchema>;

const questionByQid = t.procedure
  .use(requireCoursePermissionPreview)
  .input(z.object({ qid: z.string() }))
  .query(async (opts) => {
    if (opts.input.qid.startsWith('@')) {
      const [sharing_name, ...qidComponents] = opts.input.qid.slice(1).split('/');
      const qid = qidComponents.join('/');

      const result = await sqldb.queryOptionalRow(
        sql.search_shared_questions,
        { qid, sharing_name, course_id: opts.ctx.course.id },
        QuestionByQidResultSchema,
      );

      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shared question not found' });
      }

      return result;
    }
    const result = await sqldb.queryOptionalRow(
      sql.select_question_by_qid,
      {
        qid: opts.input.qid,
        course_id: opts.ctx.course.id,
      },
      QuestionByQidResultSchema,
    );

    if (!result) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Question not found',
      });
    }

    return result;
  });

export const assessmentQuestionsRouter = t.router({
  courseQuestions,
  questionByQid,
});
