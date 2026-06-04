import { type JSONSchemaType } from 'ajv';
import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

import { AccessControlJsonSchema, DeadlineEntryJsonSchema } from './accessControl.js';
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
 * Replace `oldKey` with `newKey: newValue` in place, preserving the key's
 * original position so the rewritten object diffs minimally against the
 * previous output (which prettier renders one key per line).
 */
function replaceKeyInPlace(
  obj: Record<string, any>,
  oldKey: string,
  newKey: string,
  newValue: unknown,
) {
  const entries = Object.entries(obj).map(([k, v]): [string, unknown] =>
    k === oldKey ? [newKey, newValue] : [k, v],
  );
  for (const key of Object.keys(obj)) delete obj[key];
  Object.assign(obj, Object.fromEntries(entries));
}

// Keys whose *values* are maps from arbitrary names to subschemas. The keys of
// those maps are user-controlled names (which can collide with JSON Schema
// keywords, e.g. a property literally named `default`), so the keyword-level
// rewrites below must not be applied to them.
const PROPERTY_MAP_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  'definitions',
  '$defs',
  'dependentSchemas',
]);

/**
 * Walk a generated JSON Schema and undo the purely-syntactic differences that
 * Zod 4's `z.toJSONSchema` introduces relative to the previous
 * `zod-to-json-schema` (Zod 3) output. None of these rewrites change validation
 * semantics.
 *
 * TODO: The sole purpose of this pass is to keep the committed schema files
 * close to their pre-Zod-4 form so the migration diff stays small and
 * reviewable. Once the raw Zod 4 output is accepted as the new baseline, this
 * pass (and its callers) can be deleted.
 *
 * The rewrites:
 *
 *   - `{ allOf: [{ $ref }] }` -> `{ $ref }`. Zod 4 wraps a referenced schema in
 *     a single-element `allOf` whenever a modifier (`.optional()`,
 *     `.default()`, ...) sits on it, because draft-07 forbids sibling keywords
 *     next to `$ref`. The wrapper is inert here, so we hoist the `$ref` back up.
 *   - `{ anyOf: [{ type: 'X' }, { type: 'Y' }, ...] }` -> `{ type: ['X', 'Y'] }`.
 *     Zod 3 expressed unions of bare scalar types (including nullables, where
 *     one branch is `{ type: 'null' }`) with the compact array form.
 *   - Drop tautological constraints Zod 4 newly emits: a `type: 'string'` inside
 *     `propertyNames` (JSON object keys are always strings), `items: {}` (an
 *     empty schema allows anything, same as omitting `items`), and the JS
 *     safe-integer `minimum`/`maximum` bounds Zod 4 stamps onto every unbounded
 *     integer.
 *   - Key order: Zod 4 emits `minItems`, `maxItems`, and `default` *before* the
 *     structural keywords (e.g. `items`), whereas zod-to-json-schema emitted
 *     them *last* (e.g. `{ type, default, enum }` vs `{ type, enum, default }`).
 *     We move them back to the end so the keyword order — and therefore the
 *     line-by-line diff — matches. The `inPropertyMap` guard ensures we only
 *     reorder genuine keywords, never a property whose name happens to collide
 *     with one (e.g. a property literally named `default`).
 */
export function normalizeGeneratedJsonSchema(node: unknown, inPropertyMap = false): void {
  if (Array.isArray(node)) {
    for (const item of node) normalizeGeneratedJsonSchema(item);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const obj = node as Record<string, any>;

  // Inside a property map the keys are names, not keywords: skip the keyword
  // rewrites and recurse into each subschema value as a fresh schema node.
  if (inPropertyMap) {
    for (const value of Object.values(obj)) normalizeGeneratedJsonSchema(value);
    return;
  }

  // Collapse a union of bare scalar types into the compact `type: [...]` form.
  if (Array.isArray(obj.anyOf) && obj.anyOf.length >= 2 && obj.type === undefined) {
    const isBareType = (s: any): s is { type: string } =>
      s !== null &&
      typeof s === 'object' &&
      typeof s.type === 'string' &&
      Object.keys(s).length === 1;
    if (obj.anyOf.every(isBareType)) {
      replaceKeyInPlace(
        obj,
        'anyOf',
        'type',
        obj.anyOf.map((s: { type: string }) => s.type),
      );
    }
  }

  // Hoist a lone `allOf: [{ $ref }]` wrapper back to a sibling `$ref`.
  const allOf = obj.allOf;
  if (
    Array.isArray(allOf) &&
    allOf.length === 1 &&
    allOf[0] !== null &&
    typeof allOf[0] === 'object' &&
    typeof allOf[0].$ref === 'string' &&
    Object.keys(allOf[0]).length === 1 &&
    obj.$ref === undefined
  ) {
    replaceKeyInPlace(obj, 'allOf', '$ref', allOf[0].$ref);
  }

  // Drop tautological constraints Zod 4 emits but the previous output did not.
  // `propertyNames` always constrains object keys, which are strings by
  // definition, so a `type: 'string'` there is redundant whether it stands
  // alone or sits beside a real constraint (`enum`, `minLength`, ...).
  if (obj.propertyNames !== null && typeof obj.propertyNames === 'object') {
    if (Object.keys(obj.propertyNames).length === 1 && obj.propertyNames.type === 'string') {
      delete obj.propertyNames;
    } else if (obj.propertyNames.type === 'string') {
      delete obj.propertyNames.type;
    }
  }
  // `items: {}` allows anything, same as omitting `items`.
  if (
    obj.items !== null &&
    typeof obj.items === 'object' &&
    !Array.isArray(obj.items) &&
    Object.keys(obj.items).length === 0
  ) {
    delete obj.items;
  }

  // Zod 4 stamps every unbounded integer with the JS safe-integer range;
  // zod-to-json-schema left such bounds off. Strip only these sentinel values —
  // real `.min()` / `.max()` constraints use other numbers and are preserved.
  if (obj.minimum === -Number.MAX_SAFE_INTEGER) delete obj.minimum;
  if (obj.maximum === Number.MAX_SAFE_INTEGER) delete obj.maximum;

  // Key order: Zod 4 emits these keywords before the structural ones (e.g.
  // `items`), but zod-to-json-schema emitted them last. Re-insert each present
  // keyword so it trails, in the order the previous output used.
  for (const keyword of ['minItems', 'maxItems', 'default']) {
    if (keyword in obj) {
      const value = obj[keyword];
      delete obj[keyword];
      obj[keyword] = value;
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    normalizeGeneratedJsonSchema(value, PROPERTY_MAP_KEYWORDS.has(key));
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
  // includes every registered schema reachable from the root, in encounter
  // order. Rebuild the map from the explicit allow-list so each output carries
  // only the definitions it historically did, in a stable order (the previous
  // toolchain emitted definitions in the order they were listed) — this keeps
  // the diff minimal.
  if (jsonSchema.definitions) {
    const definitions = jsonSchema.definitions;
    jsonSchema.definitions = Object.fromEntries(
      definitionKeys.filter((key) => key in definitions).map((key) => [key, definitions[key]]),
    );
  }

  // Normalize first so `default` is moved to the end of each object, then
  // append `deprecated` — the previous toolchain emitted `{ ..., default,
  // deprecated }` in that order.
  normalizeGeneratedJsonSchema(jsonSchema);
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
