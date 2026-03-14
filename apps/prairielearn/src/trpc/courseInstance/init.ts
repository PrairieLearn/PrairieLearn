import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { HttpStatusError } from '@prairielearn/error';

import type { CourseInstance, StudentLabel } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectOptionalStudentLabelById } from '../../models/student-label.js';

import { AppError } from './app-errors.js';

export async function selectStudentLabelByIdOrNotFound({
  id,
  courseInstance,
}: {
  id: string;
  courseInstance: CourseInstance;
}): Promise<StudentLabel> {
  try {
    const label = await selectOptionalStudentLabelById({ id, courseInstance });
    if (label == null) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Label not found',
      });
    }
    return label;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof HttpStatusError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to look up label',
      cause: error,
    });
  }
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
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        appError: error instanceof AppError ? error.meta : null,
      },
    };
  },
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
