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

export type UntypedResLocals = Record<string, any>;

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
      ResLocalsAssessment &
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
