import z from 'zod';

export const SettingsFormBodySchema = z.object({
  ciid: z.string(),
  long_name: z.string(),
  display_timezone: z.string(),
  group_assessments_by: z.enum(['Set', 'Module']),
  hide_in_enroll_page: z.boolean(),
  self_enrollment_enabled: z.boolean(),
  self_enrollment_requires_secret_link: z.boolean(),
  self_enrollment_enabled_before_date: z.string().nullable().default(null),
});

export type SettingsFormValues = z.infer<typeof SettingsFormBodySchema> & {
  /** null is represented as an empty string in the form. */
  self_enrollment_enabled_before_date: string;
};
