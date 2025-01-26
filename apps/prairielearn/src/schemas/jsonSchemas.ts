import { type JSONSchemaType } from 'ajv';
import { type ZodTypeDef, type ZodType } from 'zod';
import {
  ignoreOverride,
  type JsonSchema7Type,
  type Options,
  type Refs,
  zodToJsonSchema,
} from 'zod-to-json-schema';

import { CommentJsonSchema } from './comment.js';
import {
  AdvanceScorePercJsonSchema,
  AssessmentAccessRuleJsonSchema,
  AssessmentJsonSchema,
  ForceMaxPointsJsonSchema,
  GroupRoleJsonSchema,
  PointsJsonSchema,
  PointsListJsonSchema,
  PointsSingleJsonSchema,
  QuestionAlternativeJsonSchema,
  QuestionIdJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionJsonSchema,
  type AssessmentJson,
} from './infoAssessment.js';
import { ColorJsonSchema, CourseJsonSchema, type CourseJson } from './infoCourse.js';
import { CourseInstanceJsonSchema, type CourseInstanceJson } from './infoCourseInstance.js';
import { ElementCoreJsonSchema, type ElementCoreJson } from './infoElementCore.js';
import { ElementCourseJsonSchema, type ElementCourseJson } from './infoElementCourse.js';
import { ElementExtensionJsonSchema, type ElementExtensionJson } from './infoElementExtension.js';
import { NewsItemJsonSchema, type NewsItemJson } from './infoNewsItem.js';
import { QuestionJsonSchema, type QuestionJson } from './infoQuestion.js';
import {
  QuestionCalculationOptionsJsonSchema,
  type QuestionCalculationOptionsJson,
} from './questionOptionsCalculation.js';
import { QuestionCheckboxOptionsJsonSchema } from './questionOptionsCheckbox.js';
import type { QuestionCheckboxOptionsJson } from './questionOptionsCheckbox.js';
import {
  QuestionFileOptionsJsonSchema,
  type QuestionFileOptionsJson,
} from './questionOptionsFile.js';
import {
  QuestionMultipleChoiceOptionsJsonSchema,
  type QuestionMultipleChoiceOptionsJson,
} from './questionOptionsMultipleChoice.js';
import {
  QuestionMultipleTrueFalseOptionsJsonSchema,
  type QuestionMultipleTrueFalseOptionsJson,
} from './questionOptionsMultipleTrueFalse.js';
import { QuestionOptionsv3JsonSchema, type QuestionOptionsv3Json } from './questionOptionsv3.js';

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
    PointsListJsonSchema,
    PointsSingleJsonSchema,
    QuestionIdJsonSchema,
    ForceMaxPointsJsonSchema,
    AssessmentAccessRuleJsonSchema,
    QuestionAlternativeJsonSchema,
    ZoneAssessmentJsonSchema,
    ZoneQuestionJsonSchema,
    GroupRoleJsonSchema,
    AdvanceScorePercJsonSchema,
    CommentJsonSchema,
  },
}) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(CourseJsonSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { ColorJsonSchema, CommentJsonSchema },
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
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<ElementCoreJson>;

export const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseJsonSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<ElementCourseJson>;

export const infoElementExtension = prairielearnZodToJsonSchema(ElementExtensionJsonSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(QuestionJsonSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: {
    CommentJsonSchema,
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
