import { type JSONSchemaType } from 'ajv';
import { z } from 'zod';

import {
  AccessControlJsonSchema,
  DatetimeLocalStringSchema,
  DeadlineEntryJsonSchema,
} from './accessControl.js';
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
  QuestionPreferencesJsonSchema,
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

// Schemas referenced as named `$defs` in the generated JSON Schema must be
// registered with an `id` so `z.toJSONSchema` extracts them rather than
// inlining. Multiple roots can share the same registered subschemas.
const namedDefinitions = {
  CommentJsonSchema,
  DatetimeLocalStringSchema,
  AccessControlJsonSchema,
  DeadlineEntryJsonSchema,
  ColorJsonSchema,
  PointsJsonSchema,
  PointsListJsonSchema,
  PointsSingleJsonSchema,
  QuestionIdJsonSchema,
  ForceMaxPointsJsonSchema,
  AssessmentAccessRuleJsonSchema,
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionBlockJsonSchema,
  QuestionPreferencesJsonSchema,
  LegacyGroupRoleJsonSchema,
  GroupsRoleJsonSchema,
  AdvanceScorePercJsonSchema,
};

for (const [id, schema] of Object.entries(namedDefinitions)) {
  // `.meta()` returns a *new* registered instance and leaves the original
  // (the one embedded in the parent schemas) unregistered, so register the
  // existing instance directly. Merge with any current metadata to preserve
  // descriptions etc.
  z.globalRegistry.add(schema, { ...z.globalRegistry.get(schema), id });
}

/**
 * Mutate the JSON Schema for canView / canSubmit / roles fields to include
 * `uniqueItems`, which Zod cannot express directly on an array schema.
 */
function applyUniqueItemsOverride(ctx: {
  zodSchema: z.core.$ZodTypes;
  jsonSchema: Record<string, any>;
  path: (string | number)[];
}) {
  const segment = ctx.path[ctx.path.length - 1];
  const path = ctx.path;

  if (segment === 'canView' || segment === 'canSubmit') {
    const action = segment === 'canView' ? 'view' : 'submit';
    const inQuestion = path.includes('ZoneQuestionBlockJsonSchema') || path.includes('questions');
    const inZone =
      path.includes('ZoneAssessmentJsonSchema') || (path.includes('zones') && !inQuestion);
    const inGroups = path.includes('groups');

    if (inGroups) return;

    const replacement: Record<string, any> = {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      default: [],
    };

    if (inQuestion) {
      replacement.description = `A list of group role names that can ${action} the question. Only applicable for group assessments.`;
    } else if (inZone) {
      replacement.description = `A list of group role names that can ${action} questions in this zone. Only applicable for group assessments.`;
    } else {
      replacement.description = `A list of group role names that can ${action} questions. Only applicable for group assessments. DEPRECATED -- prefer using the "groups" property instead.`;
    }

    for (const key of Object.keys(ctx.jsonSchema)) delete ctx.jsonSchema[key];
    Object.assign(ctx.jsonSchema, replacement);
    return;
  }

  if (segment === 'roles' && path.includes('groups')) {
    // Keep the inline items schema that v4 already emitted and just add the
    // uniqueItems constraint Zod cannot express directly.
    ctx.jsonSchema.uniqueItems = true;
  }
}

/**
 * Walk the generated schema and add `deprecated: true` wherever a description
 * mentions "DEPRECATED". Matches the prior `prairielearnZodToJsonSchema`
 * behavior so existing IDE deprecation hints survive the v4 swap.
 */
function annotateDeprecated(input: any) {
  if (
    input !== null &&
    typeof input === 'object' &&
    typeof input.description === 'string' &&
    input.description.toLowerCase().includes('deprecated')
  ) {
    input.deprecated = true;
  }
  if (input !== null && typeof input === 'object') {
    for (const value of Object.values(input)) {
      if (typeof value === 'object' && value !== null) annotateDeprecated(value);
    }
  }
}

function prairielearnZodToJsonSchema(
  schema: z.ZodType,
  title: string,
  definitionKeys: readonly (keyof typeof namedDefinitions)[],
): Record<string, any> {
  const jsonSchema: any = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    unrepresentable: 'any',
    reused: 'inline',
    override: applyUniqueItemsOverride,
  });

  jsonSchema.title = title;

  // `z.toJSONSchema` with `target: 'draft-07'` emits `definitions`, but it
  // includes every registered schema reachable from the root. Restrict to the
  // explicit allow-list so each output only carries the definitions it
  // historically did.
  if (jsonSchema.definitions) {
    const allowed = new Set<string>(definitionKeys as readonly string[]);
    for (const key of Object.keys(jsonSchema.definitions)) {
      if (!allowed.has(key)) delete jsonSchema.definitions[key];
    }
  }

  annotateDeprecated(jsonSchema);

  return jsonSchema;
}

export const infoAssessment = prairielearnZodToJsonSchema(AssessmentJsonSchema, 'Assessment info', [
  'PointsJsonSchema',
  'PointsListJsonSchema',
  'PointsSingleJsonSchema',
  'QuestionIdJsonSchema',
  'ForceMaxPointsJsonSchema',
  'AssessmentAccessRuleJsonSchema',
  'QuestionAlternativeJsonSchema',
  'ZoneAssessmentJsonSchema',
  'ZoneQuestionBlockJsonSchema',
  'QuestionPreferencesJsonSchema',
  'LegacyGroupRoleJsonSchema',
  'GroupsRoleJsonSchema',
  'AdvanceScorePercJsonSchema',
  'CommentJsonSchema',
  'DatetimeLocalStringSchema',
  'AccessControlJsonSchema',
  'DeadlineEntryJsonSchema',
]) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(CourseJsonSchema, 'Course information', [
  'ColorJsonSchema',
  'CommentJsonSchema',
]) as JSONSchemaType<CourseJson>;

export const infoCourseInstance = prairielearnZodToJsonSchema(
  CourseInstanceJsonSchema,
  'Course instance information',
  ['ColorJsonSchema', 'CommentJsonSchema'],
) as JSONSchemaType<CourseInstanceJson>;

const infoElementCore = prairielearnZodToJsonSchema(ElementCoreJsonSchema, 'Element Info', [
  'CommentJsonSchema',
]) as JSONSchemaType<ElementCoreJson>;

const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseJsonSchema, 'Element Info', [
  'CommentJsonSchema',
]) as JSONSchemaType<ElementCourseJson>;

const infoElementExtension = prairielearnZodToJsonSchema(
  ElementExtensionJsonSchema,
  'Element Extension Info',
  ['CommentJsonSchema'],
) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(QuestionJsonSchema, 'Question Info', [
  'CommentJsonSchema',
]) as JSONSchemaType<QuestionJson>;

const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionOptionsCalculationJsonSchema,
  'Calculation question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsCalculationJson>;

const questionOptionsCheckbox = prairielearnZodToJsonSchema(
  QuestionOptionsCheckboxJsonSchema,
  'Checkbox question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsCheckboxJson>;

const questionOptionsFile = prairielearnZodToJsonSchema(
  QuestionOptionsFileJsonSchema,
  'File question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsFileJson>;

const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleChoiceJsonSchema,
  'MultipleChoice question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsMultipleChoiceJson>;

const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleTrueFalseJsonSchema,
  'MultipleTrueFalse question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsMultipleTrueFalseJson>;

const questionOptionsv3 = prairielearnZodToJsonSchema(
  QuestionOptionsv3JsonSchema,
  'v3 question options',
  ['CommentJsonSchema'],
) as JSONSchemaType<QuestionOptionsv3Json>;

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
