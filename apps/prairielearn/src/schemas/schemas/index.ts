import { AdminQuerySchema } from './adminQuery.js';
import { AssessmentSchema, LegacyAssessmentSchema } from './infoAssessment.js';
import { CourseSchema } from './infoCourse.js';
import { CourseInstanceSchema, LegacyCourseInstanceSchema } from './infoCourseInstance.js';
import { ElementCoreSchema, LegacyElementCoreSchema } from './infoElementCore.js';
import { ElementCourseSchema, LegacyElementCourseSchema } from './infoElementCourse.js';
import { ElementExtensionSchema, LegacyElementExtensionSchema } from './infoElementExtension.js';
import { NewsItemSchema } from './infoNewsItem.js';
import { QuestionSchema, LegacyQuestionSchema } from './infoQuestion.js';
import { CalculationQuestionOptionsSchema } from './questionOptionsCalculation.js';
import { CheckboxQuestionOptionsSchema } from './questionOptionsCheckbox.js';
import { FileQuestionOptionsSchema } from './questionOptionsFile.js';
import { MultipleChoiceQuestionOptionsSchema } from './questionOptionsMultipleChoice.js';
import { MultipleTrueFalseQuestionOptionsSchema } from './questionOptionsMultipleTrueFalse.js';
import { QuestionOptionsv3Schema } from './questionOptionsv3.js';

export {
  /* no support for deprecated options */
  AdminQuerySchema,
  AssessmentSchema,
  CourseSchema,
  CourseInstanceSchema,
  ElementCoreSchema,
  ElementCourseSchema,
  ElementExtensionSchema,
  NewsItemSchema,
  QuestionSchema,
  CalculationQuestionOptionsSchema,
  CheckboxQuestionOptionsSchema,
  FileQuestionOptionsSchema,
  MultipleChoiceQuestionOptionsSchema,
  MultipleTrueFalseQuestionOptionsSchema,
  QuestionOptionsv3Schema,
  /* supports deprecated options */
  LegacyAssessmentSchema,
  LegacyCourseInstanceSchema,
  LegacyElementCoreSchema,
  LegacyElementCourseSchema,
  LegacyElementExtensionSchema,
  LegacyQuestionSchema,
};
