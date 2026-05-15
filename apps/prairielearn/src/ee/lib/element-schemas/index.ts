import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import { formats } from './htmlmustache-plugin-utils.js';
import { plMultipleChoiceJsonSchema } from './pl-multiple-choice.js';
import { validators } from './pl-multiple-choice.validator.js';

const elementSchemas = {
  'pl-multiple-choice': plMultipleChoiceJsonSchema(),
};

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
} {
  return {
    schemas: elementSchemas,
  };
}

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-multiple-choice',
    schema: elementSchemas['pl-multiple-choice'],
  },
];

export { formats, validators };
