import { z } from 'zod';

export const CourseSchema = z.object({
  branch: z.string(),
  commit_hash: z.string().nullable(),
  deleted_at: z.date().nullable(),
  display_timezone: z.string(),
  example_course: z.boolean(),
  id: z.string(),
  institution_id: z.string(),
  options: z.any(),
  path: z.string().nullable(),
  repository: z.string().nullable(),
  short_name: z.string().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: z.string().nullable(),
  sync_warnings: z.string(),
  title: z.string().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseInstanceSchema = z.object({
  assessments_group_by: z.enum(['Set', 'Module']),
  course_id: z.string(),
  deleted_at: z.date().nullable(),
  display_timezone: z.string(),
  hide_in_enroll_page: z.boolean().nullable(),
  id: z.string(),
  long_name: z.string().nullable(),
  ps_linked: z.boolean(),
  short_name: z.string().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: z.string().nullable(),
  sync_warnings: z.string(),
  uuid: z.string().nullable(),
});
export type CourseInstance = z.infer<typeof CourseInstanceSchema>;

export const InstitutionSchema = z.object({
  default_authn_provider_id: z.string().nullable(),
  display_timezone: z.string(),
  id: z.string(),
  long_name: z.string(),
  short_name: z.string(),
  uid_regexp: z.string().nullable(),
});
export type Institution = z.infer<typeof InstitutionSchema>;

export const SamlProviderSchema = z.object({
  certificate: z.string(),
  id: z.string(),
  institution_id: z.string(),
  issuer: z.string(),
  name_attribute: z.string().nullable(),
  private_key: z.string(),
  public_key: z.string(),
  sso_login_url: z.string(),
  uid_attribute: z.string().nullable(),
  uin_attribute: z.string().nullable(),
});
export type SamlProvider = z.infer<typeof SamlProviderSchema>;

export const AuthnProviderSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
});
export type AuthnProvider = z.infer<typeof AuthnProviderSchema>;
