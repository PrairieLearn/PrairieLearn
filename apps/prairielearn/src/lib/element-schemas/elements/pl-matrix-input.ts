import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plMatrixInputAttributesSchema = z
  .object({
    'allow-complex': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    atol: numberFormat().optional(),
    comparison: z.enum(['relabs', 'sigfig', 'decdig']).optional(),
    digits: integerFormat().optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    rtol: numberFormat().optional(),
    'show-help-text': booleanFormat().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-matrix-input',
  schema: z.toJSONSchema(plMatrixInputAttributesSchema, { target: 'draft-04' }),
};
