import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

/**
 * An assessment as shown in "View assessments" usage lists, with enough course
 * instance context to group it and link to it.
 */
export const AssessmentUsageSchema = z.object({
  assessment_id: IdSchema,
  tid: z.string(),
  title: z.string(),
  label: z.string(),
  color: z.string(),
  course_instance_id: IdSchema,
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
});
export type AssessmentUsage = z.infer<typeof AssessmentUsageSchema>;
