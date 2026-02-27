import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import type { CourseQuestionForPicker } from './types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'assessment'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authz_data: locals.authz_data,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const courseQuestionsQuery = t.procedure.query(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_preview) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be course previewer)',
    });
  }

  const courseQuestions = await selectQuestionsForCourse(opts.ctx.course.id, [
    opts.ctx.course_instance.id,
  ]);

  const result: CourseQuestionForPicker[] = courseQuestions.map((q) => ({
    id: q.id,
    qid: q.qid,
    title: q.title,
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
  open_issue_count: z.number(),
  tags: z.array(StaffTagSchema),
});

export type QuestionByQidResult = z.infer<typeof QuestionByQidResultSchema>;

const questionByQidQuery = t.procedure.input(z.object({ qid: z.string() })).query(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_preview) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be course previewer)',
    });
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
  courseQuestions: courseQuestionsQuery,
  questionByQid: questionByQidQuery,
});

export type AssessmentQuestionsRouter = typeof assessmentQuestionsRouter;
