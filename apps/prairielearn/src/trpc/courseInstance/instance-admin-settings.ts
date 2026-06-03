import * as path from 'path';

import { Temporal } from '@js-temporal/polyfill';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

import { analyzeCourseInstanceAssessments } from '../../lib/assessment-access-control/migration.js';

import { requireCoursePermissionEdit, requireEnhancedAccessControl, t } from './init.js';

export interface InstanceAdminSettingsError {
  AnalyzeAccessControl: never;
}

function todayAsDatetimeLocal(timezone: string): string {
  const today = Temporal.Now.plainDateISO(timezone);
  return `${today.toString()}T00:00:00`;
}

const analyzeAccessControl = t.procedure
  .use(requireEnhancedAccessControl)
  .use(requireCoursePermissionEdit)
  .input(z.object({ publishingStartDate: DatetimeLocalStringSchema.nullable() }))
  .query(async (opts) => {
    const shortName = opts.ctx.course_instance.short_name;
    if (!shortName) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'This course instance does not have a short name, so access control rules cannot be analyzed.',
      });
    }
    const courseInstancePath = path.join(opts.ctx.course.path, 'courseInstances', shortName);
    return analyzeCourseInstanceAssessments(
      courseInstancePath,
      opts.input.publishingStartDate ??
        todayAsDatetimeLocal(opts.ctx.course_instance.display_timezone),
    );
  });

export const instanceAdminSettingsRouter = t.router({
  analyzeAccessControl,
});
