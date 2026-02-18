import { type JSONSchemaType } from 'ajv';
import { type ZodType, type ZodTypeDef } from 'zod';
import {
  type JsonSchema7Type,
  type Options,
  type Refs,
  ignoreOverride,
  zodToJsonSchema,
} from 'zod-to-json-schema';

import { CommentJsonSchema } from './comment.js';
import {
  AdvanceScorePercJsonSchema,
  AssessmentAccessRuleJsonSchema,
  type AssessmentJson,
  AssessmentJsonSchema,
  ForceMaxPointsJsonSchema,
  GroupsRoleJsonSchema,
  LegacyGroupRoleJsonSchema,
  PointsJsonSchema,
  PointsListJsonSchema,
  PointsSingleJsonSchema,
  QuestionAlternativeJsonSchema,
  QuestionIdJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionBlockJsonSchema,
} from './infoAssessment.js';
import { ColorJsonSchema, type CourseJson, CourseJsonSchema } from './infoCourse.js';
import { type CourseInstanceJson, CourseInstanceJsonSchema } from './infoCourseInstance.js';
import { type ElementCoreJson, ElementCoreJsonSchema } from './infoElementCore.js';
import { type ElementCourseJson, ElementCourseJsonSchema } from './infoElementCourse.js';
import { type ElementExtensionJson, ElementExtensionJsonSchema } from './infoElementExtension.js';
import { type QuestionJson, QuestionJsonSchema } from './infoQuestion.js';
import {
  type QuestionOptionsCalculationJson,
  QuestionOptionsCalculationJsonSchema,
} from './questionOptionsCalculation.js';
import {
  type QuestionOptionsCheckboxJson,
  QuestionOptionsCheckboxJsonSchema,
} from './questionOptionsCheckbox.js';
import {
  type QuestionOptionsFileJson,
  QuestionOptionsFileJsonSchema,
} from './questionOptionsFile.js';
import {
  type QuestionOptionsMultipleChoiceJson,
  QuestionOptionsMultipleChoiceJsonSchema,
} from './questionOptionsMultipleChoice.js';
import {
  type QuestionOptionsMultipleTrueFalseJson,
  QuestionOptionsMultipleTrueFalseJsonSchema,
} from './questionOptionsMultipleTrueFalse.js';
import { type QuestionOptionsv3Json, QuestionOptionsv3JsonSchema } from './questionOptionsv3.js';

/**
 * Override certain fields in the JSON schema.
 * zod-to-json-schema doesn't support a concept of unique items in an array (only sets),
 * so we need to override the schema for canView, canSubmit, and roles fields.
 */
const schemaOverride = (
  def: ZodTypeDef,
  refs: Refs,
): JsonSchema7Type | undefined | typeof ignoreOverride => {
  const segment = refs.currentPath[refs.currentPath.length - 1];
  if (['canView', 'canSubmit'].includes(segment)) {
    const action = segment === 'canView' ? 'view' : 'submit';
    const inZone = refs.currentPath.includes('ZoneAssessmentJsonSchema');
    const inQuestion = refs.currentPath.includes('ZoneQuestionBlockJsonSchema');
    const inGroups = refs.currentPath.includes('groups');

    // Skip fields inside groups.rolePermissions - let default handle them
    if (inGroups) {
      return ignoreOverride;
    }

    // Question level
    if (inQuestion) {
      return {
        description: `A list of group role names that can ${action} the question. Only applicable for group assessments.`,
        type: 'array',
        items: {
          type: 'string',
        },
        uniqueItems: true,
        default: [],
      };
    }

    // Zone level
    if (inZone) {
      return {
        description: `A list of group role names that can ${action} questions in this zone. Only applicable for group assessments.`,
        type: 'array',
        items: {
          type: 'string',
        },
        uniqueItems: true,
        default: [],
      };
    }

    // Assessment level (deprecated legacy group properties)
    // Note: `deprecated: true` is added automatically by the traverse function below
    // because the description contains "DEPRECATED"
    return {
      description: `A list of group role names that can ${action} questions. Only applicable for group assessments. DEPRECATED -- prefer using the "groups" property instead.`,
      type: 'array',
      items: {
        type: 'string',
      },
      uniqueItems: true,
      default: [],
    };
  }

  // Add uniqueItems to the roles array in groups
  if (segment === 'roles' && refs.currentPath.includes('groups')) {
    return {
      description: 'Array of custom user roles in a group.',
      type: 'array',
      items: {
        $ref: '#/definitions/GroupsRoleJsonSchema',
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
  const jsonSchema = zodToJsonSchema(schema, {
    ...options,
    override: schemaOverride,
    // Many people have done insane things in their JSON files that don't pass
    // strict validation. For now, we'll be lenient and avoid the use of `.strict()`
    // in our Zod schemas in places where that could cause problems. In the
    // long run, we'll work towards getting all JSON compliant with strict schemas.
    removeAdditionalStrategy: 'strict',
  });

  // Traverse the schema: if `DEPRECATED` in the description, add a `deprecated`: true field.

  const traverse = (input: any) => {
    if (
      typeof input?.description === 'string' &&
      input?.description.toLowerCase().includes('deprecated')
    ) {
      input.deprecated = true;
    }
    for (const value of Object.values(input)) {
      if (typeof value === 'object' && value !== null) {
        traverse(value);
      }
    }
  };
  traverse(jsonSchema);

  return jsonSchema;
};

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
    ZoneQuestionBlockJsonSchema,
    LegacyGroupRoleJsonSchema,
    GroupsRoleJsonSchema,
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
  definitions: { ColorJsonSchema, CommentJsonSchema },
}) as JSONSchemaType<CourseInstanceJson>;

const infoElementCore = prairielearnZodToJsonSchema(ElementCoreJsonSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<ElementCoreJson>;

const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseJsonSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<ElementCourseJson>;

const infoElementExtension = prairielearnZodToJsonSchema(ElementExtensionJsonSchema, {
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

const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionOptionsCalculationJsonSchema,
  {
    name: 'Calculation question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionOptionsCalculationJson>;

const questionOptionsCheckbox = prairielearnZodToJsonSchema(QuestionOptionsCheckboxJsonSchema, {
  name: 'Checkbox question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<QuestionOptionsCheckboxJson>;

const questionOptionsFile = prairielearnZodToJsonSchema(QuestionOptionsFileJsonSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<QuestionOptionsFileJson>;

const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleChoiceJsonSchema,
  {
    name: 'MultipleChoice question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionOptionsMultipleChoiceJson>;

const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleTrueFalseJsonSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema7',
    definitions: { CommentJsonSchema },
  },
) as JSONSchemaType<QuestionOptionsMultipleTrueFalseJson>;

const questionOptionsv3 = prairielearnZodToJsonSchema(QuestionOptionsv3JsonSchema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema7',
  definitions: { CommentJsonSchema },
}) as JSONSchemaType<QuestionOptionsv3Json>;

export const ajvSchemas = {
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
