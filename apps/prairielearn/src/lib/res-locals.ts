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
import type { Prettify } from './types.js';

export interface ResLocals extends ResLocalsAuthnUser, ResLocalsConfig {
  __csrf_token: string;
}

export interface ResLocalsForPage {
  course: Prettify<ResLocals & ResLocalsCourse & ResLocalsCourseIssueCount>;
  'course-instance': Prettify<ResLocals & ResLocalsCourseInstance>;
  'instructor-instance-question': Prettify<
    ResLocals &
      ResLocalsCourseInstance &
      ResLocalsInstructorQuestionWithCourseInstance &
      ResLocalsInstanceQuestion &
      ResLocalsInstanceQuestionRender &
      ResLocalsQuestionRender & {
        questionRenderContext: 'manual_grading' | 'ai_grading';
        navbarType: 'instructor';
      }
  >;
  'instructor-question': Prettify<
    ResLocals &
      ResLocalsCourse &
      Partial<ResLocalsCourseInstance> &
      ResLocalsInstructorQuestion &
      ResLocalsQuestionRender
  >;
  'instructor-assessment-question': Prettify<
    ResLocals &
      ResLocalsCourseInstance &
      ResLocalsInstructorQuestion &
      ResLocalsQuestionRender &
      ResLocalsAssessmentQuestion
  >;
  'instance-question': Prettify<
    ResLocals &
      ResLocalsCourseInstance &
      ResLocalsInstanceQuestion &
      ResLocalsInstanceQuestionRender
  >;
  'assessment-question': Prettify<
    ResLocals & ResLocalsAssessment & ResLocalsAssessmentQuestion & ResLocalsInstanceQuestionRender
  >;
  'assessment-instance': Prettify<ResLocals & ResLocalsAssessment & ResLocalsAssessmentInstance>;
  assessment: Prettify<ResLocals & ResLocalsCourseInstance & ResLocalsAssessment>;
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
