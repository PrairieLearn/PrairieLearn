import { z } from 'zod';

import { run } from '@prairielearn/run';

import { NavPageSchema, NavbarTypeSchema } from '../../components/Navbar.types.js';
import { SelectUserSchema } from '../authn.types.js';
import { PageAuthzDataSchema } from '../authz-data-lib.js';

import {
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StaffInstitutionSchema,
  StaffUserSchema,
} from './safe-db-types.js';

export const RawPageContextSchema = z.object({
  __csrf_token: z.string(),
  urlPrefix: z.string(),

  // authn data
  authn_user: StaffUserSchema,
  authn_institution: StaffInstitutionSchema,
  authn_provider_name: z.string(),
  authn_is_administrator: SelectUserSchema.shape.is_administrator,
  access_as_administrator: z.boolean(),
  is_administrator: z.boolean(),
  is_institution_administrator: z.boolean(),
  news_item_notification_count: SelectUserSchema.shape.news_item_notification_count,

  navPage: NavPageSchema,
  /** You should prefer to set the navbarType instead of using this value. */
  navbarType: NavbarTypeSchema,
});
export const PageContextSchema = RawPageContextSchema.brand<'PageContext'>();
export type PageContext = z.infer<typeof PageContextSchema>;

export const RawPageContextWithAuthzDataSchema = RawPageContextSchema.extend({
  authz_data: PageAuthzDataSchema,
});
export const PageContextWithAuthzDataSchema =
  RawPageContextWithAuthzDataSchema.brand<'PageContextWithAuthzData'>();
export type PageContextWithAuthzData = z.infer<typeof PageContextWithAuthzDataSchema>;

/**
 * TODO: We want to merge
 * getPageContext, getCourseInstanceContext, and getAssessmentContext into a single function.
 *
 * New options will be withAuthzData, pageType, and requestedRole.
 */
export function getPageContext(
  resLocals: Record<string, any>,
  options?: {
    withAuthzData?: true;
  },
): PageContextWithAuthzData;

export function getPageContext(
  resLocals: Record<string, any>,
  options: {
    withAuthzData: false;
  },
): PageContext;

export function getPageContext(
  resLocals: Record<string, any>,
  {
    withAuthzData = true,
  }: {
    withAuthzData?: boolean;
  } = {},
): PageContext | PageContextWithAuthzData {
  const schema = withAuthzData ? PageContextWithAuthzDataSchema : PageContextSchema;
  return schema.parse(resLocals);
}

// Since this data comes from res.locals and not the database, we can make certain guarantees
// about the data. Specifically, `short_name` will never be null for non-deleted courses
// and course instances.

// If '*CourseInstanceSchema' ever differs at a column level
// from '*CourseInstanceContext.course_instance' our branding strategy needs to be updated.

const RawStudentCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStudentCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourseInstance'),
  course: z
    .object({
      ...RawStudentCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourse'),
  has_enhanced_navigation: z.boolean(),
});
export const StudentCourseInstanceContextSchema =
  RawStudentCourseInstanceContextSchema.brand<'StudentCourseInstanceContext'>();

export type StudentCourseInstanceContext = z.infer<typeof StudentCourseInstanceContextSchema>;

const RawStaffCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStaffCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourseInstance'),
  course: z
    .object({
      ...RawStaffCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourse'),
  institution: StaffInstitutionSchema,
  has_enhanced_navigation: z.boolean(),
});
export const StaffCourseInstanceContextSchema =
  RawStaffCourseInstanceContextSchema.brand<'StaffCourseInstanceContext'>();

export type StaffCourseInstanceContext = z.infer<typeof StaffCourseInstanceContextSchema>;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'student',
): StudentCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'instructor',
): StaffCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'student' | 'instructor',
): StudentCourseInstanceContext | StaffCourseInstanceContext {
  const schema = run(() => {
    if (pageType === 'student') {
      return StudentCourseInstanceContextSchema;
    }
    return StaffCourseInstanceContextSchema;
  });
  return schema.parse(resLocals);
}

const RawStaffAssessmentContextSchema = z.object({
  assessment: RawStaffAssessmentSchema.extend({
    type: z.enum(['Exam', 'Homework']),
  }),
  assessment_set: RawStaffAssessmentSetSchema,
});
const StaffAssessmentContextSchema =
  RawStaffAssessmentContextSchema.brand<'StaffAssessmentContext'>();

export type StaffAssessmentContext = z.infer<typeof StaffAssessmentContextSchema>;

export function getAssessmentContext(resLocals: Record<string, any>): StaffAssessmentContext {
  const schema = StaffAssessmentContextSchema;
  return schema.parse(resLocals);
}
