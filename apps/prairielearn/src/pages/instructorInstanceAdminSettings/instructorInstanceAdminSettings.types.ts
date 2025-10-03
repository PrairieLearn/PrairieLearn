import z from 'zod';

import { BooleanFromCheckboxSchema } from '@prairielearn/zod';

export const SettingsFormBodySchema = z.object({
  ciid: z.string(),
  long_name: z.string(),
  display_timezone: z.string(),
  group_assessments_by: z.enum(['Set', 'Module']),
  show_in_enroll_page: BooleanFromCheckboxSchema,
  self_enrollment_enabled: BooleanFromCheckboxSchema,
  self_enrollment_use_enrollment_code: BooleanFromCheckboxSchema,
  self_enrollment_enabled_before_date: z.string(),
  self_enrollment_enabled_before_date_enabled: BooleanFromCheckboxSchema,
});

export type SettingsFormValues = z.infer<typeof SettingsFormBodySchema>;
