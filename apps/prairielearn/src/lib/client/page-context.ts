import { z } from 'zod';

import { run } from '@prairielearn/run';

import { NavPageSchema, NavbarTypeSchema } from '../../components/Navbar.types.js';
import { SelectUserSchema } from '../authn.types.js';
import { PageAuthzDataSchema } from '../authz-data-lib.js';
import type { UntypedResLocals } from '../res-locals.types.js';

import {
  RawStaffAssessmentSchema,
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StaffAssessmentQuestionSchema,
  StaffAssessmentSetSchema,
  StaffInstitutionSchema,
  StaffQuestionSchema,
  StaffUserSchema,
  StudentUserSchema,
} from './safe-db-types.js';

/* Plain page context */

const BasePageContextSchema = z.object({
  __csrf_token: z.string(),
  urlPrefix: z.string(),
  authn_provider_name: z.string(),
  authn_is_administrator: SelectUserSchema.shape.is_administrator,
  access_as_administrator: z.boolean(),
  is_administrator: z.boolean(),
  is_institution_administrator: z.boolean(),
  navPage: NavPageSchema,
  /** You should prefer to set the navbarType instead of using this value. */
  navbarType: NavbarTypeSchema,
});

const StudentPlainPageContextSchema = BasePageContextSchema.extend({
  authn_user: StudentUserSchema,
  authn_institution: StaffInstitutionSchema,
}).brand<'StudentPlainPageContext'>();
type StudentPlainPageContext = z.infer<typeof StudentPlainPageContextSchema>;

const StaffPlainPageContextSchema = BasePageContextSchema.extend({
  authn_user: StaffUserSchema,
  authn_institution: StaffInstitutionSchema,
}).brand<'StaffPlainPageContext'>();
type StaffPlainPageContext = z.infer<typeof StaffPlainPageContextSchema>;

/* Authz data page context */

const AuthzDataPageContextSchema = z
  .object({
    authz_data: PageAuthzDataSchema,
  })
  .brand<'AuthzDataPageContext'>();
type AuthzDataPageContext = z.infer<typeof AuthzDataPageContextSchema>;

// Since this data comes from res.locals and not the database, we can make certain guarantees
// about the data.

/* Course context */

const StudentCourseContextSchema = z
  .object({
    course: z
      .object({
        ...RawStudentCourseSchema.shape,
        // `short_name` will never be null for non-deleted courses.
        short_name: z.string(),
      })
      .brand('StudentCourse'),
  })
  .brand<'StudentCourseContext'>();
type StudentCourseContext = z.infer<typeof StudentCourseContextSchema>;

const StaffCourseContextSchema = z
  .object({
    course: z
      .object({
        ...RawStaffCourseSchema.shape,
        // `short_name` will never be null for non-deleted courses.
        short_name: z.string(),
      })
      .brand('StaffCourse'),
    institution: StaffInstitutionSchema,
  })
  .brand<'StaffCourseContext'>();
type StaffCourseContext = z.infer<typeof StaffCourseContextSchema>;

/* Course instance context */

const StudentCourseInstanceContextSchema = z
  .object({
    course_instance: z
      .object({
        ...RawStudentCourseInstanceSchema.shape,
        // `short_name` will never be null for non-deleted course instances.
        short_name: z.string(),
      })
      .brand('StudentCourseInstance'),
  })
  .brand<'StudentCourseInstanceContext'>();

type StudentCourseInstanceContext = z.infer<typeof StudentCourseInstanceContextSchema>;

const StaffCourseInstanceContextSchema = z
  .object({
    course_instance: z
      .object({
        ...RawStaffCourseInstanceSchema.shape,
        // `short_name` will never be null for non-deleted course instances.
        short_name: z.string(),
      })
      .brand('StaffCourseInstance'),
  })
  .brand<'StaffCourseInstanceContext'>();

type StaffCourseInstanceContext = z.infer<typeof StaffCourseInstanceContextSchema>;

/* Assessment context */

const StaffAssessmentContextSchema = z
  .object({
    assessment: RawStaffAssessmentSchema.extend({
      // `type` will always be one of these values
      type: z.enum(['Exam', 'Homework']),
    }).brand('StaffAssessment'),
    assessment_set: StaffAssessmentSetSchema,
  })
  .brand<'StaffAssessmentContext'>();
type StaffAssessmentContext = z.infer<typeof StaffAssessmentContextSchema>;

/* Assessment question context */

const StaffAssessmentQuestionContextSchema = z
  .object({
    assessment_question: StaffAssessmentQuestionSchema,
    question: StaffQuestionSchema,
    number_in_alternative_group: z.string(),
    num_open_instances: z.number(),
  })
  .brand<'StaffAssessmentQuestionContext'>();
