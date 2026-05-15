import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import {
  plMultipleChoiceAnswerJsonSchema,
  plMultipleChoiceJsonSchema,
} from './pl-multiple-choice.js';

const elementSchemas = {
  'pl-multiple-choice': plMultipleChoiceJsonSchema(),
};

const elementChildSchemas = {
  'pl-multiple-choice': {
    'pl-answer': plMultipleChoiceAnswerJsonSchema(),
  },
};

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
  childSchemas: Record<string, Record<string, Record<string, unknown>>>;
} {
  return {
    schemas: elementSchemas,
    childSchemas: elementChildSchemas,
  };
}

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-multiple-choice',
    schema: elementSchemas['pl-multiple-choice'],
    children: [
      {
        name: 'pl-answer',
        schema: elementChildSchemas['pl-multiple-choice']['pl-answer'],
      },
    ],
  },
];
