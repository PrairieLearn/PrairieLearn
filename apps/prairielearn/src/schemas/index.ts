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
  QuestionJsonSchema,
  AssessmentJsonSchema,
  CourseInstanceJsonSchema,
  CourseJsonSchema,
  NewsItemJsonSchema,
  QuestionCalculationOptionsJsonSchema,
  QuestionCheckboxOptionsJsonSchema,
  QuestionFileOptionsJsonSchema,
  QuestionMultipleChoiceOptionsJsonSchema,
  QuestionMultipleTrueFalseOptionsJsonSchema,
  QuestionOptionsv3JsonSchema,
  ElementCoreJsonSchema,
  ElementCourseJsonSchema,
  ElementExtensionJsonSchema,
  type NewsItemJson,
  type QuestionMultipleTrueFalseOptionsJson,
  type QuestionOptionsv3Json,
  type QuestionMultipleChoiceOptionsJson,
  type QuestionFileOptionsJson,
  type QuestionCheckboxOptionsJson,
  type QuestionCalculationOptionsJson,
  type QuestionJson,
  type ElementExtensionJson,
  type ElementCoreJson,
  type CourseInstanceJson,
  type CourseJson,
  type AssessmentJson,
  type ElementCourseJson,
  ColorJsonSchema,
  PointsSingleJsonSchema,
  PointsJsonSchema,
  QuestionIdJsonSchema,
  ForceMaxPointsJsonSchema,
  AdvanceScorePercJsonSchema,
  AssessmentSetJsonSchema,
  WorkspaceOptionsJsonSchema,
  DependencyJsonSchema,
  CommentJsonSchema,
  ExternalGradingOptionsJsonSchema,
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

export const infoNewsItem = prairielearnZodToJsonSchema(NewsItemJsonSchema, {
  name: 'News Item Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<NewsItemJson>;

export const infoAssessment = prairielearnZodToJsonSchema(AssessmentJsonSchema, {
  name: 'Assessment info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: {
    PointsJsonSchema,
    PointsSingleJsonSchema,
    QuestionIdJsonSchema,
    ForceMaxPointsJsonSchema,
    AdvanceScorePercJsonSchema,
    CommentJsonSchema,
  },
}) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(CourseJsonSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { ColorJsonSchema, AssessmentSetJsonSchema, CommentJsonSchema },
}) as JSONSchemaType<CourseJson>;

export const infoCourseInstance = prairielearnZodToJsonSchema(CourseInstanceJsonSchema, {
  name: 'Course instance information',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<CourseInstanceJson>;

export const infoElementCore = prairielearnZodToJsonSchema(ElementCoreJsonSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema, DependencyJsonSchema },
}) as JSONSchemaType<ElementCoreJson>;

export const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseJsonSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema, DependencyJsonSchema },
}) as JSONSchemaType<ElementCourseJson>;

export const infoElementExtension = prairielearnZodToJsonSchema(ElementExtensionJsonSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema, DependencyJsonSchema },
}) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(QuestionJsonSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: {
    WorkspaceOptionsJsonSchema,
    DependencyJsonSchema,
    CommentJsonSchema,
    ExternalGradingOptionsJsonSchema,
  },
}) as JSONSchemaType<QuestionJson>;

export const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionCalculationOptionsJsonSchema,
  {
    name: 'Calculation question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionCalculationOptionsJson>;

export const questionOptionsCheckbox = prairielearnZodToJsonSchema(
  QuestionCheckboxOptionsJsonSchema,
  {
    name: 'MultipleChoice question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionCheckboxOptionsJson>;

export const questionOptionsFile = prairielearnZodToJsonSchema(QuestionFileOptionsJsonSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<QuestionFileOptionsJson>;

export const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionMultipleChoiceOptionsJsonSchema,
  {
    name: 'MultipleChoice question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionMultipleChoiceOptionsJson>;

export const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionMultipleTrueFalseOptionsJsonSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionMultipleTrueFalseOptionsJson>;

export const questionOptionsv3 = prairielearnZodToJsonSchema(QuestionOptionsv3JsonSchema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<QuestionOptionsv3Json>;

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
