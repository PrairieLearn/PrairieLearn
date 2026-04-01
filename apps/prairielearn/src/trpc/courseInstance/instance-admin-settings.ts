import * as path from 'path';

import { TRPCError } from '@trpc/server';

import { analyzeCourseInstanceAssessments } from '../../lib/assessment-access-control/migration.js';

import { requireCoursePermissionEdit, t } from './init.js';

export interface InstanceAdminSettingsError {}

const analyzeAccessControl = t.procedure.use(requireCoursePermissionEdit).query(async (opts) => {
  const shortName = opts.ctx.course_instance.short_name;
  if (!shortName) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'This course instance does not have a short name, so access control rules cannot be analyzed.',
    });
  }
  const courseInstancePath = path.join(opts.ctx.course.path, 'courseInstances', shortName);
  return analyzeCourseInstanceAssessments(courseInstancePath);
});

export const instanceAdminSettingsRouter = t.router({
  analyzeAccessControl,
});
