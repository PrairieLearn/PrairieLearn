import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  /* no support for deprecated options */
  CourseSchema,
  NewsItemSchema,
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
} from './schemas/index.js';

export const infoNewsItem = zodToJsonSchema(NewsItemSchema, {
  name: 'News Item Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoAssessment = zodToJsonSchema(LegacyAssessmentSchema, {
  name: 'Assessment info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoCourse = zodToJsonSchema(CourseSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoCourseInstance = zodToJsonSchema(LegacyCourseInstanceSchema, {
  name: 'Course instance information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementCore = zodToJsonSchema(LegacyElementCoreSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementCourse = zodToJsonSchema(LegacyElementCourseSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementExtension = zodToJsonSchema(LegacyElementExtensionSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoQuestion = zodToJsonSchema(LegacyQuestionSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsCalculation = zodToJsonSchema(CalculationQuestionOptionsSchema, {
  name: 'Calculation question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsCheckbox = zodToJsonSchema(CheckboxQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsFile = zodToJsonSchema(FileQuestionOptionsSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsMultipleChoice = zodToJsonSchema(MultipleChoiceQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsMultipleTrueFalse = zodToJsonSchema(
  MultipleTrueFalseQuestionOptionsSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema2019-09',
  },
);
export const questionOptionsv3 = zodToJsonSchema(QuestionOptionsv3Schema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
