import type express from 'express';
import asyncHandler from 'express-async-handler';
import type core from 'express-serve-static-core';

import type { IsUnion, MergeUnion, Prettify } from '@prairielearn/utils';

import type {
  ResLocalsCourse,
  ResLocalsCourseInstance,
} from '../middlewares/authzCourseOrInstance.js';
import type { ResLocalsDate } from '../middlewares/date.js';
import type { ResLocalsAssessment } from '../middlewares/selectAndAuthzAssessment.js';
import type { ResLocalsAssessmentInstance } from '../middlewares/selectAndAuthzAssessmentInstance.js';
import type { ResLocalsAssessmentQuestion } from '../middlewares/selectAndAuthzAssessmentQuestion.js';
import type { ResLocalsInstanceQuestion } from '../middlewares/selectAndAuthzInstanceQuestion.js';
import type {
  ResLocalsInstructorQuestion,
  ResLocalsInstructorQuestionSchema,
} from '../middlewares/selectAndAuthzInstructorQuestion.js';
import type { ResLocalsCourseIssueCount } from '../middlewares/selectOpenIssueCount.js';

import type { ResLocalsAuthnUser } from './authn.types.js';
import type { ResLocalsConfig } from './config.js';
import type { Course, CourseInstance } from './db-types.js';
import type {
  ResLocalsInstanceQuestionRender,
  ResLocalsQuestionRender,
} from './question-render.types.js';

interface ResLocals extends ResLocalsAuthnUser, ResLocalsConfig, ResLocalsDate {
  __csrf_token: string;
}

interface ResLocalsForPageLookup {
  plain: ResLocals;
  course: ResLocals & ResLocalsCourse & ResLocalsCourseIssueCount;
  'public-course': ResLocals & { course: Course };
  'course-instance': ResLocals & ResLocalsCourseInstance;
  'public-course-instance': ResLocals & {
    course: Course;
    course_instance: CourseInstance;
  };
  'instructor-instance-question': ResLocals &
    ResLocalsCourseIssueCount &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestionSchema &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender &
    ResLocalsQuestionRender & {
      questionRenderContext: 'manual_grading' | 'ai_grading';
      navbarType: 'instructor';
    };
  'instructor-question': ResLocals &
    ResLocalsCourse &
    ResLocalsCourseIssueCount &
    Partial<ResLocalsCourseInstance> &
    ResLocalsInstructorQuestion &
    ResLocalsQuestionRender;
  'instructor-assessment-question': ResLocals &
    ResLocalsCourseIssueCount &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestion &
    ResLocalsQuestionRender &
    ResLocalsAssessment &
    ResLocalsAssessmentQuestion;
  'instance-question': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-question': ResLocals &
    ResLocalsAssessment &
    ResLocalsAssessmentQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-instance': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsAssessment &
    ResLocalsAssessmentInstance;
  assessment: ResLocals & ResLocalsCourseInstance & ResLocalsAssessment;
}

// Only apply MergeUnion when T is a union of page types; preserve unions for single types
export type ResLocalsForPage<T extends keyof ResLocalsForPageLookup> =
  true extends IsUnion<T> ? MergeUnion<ResLocalsForPageLookup[T]> : ResLocalsForPageLookup[T];

type PageType = keyof ResLocalsForPageLookup;

/**
 * A wrapper around {@link asyncHandler} that ensures that the locals
 * are typed correctly for the given page type.
 *
 * @example
 * ```ts
 * router.get('/', typedAsyncHandler<'course'>(async (req, res) => {
 *   res.send(`Hello, ${res.locals.course.short_name}`);
 * }));
 * ```
 *
 * The page types include:
 *
 * - `plain`: A basic page with authn data (e.g. admin, auth, home pages)
 * - `course`: A course page.
 * - `course-instance`: A course instance page.
 * - `instructor-instance-question`: An instructor instance question page.
 * - `instructor-question`: An instructor question page.
 * - `instructor-assessment-question`: An instructor assessment question page.
 * - `instance-question`: An instance question page.
 * - `assessment-question`: An assessment question page.
 * - `assessment-instance`: An assessment instance page.
 * - `assessment`: An assessment page.
 *
 * @param handler - The handler function to wrap.
 * @returns A wrapped handler function.
 */
export const typedAsyncHandler = <T extends PageType, ExtraLocals = object>(
  handler: (
    ...args: Parameters<
      express.RequestHandler<
        core.ParamsDictionary,
        any,
        any,
        core.Query,
        Prettify<ResLocalsForPage<T> & ExtraLocals>
      >
    >
  ) => void | Promise<void>,
) => {
  return asyncHandler(
    handler as express.RequestHandler<
      core.ParamsDictionary,
      any,
      any,
      core.Query,
      Record<string, any>
    >,
  );
};
