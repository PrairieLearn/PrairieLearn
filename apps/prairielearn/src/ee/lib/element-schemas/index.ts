import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import { formats, keywords } from './ajv-extensions.js';
import { plMultipleChoiceJsonSchema } from './pl-multiple-choice.js';

const elementSchemas = {
  'pl-multiple-choice': plMultipleChoiceJsonSchema(),
};

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
  keywords: string[];
  formats: string[];
} {
  return {
    schemas: elementSchemas,
    keywords: Object.keys(keywords),
    formats: Object.keys(formats),
  };
}

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-multiple-choice',
    schema: elementSchemas['pl-multiple-choice'],
  },
];
