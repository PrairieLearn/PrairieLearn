import z from 'zod';

import { AdminInstitutionSchema, StaffCourseSchema } from '../../lib/client/safe-db-types.js';

const RawCourseWithInstitutionSchema = z.object({
  course: StaffCourseSchema,
  institution: AdminInstitutionSchema,
});
export const CourseWithInstitutionSchema =
  RawCourseWithInstitutionSchema.brand<'CourseWithInstitution'>();
export type CourseWithInstitution = z.infer<typeof CourseWithInstitutionSchema>;
