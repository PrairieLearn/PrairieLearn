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

export type ResLocals = object;

export type PageType =
  | 'instructor-question-with-course-instance'
  | 'instructor-question'
  | 'instance-question'
  | 'assessment-question'
  | 'assessment-instance'
  | 'assessment'
  | 'course-instance'
  | 'course';

export type ResLocalsForPage<T extends PageType> = T extends 'course'
  ? ResLocals & ResLocalsCourse
  : T extends 'course-instance'
    ? ResLocals & ResLocalsCourseInstance
    : T extends 'instructor-course-instance-question'
      ? ResLocals & ResLocalsInstructorQuestionWithCourseInstance
      : T extends 'instructor-question'
        ? ResLocals & ResLocalsInstructorQuestion
        : T extends 'instance-question'
          ? ResLocals & ResLocalsCourseInstance & ResLocalsInstanceQuestion
          : T extends 'assessment-question'
            ? ResLocals & ResLocalsAssessment & ResLocalsAssessmentQuestion
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

export type ResLocalsProperty<
  T extends PageType,
  K extends keyof ResLocalsForPage<T>,
> = ResLocalsForPage<T>[K];

export type HasProperty<T extends PageType, K extends string> = K extends keyof ResLocalsForPage<T>
  ? true
  : false;
