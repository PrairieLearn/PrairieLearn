import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plStringInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    'correct-answer': z.string().optional(),
    'correct-answer-format': z.enum(['exact', 'regex']).optional(),
    display: z.enum(['block', 'inline']).optional(),
    'escape-unicode': booleanFormat()
      .meta({
        deprecated: true,
        description: 'This attribute is ignored; Unicode escaping is always applied when needed.',
      })
      .optional(),
    'ignore-case': booleanFormat().optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    multiline: booleanFormat().optional(),
    'normalize-to-ascii': booleanFormat().optional(),
    placeholder: z.string().optional(),
    'remove-leading-trailing': booleanFormat().optional(),
    'remove-spaces': booleanFormat().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    suffix: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-string-input',
  schema: z.toJSONSchema(plStringInputAttributesSchema, { target: 'draft-04' }),
};
