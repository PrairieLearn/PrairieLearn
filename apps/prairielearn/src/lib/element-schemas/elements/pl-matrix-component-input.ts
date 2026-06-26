import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plMatrixComponentInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'allow-feedback': booleanFormat().optional(),
    'allow-fractions': booleanFormat().optional(),
    'allow-partial-credit': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    atol: numberFormat().optional(),
    'blank-value': z.string().optional(),
    columns: integerFormat().optional(),
    comparison: z.enum(['relabs', 'sigfig', 'decdig']).optional(),
    digits: integerFormat().optional(),
    label: z.string().optional(),
    rows: integerFormat().optional(),
    rtol: numberFormat().optional(),
    suffix: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-matrix-component-input',
  schema: z.toJSONSchema(plMatrixComponentInputAttributesSchema, { target: 'draft-04' }),
};
