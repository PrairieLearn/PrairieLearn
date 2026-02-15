import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { SafeQuestionsPageDataSchema } from '../../components/QuestionsTable.shared.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const { authz_data, course } = extractPageContext(res.locals, {
    pageType: 'course',
    accessType: 'instructor',
  });

  return { course, authz_data };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const questionsQuery = t.procedure.query(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_preview) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course previewer)',
    });
  }

  const courseInstances = await selectCourseInstancesWithStaffAccess({
    course: opts.ctx.course,
    authzData: opts.ctx.authz_data,
    requiredRole: ['Previewer'],
  });

  const rawQuestions = await selectQuestionsForCourse(
    opts.ctx.course.id,
    courseInstances.map((ci) => ci.id),
  );

  return rawQuestions.map((q) => SafeQuestionsPageDataSchema.parse(q));
});

export const instructorQuestionsRouter = t.router({
  questions: questionsQuery,
});

export type InstructorQuestionsRouter = typeof instructorQuestionsRouter;
