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

interface PageLocalsMap {
  course: ResLocals & ResLocalsCourse & ResLocalsCourseIssueCount;
  'course-instance': ResLocals & ResLocalsCourseInstanceMisc & ResLocalsCourseInstance;
  'instructor-instance-question': ResLocals &
    ResLocalsCourseInstanceMisc &
    ResLocalsCourseInstance &
    ResLocalsInstructorQuestionWithCourseInstance &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender &
    ResLocalsQuestionRender & {
      questionRenderContext: 'manual_grading' | 'ai_grading';
      navbarType: 'instructor';
    };
  'instructor-question': ResLocals & ResLocalsInstructorQuestion & ResLocalsQuestionRender;
  'instance-question': ResLocals &
    ResLocalsCourseInstanceMisc &
    ResLocalsCourseInstance &
    ResLocalsInstanceQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-question': ResLocals &
    ResLocalsAssessment &
    ResLocalsAssessmentQuestion &
    ResLocalsInstanceQuestionRender;
  'assessment-instance': ResLocals & ResLocalsAssessment & ResLocalsAssessmentInstance;
  assessment: ResLocals & ResLocalsAssessment;
}

export type PageType = keyof PageLocalsMap;

interface ResLocalsCourseInstanceMisc {
  urlPrefix: string;
  navbarType: 'student' | 'instructor';
}

export type ResLocalsForPage<T extends PageType> = PageLocalsMap[T];

export function getResLocalsForPage<T extends PageType>(
  locals: Record<string, any>,
): ResLocalsForPage<T> {
  return locals as ResLocalsForPage<T>;
}
