import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plNumberInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'allow-complex': booleanFormat().optional(),
    'allow-fractions': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    atol: numberFormat().optional(),
    'blank-value': z.string().optional(),
    comparison: z.enum(['relabs', 'sigfig', 'decdig']).optional(),
    'correct-answer': z.union([numberFormat(), z.literal('')]).optional(),
    'custom-format': z.string().optional(),
    digits: integerFormat().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    rtol: numberFormat().optional(),
    'show-correct-answer': booleanFormat().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-placeholder': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    suffix: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-number-input',
  schema: z.toJSONSchema(plNumberInputAttributesSchema, { target: 'draft-04' }),
};
