import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  QuestionSchema,
  AssessmentSchema,
  CourseInstanceSchema,
  CourseSchema,
  NewsItemSchema,
  CalculationQuestionOptionsSchema,
  CheckboxQuestionOptionsSchema,
  FileQuestionOptionsSchema,
  MultipleChoiceQuestionOptionsSchema,
  MultipleTrueFalseQuestionOptionsSchema,
  QuestionOptionsv3Schema,
  ElementCoreSchema,
  ElementCourseSchema,
  ElementExtensionSchema,
  NewsItem,
  MultipleTrueFalseQuestionOptions,
  QuestionOptionsv3,
  MultipleChoiceQuestionOptions,
  FileQuestionOptions,
  CheckboxQuestionOptions,
  CalculationQuestionOptions,
  Question,
  ElementExtension,
  ElementCore,
  CourseInstance,
  Course,
  Assessment,
  ElementCourse,
} from './schemas/index.js';
export * from './schemas/index.js';

import { JSONSchemaType } from 'ajv';

export const infoNewsItem = zodToJsonSchema(NewsItemSchema, {
  name: 'News Item Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<NewsItem>;

export const infoAssessment = zodToJsonSchema(AssessmentSchema, {
  name: 'Assessment info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<Assessment>;

export const infoCourse = zodToJsonSchema(CourseSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<Course>;

export const infoCourseInstance = zodToJsonSchema(CourseInstanceSchema, {
  name: 'Course instance information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<CourseInstance>;

export const infoElementCore = zodToJsonSchema(ElementCoreSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<ElementCore>;

export const infoElementCourse = zodToJsonSchema(ElementCourseSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<ElementCourse>;

export const infoElementExtension = zodToJsonSchema(ElementExtensionSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<ElementExtension>;

export const infoQuestion = zodToJsonSchema(QuestionSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<Question>;

export const questionOptionsCalculation = zodToJsonSchema(CalculationQuestionOptionsSchema, {
  name: 'Calculation question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<CalculationQuestionOptions>;

export const questionOptionsCheckbox = zodToJsonSchema(CheckboxQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<CheckboxQuestionOptions>;

export const questionOptionsFile = zodToJsonSchema(FileQuestionOptionsSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<FileQuestionOptions>;

export const questionOptionsMultipleChoice = zodToJsonSchema(MultipleChoiceQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<MultipleChoiceQuestionOptions>;

export const questionOptionsMultipleTrueFalse = zodToJsonSchema(
  MultipleTrueFalseQuestionOptionsSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema2019-09',
  },
) as JSONSchemaType<MultipleTrueFalseQuestionOptions>;

export const questionOptionsv3 = zodToJsonSchema(QuestionOptionsv3Schema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
}) as JSONSchemaType<QuestionOptionsv3>;
