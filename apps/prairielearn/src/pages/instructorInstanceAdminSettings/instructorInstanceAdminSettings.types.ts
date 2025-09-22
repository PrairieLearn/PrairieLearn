import z from 'zod';

const FormCheckboxSchema = z
  .literal('on')
  .optional()
  .transform((v) => v === 'on');
export const SettingsFormBodySchema = z.object({
  ciid: z.string(),
  long_name: z.string(),
  display_timezone: z.string(),
  group_assessments_by: z.enum(['Set', 'Module']),
  show_in_enroll_page: FormCheckboxSchema,
  self_enrollment_enabled: FormCheckboxSchema,
  self_enrollment_use_enrollment_code: FormCheckboxSchema,
  self_enrollment_enabled_before_date: z.string().optional().nullable().default(null),
  self_enrollment_enabled_before_date_enabled: FormCheckboxSchema,
});

export type SettingsFormValues = z.infer<typeof SettingsFormBodySchema> & {
  /** null is represented as an empty string in the form. */
  self_enrollment_enabled_before_date: string;
};
