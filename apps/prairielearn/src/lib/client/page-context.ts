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
  StaffAssessmentQuestionSchema,
  StaffInstitutionSchema,
  StaffQuestionSchema,
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

// Student course context
const RawStudentCourseContextSchema = z.object({
  course: z
    .object({
      ...RawStudentCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourse'),
  has_enhanced_navigation: z.boolean(),
});
export const StudentCourseContextSchema =
  RawStudentCourseContextSchema.brand<'StudentCourseContext'>();
export type StudentCourseContext = z.infer<typeof StudentCourseContextSchema>;

// Staff course context
const RawStaffCourseContextSchema = z.object({
  course: z
    .object({
      ...RawStaffCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourse'),
  institution: StaffInstitutionSchema,
  has_enhanced_navigation: z.boolean(),
});
export const StaffCourseContextSchema = RawStaffCourseContextSchema.brand<'StaffCourseContext'>();
export type StaffCourseContext = z.infer<typeof StaffCourseContextSchema>;

// Student course instance context
const RawStudentCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStudentCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourseInstance'),
});
export const StudentCourseInstanceContextSchema =
  RawStudentCourseInstanceContextSchema.brand<'StudentCourseInstanceContext'>();

export type StudentCourseInstanceContext = z.infer<typeof StudentCourseInstanceContextSchema>;

// Staff course instance context
const RawStaffCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStaffCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourseInstance'),
});
export const StaffCourseInstanceContextSchema =
  RawStaffCourseInstanceContextSchema.brand<'StaffCourseInstanceContext'>();

export type StaffCourseInstanceContext = z.infer<typeof StaffCourseInstanceContextSchema>;

// Staff assessment context
const RawStaffAssessmentContextSchema = z.object({
  assessment: RawStaffAssessmentSchema.extend({
    type: z.enum(['Exam', 'Homework']),
  }),
  assessment_set: RawStaffAssessmentSetSchema,
});
const StaffAssessmentContextSchema =
  RawStaffAssessmentContextSchema.brand<'StaffAssessmentContext'>();
export type StaffAssessmentContext = z.infer<typeof StaffAssessmentContextSchema>;

const RawStaffAssessmentQuestionContextSchema = z.object({
  assessment_question: StaffAssessmentQuestionSchema,
  question: StaffQuestionSchema,
  number_in_alternative_group: z.string(),
  num_open_instances: z.number(),
});
const StaffAssessmentQuestionContextSchema =
  RawStaffAssessmentQuestionContextSchema.brand<'StaffAssessmentQuestionContext'>();
export type StaffAssessmentQuestionContext = z.infer<typeof StaffAssessmentQuestionContextSchema>;

/** Combined page context types for extractPageContext */

// Student course
export type StudentCoursePageContext = StudentPlainPageContext & StudentCourseContext;
export type StudentCoursePageContextWithAuthzData = StudentPlainPageContextWithAuthzData &
  StudentCourseContext;

// Staff course
export type StaffCoursePageContext = StaffPlainPageContext & StaffCourseContext;
export type StaffCoursePageContextWithAuthzData = StaffPlainPageContextWithAuthzData &
  StaffCourseContext;

// Student course instance
export type StudentCourseInstancePageContext = StudentCoursePageContext &
  StudentCourseInstanceContext;
export type StudentCourseInstancePageContextWithAuthzData = StudentCoursePageContextWithAuthzData &
  StudentCourseInstanceContext;

// Staff course instance
export type StaffCourseInstancePageContext = StaffCoursePageContext & StaffCourseInstanceContext;
export type StaffCourseInstancePageContextWithAuthzData = StaffCoursePageContextWithAuthzData &
  StaffCourseInstanceContext;

// Staff assessment
export type StaffAssessmentPageContext = StaffCourseInstancePageContext & StaffAssessmentContext;
export type StaffAssessmentPageContextWithAuthzData = StaffCourseInstancePageContextWithAuthzData &
  StaffAssessmentContext;

// Staff assessment question
export type StaffAssessmentQuestionPageContext = StaffAssessmentPageContext &
  StaffAssessmentQuestionContext;
export type StaffAssessmentQuestionPageContextWithAuthzData =
  StaffAssessmentPageContextWithAuthzData & StaffAssessmentQuestionContext;

/** Type maps for extractPageContext - must use type for conditional/mapped types */
interface StudentPageTypeReturnMap {
  plain: StudentPlainPageContext;
  course: StudentCoursePageContext;
  courseInstance: StudentCourseInstancePageContext;
  /** Students can't access assessment context */
  assessment: never;
  assessmentQuestion: never;
}

interface StudentPageTypeReturnMapWithAuthz {
  plain: StudentPlainPageContextWithAuthzData;
  course: StudentCoursePageContextWithAuthzData;
  courseInstance: StudentCourseInstancePageContextWithAuthzData;
  assessment: never;
  assessmentQuestion: never;
}

interface InstructorPageTypeReturnMap {
  plain: StaffPlainPageContext;
  course: StaffCoursePageContext;
  courseInstance: StaffCourseInstancePageContext;
  assessment: StaffAssessmentPageContext;
  assessmentQuestion: StaffAssessmentQuestionPageContext;
}

interface InstructorPageTypeReturnMapWithAuthz {
  plain: StaffPlainPageContextWithAuthzData;
  course: StaffCoursePageContextWithAuthzData;
  courseInstance: StaffCourseInstancePageContextWithAuthzData;
  assessment: StaffAssessmentPageContextWithAuthzData;
  assessmentQuestion: StaffAssessmentQuestionPageContextWithAuthzData;
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
 * - pageType 'course': returns base + course context
 * - pageType 'courseInstance': returns base + course context + course instance context
 * - pageType 'assessment': returns base + course instance + assessment context
 * - pageType 'assessmentQuestion': returns base + course instance + assessment + assessment question context
 */
export function extractPageContext<
  T extends 'plain' | 'course' | 'courseInstance' | 'assessment' | 'assessmentQuestion',
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

  const courseSchema = run(() => {
    if (accessType === 'student') {
      return StudentCourseContextSchema;
    } else {
      return StaffCourseContextSchema;
    }
  });

  if (pageType === 'course') {
    return {
      ...baseSchema.parse(resLocals),
      ...courseSchema.parse(resLocals),
    } as ReturnType;
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
      ...courseSchema.parse(resLocals),
      ...ciSchema.parse(resLocals),
    } as ReturnType;
  }

  const assessmentSchema = run(() => {
    if (accessType === 'student') {
      throw new Error('Assessment context is only available for instructors');
    }
    return StaffAssessmentContextSchema;
  });

  if (pageType === 'assessment') {
    return {
      ...baseSchema.parse(resLocals),
      ...courseSchema.parse(resLocals),
      ...ciSchema.parse(resLocals),
      ...assessmentSchema.parse(resLocals),
    } as ReturnType;
  }

  const assessmentQuestionSchema = run(() => {
    if (accessType === 'student') {
      throw new Error('Assessment question context is only available for instructors');
    }
    return StaffAssessmentQuestionContextSchema;
  });

  if (pageType === 'assessmentQuestion') {
    return {
      ...baseSchema.parse(resLocals),
      ...courseSchema.parse(resLocals),
      ...ciSchema.parse(resLocals),
      ...assessmentSchema.parse(resLocals),
      ...assessmentQuestionSchema.parse(resLocals),
    } as ReturnType;
  }

  throw new Error(`Unknown pageType: ${String(pageType)}`);
}
