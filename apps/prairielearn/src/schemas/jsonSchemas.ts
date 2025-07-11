import { type JSONSchemaType } from 'ajv';
import { type ZodType } from 'zod';
import * as z from 'zod';

import { type AssessmentJson, AssessmentJsonSchema } from './infoAssessment.js';
import { type CourseJson, CourseJsonSchema } from './infoCourse.js';
import { type CourseInstanceJson, CourseInstanceJsonSchema } from './infoCourseInstance.js';
import { type ElementCoreJson, ElementCoreJsonSchema } from './infoElementCore.js';
import { type ElementCourseJson, ElementCourseJsonSchema } from './infoElementCourse.js';
import { type ElementExtensionJson, ElementExtensionJsonSchema } from './infoElementExtension.js';
import { type NewsItemJson, NewsItemJsonSchema } from './infoNewsItem.js';
import { type QuestionJson, QuestionJsonSchema } from './infoQuestion.js';
import {
  type QuestionCalculationOptionsJson,
  QuestionCalculationOptionsJsonSchema,
} from './questionOptionsCalculation.js';
import { QuestionCheckboxOptionsJsonSchema } from './questionOptionsCheckbox.js';
import type { QuestionCheckboxOptionsJson } from './questionOptionsCheckbox.js';
import {
  type QuestionFileOptionsJson,
  QuestionFileOptionsJsonSchema,
} from './questionOptionsFile.js';
import {
  type QuestionMultipleChoiceOptionsJson,
  QuestionMultipleChoiceOptionsJsonSchema,
} from './questionOptionsMultipleChoice.js';
import {
  type QuestionMultipleTrueFalseOptionsJson,
  QuestionMultipleTrueFalseOptionsJsonSchema,
} from './questionOptionsMultipleTrueFalse.js';
import { type QuestionOptionsv3Json, QuestionOptionsv3JsonSchema } from './questionOptionsv3.js';

/**
 * Rewrite the group role annotation for canView and canSubmit fields.
 * The new Zod v4 toJSONSchema doesn't support a concept of unique items in an array (only sets),
 * so we need to override the schema.
 */
const rewriteGroupRoleAnnotation = (ctx: any) => {
  // Get the current path from the schema context
  const currentPath = ctx.path || [];
  const segment = currentPath[currentPath.length - 1];

  if (['canView', 'canSubmit'].includes(segment)) {
    const action = segment === 'canView' ? 'view' : 'submit';
    const inZone = currentPath.includes('ZoneAssessmentJsonSchema');
    let annotation = `A list of group role names matching those in groupRoles that can ${action} the question. Only applicable for group assessments.`;
    if (inZone) {
      annotation = `A list of group role names that can ${action} questions in this zone. Only applicable for group assessments.`;
    }

    // Modify the JSON schema directly
    ctx.jsonSchema.description = annotation;
    ctx.jsonSchema.type = 'array';
    ctx.jsonSchema.items = {
      type: 'string',
    };
    ctx.jsonSchema.uniqueItems = true;
    ctx.jsonSchema.default = [];
  }
};

const prairielearnZodToJsonSchema = (schema: ZodType<any>, options: { name?: string } = {}) => {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-7',
    override: rewriteGroupRoleAnnotation,
    unrepresentable: 'throw',
    cycles: 'throw',
    reused: 'inline',
    io: 'input', // Use the input type for the schema
  });

  // Set the title if name is provided
  if (options.name && typeof jsonSchema === 'object' && jsonSchema !== null) {
    (jsonSchema as any).title = options.name;
  }

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

export const infoNewsItem = prairielearnZodToJsonSchema(NewsItemJsonSchema, {
  name: 'News Item Info',
}) as JSONSchemaType<NewsItemJson>;

export const infoAssessment = prairielearnZodToJsonSchema(AssessmentJsonSchema, {
  name: 'Assessment info',
}) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(CourseJsonSchema, {
  name: 'Course information',
}) as JSONSchemaType<CourseJson>;

export const infoCourseInstance = prairielearnZodToJsonSchema(CourseInstanceJsonSchema, {
  name: 'Course instance information',
}) as JSONSchemaType<CourseInstanceJson>;

export const infoElementCore = prairielearnZodToJsonSchema(ElementCoreJsonSchema, {
  name: 'Element Info',
}) as JSONSchemaType<ElementCoreJson>;

export const infoElementCourse = prairielearnZodToJsonSchema(ElementCourseJsonSchema, {
  name: 'Element Info',
}) as JSONSchemaType<ElementCourseJson>;

export const infoElementExtension = prairielearnZodToJsonSchema(ElementExtensionJsonSchema, {
  name: 'Element Extension Info',
}) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(QuestionJsonSchema, {
  name: 'Question Info',
}) as JSONSchemaType<QuestionJson>;

export const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionCalculationOptionsJsonSchema,
  {
    name: 'Calculation question options',
  },
) as JSONSchemaType<QuestionCalculationOptionsJson>;

export const questionOptionsCheckbox = prairielearnZodToJsonSchema(
  QuestionCheckboxOptionsJsonSchema,
  {
    name: 'Checkbox question options',
  },
) as JSONSchemaType<QuestionCheckboxOptionsJson>;

export const questionOptionsFile = prairielearnZodToJsonSchema(QuestionFileOptionsJsonSchema, {
  name: 'File question options',
}) as JSONSchemaType<QuestionFileOptionsJson>;

export const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionMultipleChoiceOptionsJsonSchema,
  {
    name: 'MultipleChoice question options',
  },
) as JSONSchemaType<QuestionMultipleChoiceOptionsJson>;

export const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionMultipleTrueFalseOptionsJsonSchema,
  {
    name: 'MultipleTrueFalse question options',
  },
) as JSONSchemaType<QuestionMultipleTrueFalseOptionsJson>;

export const questionOptionsv3 = prairielearnZodToJsonSchema(QuestionOptionsv3JsonSchema, {
  name: 'v3 question options',
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
