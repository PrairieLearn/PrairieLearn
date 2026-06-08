import { z } from 'zod';

import { RawStaffAssessmentModuleSchema } from '../../lib/client/safe-db-types.js';
import { AssessmentForModuleSchema } from '../../models/assessment-module.js';

// Safe-db-types view of a module plus the assessments that belong to it. Used
// for data that crosses the server -> client hydration boundary.
export const StaffAssessmentModuleWithAssessmentsSchema = RawStaffAssessmentModuleSchema.extend({
  assessments: z.array(AssessmentForModuleSchema),
});
export type StaffAssessmentModuleWithAssessments = z.infer<
  typeof StaffAssessmentModuleWithAssessmentsSchema
>;

// Internal form state. `id` and `course_id` are null for modules that haven't
// been created yet, and `trackingId` is a stable client-only key used for React
// keys and to identify rows while editing (a module's name can change).
export type AssessmentModuleFormRow = Omit<
  StaffAssessmentModuleWithAssessments,
  'id' | 'course_id'
> & {
  trackingId: string;
  id: string | null;
  course_id: string | null;
};
