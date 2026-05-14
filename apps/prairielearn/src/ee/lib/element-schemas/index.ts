import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import { formats } from './ajv-extensions.js';
import {
  plAnswerJsonSchema,
  plMultipleChoiceJsonSchema,
  validators,
} from './pl-multiple-choice.js';

const elementSchemas = {
  'pl-answer': plAnswerJsonSchema(),
  'pl-multiple-choice': plMultipleChoiceJsonSchema(),
};

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
  keywords: string[];
  formats: string[];
} {
  return {
    schemas: elementSchemas,
    keywords: [],
    formats: Object.keys(formats),
  };
}

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-answer',
    schema: elementSchemas['pl-answer'],
  },
  {
    name: 'pl-multiple-choice',
    schema: elementSchemas['pl-multiple-choice'],
  },
];

export { formats, validators };
