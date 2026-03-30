import * as path from 'path';

import { analyzeCourseInstanceAssessments } from '../../lib/assessment-access-control/migration.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

export interface InstanceAdminSettingsError {
  AnalyzeAccessControl: { code: 'NO_SHORT_NAME' };
}

const analyzeAccessControl = t.procedure.use(requireCoursePermissionEdit).query(async (opts) => {
  const shortName = opts.ctx.course_instance.short_name;
  if (!shortName) {
    throwAppError<InstanceAdminSettingsError['AnalyzeAccessControl']>({ code: 'NO_SHORT_NAME' });
  }
  const courseInstancePath = path.join(opts.ctx.course.path, 'courseInstances', shortName);
  return analyzeCourseInstanceAssessments(courseInstancePath);
});

export const instanceAdminSettingsRouter = t.router({
  analyzeAccessControl,
});