type StaffAssessmentQuestionContext = z.infer<typeof StaffAssessmentQuestionContextSchema>;

// Merged page contexts

type StudentCourseInstancePageContext = StudentPlainPageContext &
  StudentCourseContext &
  StudentCourseInstanceContext;

type StaffCoursePageContext = StaffPlainPageContext & StaffCourseContext;
type StaffCourseInstancePageContext = StaffCoursePageContext & StaffCourseInstanceContext;
type StaffAssessmentPageContext = StaffCourseInstancePageContext & StaffAssessmentContext;
type StaffAssessmentQuestionPageContext = StaffAssessmentPageContext &
  StaffAssessmentQuestionContext;

/* All possible page contexts for a given page and access type */
interface PageTypeReturnMap {
  student: {
    plain: StudentPlainPageContext;
    course: never;
    courseInstance: StudentCourseInstancePageContext;
    assessment: never;
    assessmentQuestion: never;
  };
  instructor: {
    plain: StaffPlainPageContext;
    course: StaffCoursePageContext;
    courseInstance: StaffCourseInstancePageContext;
    assessment: StaffAssessmentPageContext;
    assessmentQuestion: StaffAssessmentQuestionPageContext;
  };
}

export type PageContext<
  PageType extends 'plain' | 'course' | 'courseInstance' | 'assessment' | 'assessmentQuestion',
  AccessType extends 'student' | 'instructor',
  WithAuthz extends boolean = true,
> = WithAuthz extends true
  ? PageTypeReturnMap[AccessType][PageType] & AuthzDataPageContext
  : PageTypeReturnMap[AccessType][PageType];

export type PageContextWithAuthzData = PageContext<'plain', 'student' | 'instructor', true>;

/**
 * Extract page context from res.locals with hierarchical inclusion.
 * - pageType 'plain': returns base page context
 * - pageType 'course': returns base + course context
 * - pageType 'courseInstance': returns base + course context + course instance context
 * - pageType 'assessment': returns base + course instance + assessment context
 * - pageType 'assessmentQuestion': returns base + course instance + assessment + assessment question context
 */
export function extractPageContext<
  PageType extends 'plain' | 'course' | 'courseInstance' | 'assessment' | 'assessmentQuestion',
  AccessType extends 'student' | 'instructor',
  WithAuthz extends boolean = true,
>(
  resLocals: UntypedResLocals,
  options: {
    pageType: PageType;
    accessType: AccessType;
    withAuthzData?: WithAuthz;
  },
): PageContext<PageType, AccessType, WithAuthz> {
  type ReturnType = PageContext<PageType, AccessType, WithAuthz>;

  const { pageType, accessType, withAuthzData = true } = options;

  const baseData = run(() => {
    if (accessType === 'student') {
      return StudentPlainPageContextSchema.parse(resLocals);
    } else {
      return StaffPlainPageContextSchema.parse(resLocals);
    }
  });

  const authzData = run(() => {
    if (withAuthzData) {
      return AuthzDataPageContextSchema.parse(resLocals);
    } else {
      return null;
    }
  });

  if (pageType === 'plain') {
    return {
      ...baseData,
      ...authzData,
    } as ReturnType;
  }

  const courseData = run(() => {
    if (accessType === 'student') {
      return StudentCourseContextSchema.parse(resLocals);
    } else {
      return StaffCourseContextSchema.parse(resLocals);
    }
  });

  if (pageType === 'course') {
    return {
      ...baseData,
      ...authzData,
      ...courseData,
    } as ReturnType;
  }

  const ciData = run(() => {
    if (accessType === 'student') {
      return StudentCourseInstanceContextSchema.parse(resLocals);
    } else {
      return StaffCourseInstanceContextSchema.parse(resLocals);
    }
  });

  if (pageType === 'courseInstance') {
    return {
      ...baseData,
      ...authzData,
      ...courseData,
      ...ciData,
    } as ReturnType;
  }

  const assessmentData = run(() => {
    if (accessType === 'student') {
      throw new Error('Assessment context is only available for instructors');
    }
    return StaffAssessmentContextSchema.parse(resLocals);
  });

  if (pageType === 'assessment') {
    return {
      ...baseData,
      ...authzData,
      ...courseData,
      ...ciData,
      ...assessmentData,
    } as ReturnType;
  }

  const assessmentQuestionData = run(() => {
    if (accessType === 'student') {
      throw new Error('Assessment question context is only available for instructors');
    }
    return StaffAssessmentQuestionContextSchema.parse(resLocals);
  });

  if (pageType === 'assessmentQuestion') {
    return {
      ...baseData,
      ...authzData,
      ...courseData,
      ...ciData,
      ...assessmentData,
      ...assessmentQuestionData,
    } as ReturnType;
  }

  throw new Error(`Unknown pageType: ${String(pageType)}`);
}
