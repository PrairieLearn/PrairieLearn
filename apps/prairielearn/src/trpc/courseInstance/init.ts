import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { CourseInstance, StudentLabel } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectOptionalStudentLabelById } from '../../models/student-label.js';
import { appErrorFormatter } from '../app-errors.js';

export async function selectStudentLabelByIdOrNotFound({
  id,
  courseInstance,
}: {
  id: string;
  courseInstance: CourseInstance;
}): Promise<StudentLabel> {
  const label = await selectOptionalStudentLabelById({ id, courseInstance });
  if (label == null) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Label not found',
    });
  }
  return label;
}

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authz_data: locals.authz_data,
    locals,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireCourseInstancePermissionView = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data viewer)',
    });
  }
  return opts.next();
});

export const requireCourseInstancePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data editor)',
    });
  }
  return opts.next();
});

export const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course editor)',
    });
  }
  return opts.next();
});
