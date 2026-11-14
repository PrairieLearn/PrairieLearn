import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const plSetSymbolicInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'allow-complex': booleanFormat().optional(),
    'allow-trig-functions': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    'blank-value': z.string().optional(),
    'correct-answer': z.string().optional(),
    'custom-functions': z.string().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'display-log-as-ln': booleanFormat().optional(),
    'display-simplified-expression': booleanFormat().optional(),
    'formula-editor': booleanFormat().optional(),
    'imaginary-unit-for-display': z.enum(['i', 'j']).optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    suffix: z.string().optional(),
    syntax: z.enum(['tuple', 'interval']).optional(),
    variables: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-set-symbolic-input',
  schema: z.toJSONSchema(plSetSymbolicInputAttributesSchema, { target: 'draft-04' }),
};
