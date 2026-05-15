import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import {
  plMultipleChoiceAnswerJsonSchema,
  plMultipleChoiceJsonSchema,
} from './pl-multiple-choice.js';
import {
  plOrderBlocksAnswerJsonSchema,
  plOrderBlocksBlockGroupJsonSchema,
  plOrderBlocksJsonSchema,
} from './pl-order-blocks.js';

interface ChildSchema {
  schema: Record<string, unknown>;
  children?: Record<string, ChildSchema>;
}

const elementSchemas = {
  'pl-multiple-choice': plMultipleChoiceJsonSchema(),
  'pl-order-blocks': plOrderBlocksJsonSchema(),
};

const plOrderBlocksAnswerSchema = plOrderBlocksAnswerJsonSchema();

const elementChildSchemas = {
  'pl-multiple-choice': {
    'pl-answer': {
      schema: plMultipleChoiceAnswerJsonSchema(),
    },
  },
  'pl-order-blocks': {
    'pl-answer': {
      schema: plOrderBlocksAnswerSchema,
    },
    'pl-block-group': {
      schema: plOrderBlocksBlockGroupJsonSchema(),
      children: {
        'pl-answer': {
          schema: plOrderBlocksAnswerSchema,
        },
      },
    },
  },
} satisfies Record<string, Record<string, ChildSchema>>;

function serializeChildSchemas(
  childSchemas: Record<string, ChildSchema>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(childSchemas).map(([name, childSchema]) => [name, childSchema.schema]),
  );
}

function childSchemasToCustomTags(childSchemas: Record<string, ChildSchema>): CustomTag[] {
  return Object.entries(childSchemas).map(([name, childSchema]) => ({
    name,
    schema: childSchema.schema,
    ...(childSchema.children ? { children: childSchemasToCustomTags(childSchema.children) } : {}),
  }));
}

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
  childSchemas: Record<string, Record<string, Record<string, unknown>>>;
} {
  return {
    schemas: elementSchemas,
    childSchemas: Object.fromEntries(
      (Object.keys(elementChildSchemas) as (keyof typeof elementChildSchemas)[]).map((name) => [
        name,
        serializeChildSchemas(elementChildSchemas[name]),
      ]),
    ),
  };
}

export const elementCustomTags: CustomTag[] = (
  Object.keys(elementSchemas) as (keyof typeof elementSchemas)[]
).map((name) => ({
  name,
  schema: elementSchemas[name],
  children: childSchemasToCustomTags(elementChildSchemas[name]),
}));
