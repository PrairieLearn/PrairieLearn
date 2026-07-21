import { type JSONSchemaType } from 'ajv';
import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

import {
  AccessControlJsonSchema,
  EarlyDeadlineJsonSchema,
  LateDeadlineJsonSchema,
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

// Schemas referenced as named `$defs` in the generated JSON Schema must be
// registered with an `id` so `z.toJSONSchema` extracts them rather than
// inlining. Multiple roots can share the same registered subschemas.
const namedDefinitions = {
  CommentJsonSchema,
  DatetimeLocalStringSchema,
  AccessControlJsonSchema,
  EarlyDeadlineJsonSchema,
  LateDeadlineJsonSchema,
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

function prairielearnZodToJsonSchema(schema: z.ZodType): Record<string, any> {
  return z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    unrepresentable: 'any',
    reused: 'inline',
  });
}

export const infoAssessment = prairielearnZodToJsonSchema(
  AssessmentJsonSchema,
) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(
  CourseJsonSchema,
) as JSONSchemaType<CourseJson>;

export const infoCourseInstance = prairielearnZodToJsonSchema(
  CourseInstanceJsonSchema,
) as JSONSchemaType<CourseInstanceJson>;

const infoElementCore = prairielearnZodToJsonSchema(
  ElementCoreJsonSchema,
) as JSONSchemaType<ElementCoreJson>;

const infoElementCourse = prairielearnZodToJsonSchema(
  ElementCourseJsonSchema,
) as JSONSchemaType<ElementCourseJson>;

const infoElementExtension = prairielearnZodToJsonSchema(
  ElementExtensionJsonSchema,
) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(
  QuestionJsonSchema,
) as JSONSchemaType<QuestionJson>;

const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionOptionsCalculationJsonSchema,
) as JSONSchemaType<QuestionOptionsCalculationJson>;

const questionOptionsCheckbox = prairielearnZodToJsonSchema(
  QuestionOptionsCheckboxJsonSchema,
) as JSONSchemaType<QuestionOptionsCheckboxJson>;

const questionOptionsFile = prairielearnZodToJsonSchema(
  QuestionOptionsFileJsonSchema,
) as JSONSchemaType<QuestionOptionsFileJson>;

const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleChoiceJsonSchema,
) as JSONSchemaType<QuestionOptionsMultipleChoiceJson>;

const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionOptionsMultipleTrueFalseJsonSchema,
) as JSONSchemaType<QuestionOptionsMultipleTrueFalseJson>;

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
};
