import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plIntegerInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    base: integerFormat().optional(),
    'blank-value': z.string().optional(),
    'correct-answer': z.string().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    suffix: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-integer-input',
  schema: z.toJSONSchema(plIntegerInputAttributesSchema, { target: 'draft-04' }),
};
