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

import type { ResLocalsAuthnUser } from './authn.js';
import type {
  ResLocalsInstanceQuestionRender,
  ResLocalsQuestionRender,
} from './question-render.js';

export interface ResLocals extends ResLocalsAuthnUser {
  __csrf_token: string;
}

export type PageType =
  | 'instructor-instance-question'
  | 'instructor-question'
  | 'instance-question'
  | 'assessment-question'
  | 'assessment-instance'
  | 'assessment'
  | 'course-instance'
  | 'course';

interface ResLocalsCourseInstanceMisc {
  urlPrefix: string;
  navbarType: 'student' | 'instructor';
}

export type ResLocalsForPage<T extends PageType> = T extends 'course'
  ? ResLocals & ResLocalsCourse & ResLocalsCourseIssueCount
  : T extends 'course-instance'
    ? ResLocals & ResLocalsCourseInstanceMisc & ResLocalsCourseInstance
    : T extends 'instructor-instance-question'
      ? ResLocals &
          ResLocalsCourseInstanceMisc &
          ResLocalsCourseInstance &
          ResLocalsInstructorQuestionWithCourseInstance &
          ResLocalsInstanceQuestion &
          ResLocalsInstanceQuestionRender &
          ResLocalsQuestionRender & { questionRenderContext: 'manual_grading' | 'ai_grading' }
      : T extends 'instructor-question'
        ? ResLocals & ResLocalsInstructorQuestion & ResLocalsQuestionRender
        : T extends 'instance-question'
          ? ResLocals &
              ResLocalsCourseInstanceMisc &
              ResLocalsCourseInstance &
              ResLocalsInstanceQuestion &
              ResLocalsInstanceQuestionRender
          : T extends 'assessment-question'
            ? ResLocals &
                ResLocalsAssessment &
                ResLocalsAssessmentQuestion &
                ResLocalsInstanceQuestionRender
            : T extends 'assessment-instance'
              ? ResLocals & ResLocalsAssessment & ResLocalsAssessmentInstance
              : T extends 'assessment'
                ? ResLocals & ResLocalsAssessment
                : never;

export function getResLocalsForPage<T extends PageType>(
  locals: Record<string, any>,
): ResLocalsForPage<T> {
  return locals as ResLocalsForPage<T>;
}
