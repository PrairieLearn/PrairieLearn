import type { CustomTag } from '@reteps/tree-sitter-htmlmustache/linter';

import { plMultipleChoiceJsonSchema } from './pl-multiple-choice.js';

export const elementCustomTags: CustomTag[] = [
  {
    name: 'pl-multiple-choice',
    schema: plMultipleChoiceJsonSchema(),
  },
];
