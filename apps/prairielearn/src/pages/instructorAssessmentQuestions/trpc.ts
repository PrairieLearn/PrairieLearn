import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import type { CourseQuestionForPicker } from './types.js';

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
    topic: { id: String(q.topic.id), name: q.topic.name, color: q.topic.color },
    tags: q.tags?.map((t) => ({ id: String(t.id), name: t.name, color: t.color })) ?? null,
    assessments:
      q.assessments?.map((a) => ({
        assessment_id: String(a.assessment_id),
        label: a.label,
        color: a.color,
        assessment_set_abbreviation: a.assessment_set_abbreviation,
        assessment_set_name: a.assessment_set_name,
        assessment_set_color: a.assessment_set_color,
        assessment_number: a.assessment_number,
      })) ?? null,
  }));

  return result;
});

export const assessmentQuestionsRouter = t.router({
  courseQuestions: courseQuestionsQuery,
});

export type AssessmentQuestionsRouter = typeof assessmentQuestionsRouter;
