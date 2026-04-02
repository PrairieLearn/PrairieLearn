import z from 'zod';

export const SettingsFormBodySchema = z.object({
  aid: z.string(),
  title: z.string(),
  set: z.string(),
  number: z.string(),
  module: z.string(),
  text: z.string().optional(),
  allow_issue_reporting: z.boolean(),
  allow_personal_notes: z.boolean(),
  multiple_instance: z.boolean(),
  auto_close: z.boolean(),
  require_honor_code: z.boolean(),
  honor_code: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
});

export type SettingsFormValues = z.infer<typeof SettingsFormBodySchema>;
