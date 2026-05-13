import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import { plFormats } from './formats.js';
import { plKeywords } from './keywords.js';
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
    keywords: Object.keys(plKeywords),
    formats: Object.keys(plFormats),
  };
}

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-multiple-choice',
    schema: elementSchemas['pl-multiple-choice'],
  },
];
