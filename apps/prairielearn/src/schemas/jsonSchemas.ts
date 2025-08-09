import { type JSONSchemaType } from 'ajv';
import { type ZodType, z } from 'zod/v4';

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
import {
  type QuestionCheckboxOptionsJson,
  QuestionCheckboxOptionsJsonSchema,
} from './questionOptionsCheckbox.js';
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

export const prairielearnZodToJsonSchema = (schema: ZodType<any>) => {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-7',
    unrepresentable: 'throw',
    cycles: 'throw',
    reused: 'inline',
    io: 'input',
    override(ctx) {
      // https://github.com/colinhacks/zod/issues/5078#issuecomment-3170435125
      if ('id' in ctx.jsonSchema) {
        ctx.jsonSchema.id = undefined;
      }
    },
  });

  return jsonSchema;
};

export const infoNewsItem = prairielearnZodToJsonSchema(
  NewsItemJsonSchema,
) as JSONSchemaType<NewsItemJson>;

export const infoAssessment = prairielearnZodToJsonSchema(
  AssessmentJsonSchema,
) as JSONSchemaType<AssessmentJson>;

export const infoCourse = prairielearnZodToJsonSchema(
  CourseJsonSchema,
) as JSONSchemaType<CourseJson>;

export const infoCourseInstance = prairielearnZodToJsonSchema(
  CourseInstanceJsonSchema,
) as JSONSchemaType<CourseInstanceJson>;

export const infoElementCore = prairielearnZodToJsonSchema(
  ElementCoreJsonSchema,
) as JSONSchemaType<ElementCoreJson>;

export const infoElementCourse = prairielearnZodToJsonSchema(
  ElementCourseJsonSchema,
) as JSONSchemaType<ElementCourseJson>;

export const infoElementExtension = prairielearnZodToJsonSchema(
  ElementExtensionJsonSchema,
) as JSONSchemaType<ElementExtensionJson>;

export const infoQuestion = prairielearnZodToJsonSchema(
  QuestionJsonSchema,
) as JSONSchemaType<QuestionJson>;

export const questionOptionsCalculation = prairielearnZodToJsonSchema(
  QuestionCalculationOptionsJsonSchema,
) as JSONSchemaType<QuestionCalculationOptionsJson>;

export const questionOptionsCheckbox = prairielearnZodToJsonSchema(
  QuestionCheckboxOptionsJsonSchema,
) as JSONSchemaType<QuestionCheckboxOptionsJson>;

export const questionOptionsFile = prairielearnZodToJsonSchema(
  QuestionFileOptionsJsonSchema,
) as JSONSchemaType<QuestionFileOptionsJson>;

export const questionOptionsMultipleChoice = prairielearnZodToJsonSchema(
  QuestionMultipleChoiceOptionsJsonSchema,
) as JSONSchemaType<QuestionMultipleChoiceOptionsJson>;

export const questionOptionsMultipleTrueFalse = prairielearnZodToJsonSchema(
  QuestionMultipleTrueFalseOptionsJsonSchema,
) as JSONSchemaType<QuestionMultipleTrueFalseOptionsJson>;

export const questionOptionsv3 = prairielearnZodToJsonSchema(
  QuestionOptionsv3JsonSchema,
) as JSONSchemaType<QuestionOptionsv3Json>;

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
