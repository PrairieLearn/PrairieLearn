import { z } from 'zod';

import {
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  UserSchema as RawUserSchema,
} from '../db-types.js';

type Branded<T, Brand> = T & { __brand: Brand };

export function brandWith<Brand>() {
  return <T extends z.ZodObject<any>>(schema: T) =>
    schema.pipe(z.custom<Branded<z.infer<T>, Brand>>());
}

/** Courses */

export const RawStaffCourseSchema = RawCourseSchema.omit({
  yearly_enrollment_limit: true,
  sharing_token: true,
});
export const StaffCourseSchema = brandWith<'StaffCourse'>()(RawStaffCourseSchema);
export type StaffCourse = z.infer<typeof StaffCourseSchema>;

export const RawStudentCourseSchema = RawStaffCourseSchema.omit({
  announcement_color: true,
  announcement_html: true,
  branch: true,
  commit_hash: true,
  course_instance_enrollment_limit: true,
  json_comment: true,
  path: true,
  repository: true,
  sharing_name: true,
  show_getting_started: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
});
export const StudentCourseSchema = brandWith<'StudentCourse'>()(RawStudentCourseSchema);
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

/** Course Instances */

export const RawStaffCourseInstanceSchema = RawCourseInstanceSchema;
export const StaffCourseInstanceSchema = brandWith<'StaffCourseInstance'>()(
  RawStaffCourseInstanceSchema,
);
export type StaffCourseInstance = z.infer<typeof StaffCourseInstanceSchema>;

export const RawStudentCourseInstanceSchema = RawStaffCourseInstanceSchema.omit({
  enrollment_limit: true,
  json_comment: true,
  share_source_publicly: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
  uuid: true,
});
export const StudentCourseInstanceSchema = brandWith<'StudentCourseInstance'>()(
  RawStudentCourseInstanceSchema,
);
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

/** Users */

const RawStaffUserSchema = RawUserSchema.omit({
  deleted_at: true,
  lti_context_id: true,
  lti_course_instance_id: true,
  lti_user_id: true,
  stripe_customer_id: true,
  terms_accepted_at: true,
});
export const StaffUserSchema = brandWith<'StaffUser'>()(RawStaffUserSchema);
export type StaffUser = z.infer<typeof StaffUserSchema>;

const _RawStudentUserSchema = RawStaffUserSchema.omit({ email: true, uin: true });
export const StudentUserSchema = brandWith<'StudentUser'>()(_RawStudentUserSchema);
export type StudentUser = z.infer<typeof StudentUserSchema>;
