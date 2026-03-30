import * as path from 'path';

import { TRPCError } from '@trpc/server';

import { analyzeCourseInstanceAssessments } from '../../lib/assessment-access-control/migration.js';

import { requireCoursePermissionEdit, t } from './init.js';

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

export const instanceAdminSettingsRouter = t.router({
  analyzeAccessControl,
});
