import type { z } from 'zod';

import {
  RawAdminCourseSchema,
  RawAdminInstitutionSchema,
} from '../../lib/client/safe-db-types.js';

export type AdminInstitution = z.infer<typeof RawAdminInstitutionSchema>;

export const CourseWithInstitutionSchema = RawAdminCourseSchema.extend({
  institution: RawAdminInstitutionSchema,
});
export type CourseWithInstitution = z.infer<typeof CourseWithInstitutionSchema>;
