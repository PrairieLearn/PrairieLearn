import { z } from 'zod';

// IDs are always coerced to strings. This ensures consistent handling when an
// ID is fetched directly or via `to_jsonb`, which returns a number.
export const IdSchema = z.string({ coerce: true });

export const CourseSchema = z.object({
  branch: z.string(),
  commit_hash: z.string().nullable(),
  deleted_at: z.date().nullable(),
  display_timezone: z.string(),
  example_course: z.boolean(),
  id: IdSchema,
  institution_id: IdSchema,
  options: z.any(),
  path: z.string().nullable(),
  repository: z.string().nullable(),
  short_name: z.string().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  title: z.string().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseInstanceSchema = z.object({
  assessments_group_by: z.enum(['Set', 'Module']),
  course_id: IdSchema,
  deleted_at: z.date().nullable(),
  display_timezone: z.string(),
  enrollment_limit: z.number().nullable(),
  hide_in_enroll_page: z.boolean().nullable(),
  id: IdSchema,
  long_name: z.string().nullable(),
  ps_linked: z.boolean(),
  short_name: z.string().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  uuid: z.string().nullable(),
});
export type CourseInstance = z.infer<typeof CourseInstanceSchema>;

export const InstitutionSchema = z.object({
  course_instance_enrollment_limit: z.number(),
  default_authn_provider_id: IdSchema.nullable(),
  display_timezone: z.string(),
  id: IdSchema,
  long_name: z.string(),
  short_name: z.string(),
  uid_regexp: z.string().nullable(),
  yearly_enrollment_limit: z.number(),
});
export type Institution = z.infer<typeof InstitutionSchema>;

export const SamlProviderSchema = z.object({
  certificate: z.string(),
  id: IdSchema,
  institution_id: IdSchema,
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
  id: IdSchema,
  name: z.string().nullable(),
});
export type AuthnProvider = z.infer<typeof AuthnProviderSchema>;

export const GroupConfigSchema = z.object({
  assessment_id: IdSchema.nullable(),
  course_instance_id: IdSchema,
  date: z.date(),
  deleted_at: z.date().nullable(),
  has_roles: z.boolean(),
  id: IdSchema,
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  name: z.string().nullable(),
  student_authz_create: z.boolean().nullable(),
  student_authz_leave: z.boolean().nullable(),
  student_authz_join: z.boolean().nullable(),
});
export type GroupConfig = z.infer<typeof GroupConfigSchema>;

export const UserSchema = z.object({
  deleted_at: z.date().nullable(),
  institution_id: IdSchema,
  lti_context_id: z.string().nullable(),
  lti_course_instance_id: IdSchema.nullable(),
  lti_user_id: z.string().nullable(),
  name: z.string().nullable(),
  uid: z.string(),
  uin: z.string().nullable(),
  user_id: IdSchema,
});
export type User = z.infer<typeof UserSchema>;

export const PlanGrantSchema = z.object({
  course_instance_id: IdSchema.nullable(),
  created_at: z.date(),
  enrollment_id: IdSchema.nullable(),
  id: IdSchema,
  institution_id: IdSchema.nullable(),
  plan_name: z.enum(['basic', 'compute', 'everything']),
  type: z.enum(['trial', 'stripe', 'invoice', 'gift']),
  user_id: IdSchema.nullable(),
});
export type PlanGrant = z.infer<typeof PlanGrantSchema>;
