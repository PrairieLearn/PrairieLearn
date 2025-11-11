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
  StudentUserSchema,
} from './safe-db-types.js';

// Base schema shared by both student and staff
const BasePageContextSchema = z.object({
  __csrf_token: z.string(),
  urlPrefix: z.string(),
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

// Student plain page context
export const RawStudentPlainPageContextSchema = BasePageContextSchema.extend({
  authn_user: StudentUserSchema,
  authn_institution: StaffInstitutionSchema,
});
export const StudentPlainPageContextSchema =
  RawStudentPlainPageContextSchema.brand<'StudentPlainPageContext'>();
export type StudentPlainPageContext = z.infer<typeof StudentPlainPageContextSchema>;

export const RawStudentPlainPageContextWithAuthzDataSchema =
  RawStudentPlainPageContextSchema.extend({
    authz_data: PageAuthzDataSchema,
  });
export const StudentPlainPageContextWithAuthzDataSchema =
  RawStudentPlainPageContextWithAuthzDataSchema.brand<'StudentPlainPageContextWithAuthzData'>();
export type StudentPlainPageContextWithAuthzData = z.infer<
  typeof StudentPlainPageContextWithAuthzDataSchema
>;

// Staff plain page context
export const RawStaffPlainPageContextSchema = BasePageContextSchema.extend({
  authn_user: StaffUserSchema,
  authn_institution: StaffInstitutionSchema,
});
export const StaffPlainPageContextSchema =
  RawStaffPlainPageContextSchema.brand<'StaffPlainPageContext'>();
export type StaffPlainPageContext = z.infer<typeof StaffPlainPageContextSchema>;

export const RawStaffPlainPageContextWithAuthzDataSchema = RawStaffPlainPageContextSchema.extend({
  authz_data: PageAuthzDataSchema,
});
export const StaffPlainPageContextWithAuthzDataSchema =
  RawStaffPlainPageContextWithAuthzDataSchema.brand<'StaffPlainPageContextWithAuthzData'>();
export type StaffPlainPageContextWithAuthzData = z.infer<
  typeof StaffPlainPageContextWithAuthzDataSchema
>;

// Generic union types for cases where we don't need to distinguish between student/staff
export type PlainPageContext = StudentPlainPageContext | StaffPlainPageContext;
export type PlainPageContextWithAuthzData =
  | StudentPlainPageContextWithAuthzData
  | StaffPlainPageContextWithAuthzData;
// Alias for backwards compatibility
export type PageContextWithAuthzData = PlainPageContextWithAuthzData;

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

const RawStaffAssessmentContextSchema = z.object({
  assessment: RawStaffAssessmentSchema.extend({
    type: z.enum(['Exam', 'Homework']),
  }),
  assessment_set: RawStaffAssessmentSetSchema,
});
const StaffAssessmentContextSchema =
  RawStaffAssessmentContextSchema.brand<'StaffAssessmentContext'>();

export type StaffAssessmentContext = z.infer<typeof StaffAssessmentContextSchema>;

/** Combined page context types for extractPageContext */
export type StudentCourseInstancePageContext = StudentPlainPageContext &
  StudentCourseInstanceContext;
export type StudentCourseInstancePageContextWithAuthzData = StudentPlainPageContextWithAuthzData &
  StudentCourseInstanceContext;

export type StaffCourseInstancePageContext = StaffPlainPageContext & StaffCourseInstanceContext;
export type StaffCourseInstancePageContextWithAuthzData = StaffPlainPageContextWithAuthzData &
  StaffCourseInstanceContext;

export type StaffAssessmentPageContext = StaffCourseInstancePageContext & StaffAssessmentContext;
export type StaffAssessmentPageContextWithAuthzData = StaffCourseInstancePageContextWithAuthzData &
  StaffAssessmentContext;

/** Type maps for extractPageContext - must use type for conditional/mapped types */
interface StudentPageTypeReturnMap {
  plain: StudentPlainPageContext;
  courseInstance: StudentCourseInstancePageContext;
  /** Students can't access assessment context */
  assessment: never;
}

interface StudentPageTypeReturnMapWithAuthz {
  plain: StudentPlainPageContextWithAuthzData;
  courseInstance: StudentCourseInstancePageContextWithAuthzData;
  assessment: never;
}

interface InstructorPageTypeReturnMap {
  plain: StaffPlainPageContext;
  courseInstance: StaffCourseInstancePageContext;
  assessment: StaffAssessmentPageContext;
}

interface InstructorPageTypeReturnMapWithAuthz {
  plain: StaffPlainPageContextWithAuthzData;
  courseInstance: StaffCourseInstancePageContextWithAuthzData;
  assessment: StaffAssessmentPageContextWithAuthzData;
}

type AccessType = 'student' | 'instructor';

/** Combined type maps using conditional types */
type PageTypeReturnMap<T extends AccessType> = T extends 'student'
  ? StudentPageTypeReturnMap
  : InstructorPageTypeReturnMap;

type PageTypeReturnMapWithAuthz<T extends AccessType> = T extends 'student'
  ? StudentPageTypeReturnMapWithAuthz
  : InstructorPageTypeReturnMapWithAuthz;

/**
 * Extract page context from res.locals with hierarchical inclusion.
 * - pageType 'plain': returns base page context
 * - pageType 'courseInstance': returns base + course instance context
 * - pageType 'assessment': returns base + course instance + assessment context
 */
export function extractPageContext<
  T extends 'plain' | 'courseInstance' | 'assessment',
  A extends AccessType,
  WithAuthz extends boolean = true,
>(
  resLocals: Record<string, any>,
  options: {
    pageType: T;
    accessType: A;
    withAuthzData?: WithAuthz;
  },
): WithAuthz extends true ? PageTypeReturnMapWithAuthz<A>[T] : PageTypeReturnMap<A>[T] {
  const { pageType, accessType, withAuthzData = true } = options;

  type ReturnType = WithAuthz extends true
    ? PageTypeReturnMapWithAuthz<A>[T]
    : PageTypeReturnMap<A>[T];

  // Parse base page context with appropriate schema for access type
  const baseSchema = run(() => {
    if (accessType === 'student') {
      return withAuthzData
        ? StudentPlainPageContextWithAuthzDataSchema
        : StudentPlainPageContextSchema;
    } else {
      return withAuthzData ? StaffPlainPageContextWithAuthzDataSchema : StaffPlainPageContextSchema;
    }
  });

  if (pageType === 'plain') {
    return baseSchema.parse(resLocals) as ReturnType;
  }

  const ciSchema = run(() => {
    if (accessType === 'student') {
      return StudentCourseInstanceContextSchema;
    } else {
      return StaffCourseInstanceContextSchema;
    }
  });

  if (pageType === 'courseInstance') {
    return {
      ...baseSchema.parse(resLocals),
      ...ciSchema.parse(resLocals),
    } as ReturnType;
  }

  if (pageType === 'assessment') {
    if (accessType === 'student') {
      throw new Error('Assessment context is only available for instructors');
    }
    const assessmentSchema = run(() => {
      return StaffAssessmentContextSchema;
    });

    return {
      ...baseSchema.parse(resLocals),
      ...ciSchema.parse(resLocals),
      ...assessmentSchema.parse(resLocals),
    } as ReturnType;
  }

  throw new Error(`Unknown pageType: ${String(pageType)}`);
}
