import * as path from 'path';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { analyzeCourseInstanceAssessments } from '../../lib/access-control-migration.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;

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

const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must have course edit permission)',
    });
  }
  return opts.next();
});

const analyzeAccessControl = t.procedure.use(requireCoursePermissionEdit).query(async (opts) => {
  const shortName = opts.ctx.course_instance.short_name;
  if (!shortName) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Course instance has no short name',
    });
  }
  const courseInstancePath = path.join(opts.ctx.course.path, 'courseInstances', shortName);
  return analyzeCourseInstanceAssessments(courseInstancePath);
});

export const settingsRouter = t.router({
  analyzeAccessControl,
});

export type SettingsRouter = typeof settingsRouter;
