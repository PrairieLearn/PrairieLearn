import z from 'zod';

import { AdminCourseSchema, AdminInstitutionSchema } from '../../lib/client/safe-db-types.js';

const RawCourseWithInstitutionSchema = z.object({
  course: AdminCourseSchema,
  institution: AdminInstitutionSchema,
});
export const CourseWithInstitutionSchema =
  RawCourseWithInstitutionSchema.brand<'CourseWithInstitution'>();
export type CourseWithInstitution = z.infer<typeof CourseWithInstitutionSchema>;
