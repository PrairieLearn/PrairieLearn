import { type JSONSchemaType } from 'ajv';
import { type ZodTypeDef, type ZodType } from 'zod';
import {
  ignoreOverride,
  type JsonSchema7Type,
  type Options,
  type Refs,
  zodToJsonSchema,
} from 'zod-to-json-schema';

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
  type NewsItem,
  type MultipleTrueFalseQuestionOptions,
  type QuestionOptionsv3,
  type MultipleChoiceQuestionOptions,
  type FileQuestionOptions,
  type CheckboxQuestionOptions,
  type CalculationQuestionOptions,
  type Question,
  type ElementExtension,
  type ElementCore,
  type CourseInstance,
  type Course,
  type Assessment,
  type ElementCourse,
  ColorSchema,
  PointsSingleSchema,
  PointsSchema,
  QuestionIdSchema,
  ForceMaxPointsSchema,
  AdvanceScorePercSchema,
  AssessmentSetSchema,
  WorkspaceOptionsSchema,
  DependencySchema,
} from './schemas/index.js';
export * from './schemas/index.js';

/**
 * Rewrite the group role annotation for canView and canSubmit fields.
 * zod-to-json-schema doesn't support a concept of unique items in an array (only sets),
 * so we need to override the schema.
 */
const rewriteGroupRoleAnnotation = (
  def: ZodTypeDef,
  refs: Refs,
): JsonSchema7Type | undefined | typeof ignoreOverride => {
  const segment = refs.currentPath[refs.currentPath.length - 1];
  if (['canView', 'canSubmit'].includes(segment)) {
    const action = segment === 'canView' ? 'view' : 'submit';
    const annotation = `A list of group role names that can ${action} questions in this assessment. Only applicable for group assessments.`;
    return {
      description: annotation,
      type: 'array',
      items: {
        type: 'string',
      },
      uniqueItems: true,
      default: [],
    };
  }

  return ignoreOverride;
};

const prairielearnZodToJsonSchema = (
  schema: ZodType<any>,
  options: Partial<Options<'jsonSchema7'>>,
) => {
  return zodToJsonSchema(schema, {
    ...options,
    override: rewriteGroupRoleAnnotation,
  });
};

export const infoNewsItem = prairielearnZodToJsonSchema(NewsItemSchema, {
  name: 'News Item Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<NewsItem>;

export const infoAssessment = prairielearnZodToJsonSchema(AssessmentSchema, {
  name: 'Assessment info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: {
    PointsSchema,
    PointsSingleSchema,
    QuestionIdSchema,
    ForceMaxPointsSchema,
    AdvanceScorePercSchema,
  },
}) as JSONSchemaType<Assessment>;

export const infoCourse = prairielearnZodToJsonSchema(CourseSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { ColorSchema, AssessmentSetSchema },
}) as JSONSchemaType<Course>;

export const infoCourseInstance = prairielearnZodToJsonSchema(CourseInstanceSchema, {
  name: 'Course instance information',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<CourseInstance>;

export const infoElementCore = prairielearnZodToJsonSchema(ElementCoreSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<ElementCore>;

export const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<ElementCourse>;

export const infoElementExtension = prairielearnZodToJsonSchema(ElementExtensionSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<ElementExtension>;

export const infoQuestion = prairielearnZodToJsonSchema(QuestionSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { WorkspaceOptionsSchema, DependencySchema },
}) as JSONSchemaType<Question>;

export const questionOptionsCalculation = prairielearnZodToJsonSchema(
  CalculationQuestionOptionsSchema,
  {
    name: 'Calculation question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
  },
) as JSONSchemaType<CalculationQuestionOptions>;

export const questionOptionsCheckbox = prairielearnZodToJsonSchema(CheckboxQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<CheckboxQuestionOptions>;

export const questionOptionsFile = prairielearnZodToJsonSchema(FileQuestionOptionsSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<FileQuestionOptions>;

export const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  MultipleChoiceQuestionOptionsSchema,
  {
    name: 'MultipleChoice question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
  },
) as JSONSchemaType<MultipleChoiceQuestionOptions>;

export const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  MultipleTrueFalseQuestionOptionsSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
  },
) as JSONSchemaType<MultipleTrueFalseQuestionOptions>;

export const questionOptionsv3 = prairielearnZodToJsonSchema(QuestionOptionsv3Schema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
}) as JSONSchemaType<QuestionOptionsv3>;

export const ajvSchemas = {
  infoNewsItem,
  infoAssessment,
  infoCourse,
  infoCourseInstance,
  infoElementCore,
  infoElementCourse,
  infoElementExtension,
  infoQuestion,
  questionOptionsCalculation,
  questionOptionsCheckbox,
  questionOptionsFile,
  questionOptionsMultipleChoice,
  questionOptionsMultipleTrueFalse,
  questionOptionsv3,
};
