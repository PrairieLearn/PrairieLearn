import type express from 'express';
import asyncHandler from 'express-async-handler';
import type core from 'express-serve-static-core';

import type {
  ResLocalsCourse,
  ResLocalsCourseInstance,
} from '../middlewares/authzCourseOrInstance.js';
import type { ResLocalsAssessment } from '../middlewares/selectAndAuthzAssessment.js';
import type { ResLocalsAssessmentInstance } from '../middlewares/selectAndAuthzAssessmentInstance.js';
import type { ResLocalsAssessmentQuestion } from '../middlewares/selectAndAuthzAssessmentQuestion.js';
import type { ResLocalsInstanceQuestion } from '../middlewares/selectAndAuthzInstanceQuestion.js';
import type {
  ResLocalsInstructorQuestion,
  ResLocalsInstructorQuestionWithCourseInstance,
} from '../middlewares/selectAndAuthzInstructorQuestion.js';
import type { ResLocalsCourseIssueCount } from '../middlewares/selectOpenIssueCount.js';

import type { ResLocalsAuthnUser } from './authn.types.js';
import type { ResLocalsConfig } from './config.js';
import type {
  ResLocalsInstanceQuestionRender,
  ResLocalsQuestionRender,
} from './question-render.types.js';

export interface ResLocals extends ResLocalsAuthnUser, ResLocalsConfig {
  __csrf_token: string;
}

export interface ResLocalsForPage {
  course: ResLocals & ResLocalsCourse & ResLocalsCourseIssueCount;
  'course-instance': ResLocals & ResLocalsCourseInstance;
  'instructor-instance-question': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestionWithCourseInstance &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender &
    ResLocalsQuestionRender & {
      questionRenderContext: 'manual_grading' | 'ai_grading';
      navbarType: 'instructor';
    };
  'course-question': ResLocals &
    ResLocalsCourse &
    ResLocalsQuestionRender &
    ResLocalsInstructorQuestion;
  'course-instance-question': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestion &
    ResLocalsQuestionRender;
  'instructor-assessment-question': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestion &
    ResLocalsQuestionRender &
    ResLocalsAssessmentQuestion;
  'instance-question': ResLocals &
    ResLocalsCourseInstance &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-question': ResLocals &
    ResLocalsAssessment &
    ResLocalsAssessmentQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-instance': ResLocals & ResLocalsAssessment & ResLocalsAssessmentInstance;
  assessment: ResLocals & ResLocalsCourseInstance & ResLocalsAssessment;
}

export type PageType = keyof ResLocalsForPage;

export function getResLocalsForPage<T extends PageType>(
  locals: Record<string, any>,
): ResLocalsForPage[T] {
  return locals as ResLocalsForPage[T];
}

/**
 * A wrapper around {@link asyncHandler} that ensures that the locals
 * are typed correctly for the given page type.
 *
 * @example
 * ```ts
 * router.get('/', typedAsyncHandler<'course'>(async (req, res) => {
 *   res.send('Hello, world!');
 * }));
 * ```
 *
 * The page types include:
 *
 * - `course`: A course page.
 * - `course-instance`: A course instance page.
 * - `instructor-instance-question`: An instructor instance question page.
 * - `public-question`: A public question page.
 * - `course-instance-question`: An instructor question page.
 * - `instructor-assessment-question`: An instructor assessment question page.
 * - `instance-question`: An instance question page.
 * - `assessment-question`: An assessment question page.
 * - `assessment-instance`: An assessment instance page.
 * - `assessment`: An assessment page.
 *
 * @param handler - The handler function to wrap.
 * @returns A wrapped handler function.
 */
export const typedAsyncHandler = <T extends keyof ResLocalsForPage, ExtraLocals = object>(
  handler: (
    ...args: Parameters<
      express.RequestHandler<
        core.ParamsDictionary,
        any,
        any,
        core.Query,
        ResLocalsForPage[T] & ExtraLocals
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
