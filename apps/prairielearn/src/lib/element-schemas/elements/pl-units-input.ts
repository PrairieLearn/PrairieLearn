import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plUnitsInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'allow-feedback': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    atol: z.string().optional(),
    'blank-value': z.string().optional(),
    comparison: z.enum(['relabs', 'sigfig', 'exact', 'decdig']).optional(),
    'correct-answer': z.string().optional(),
    'custom-format': z.string().optional(),
    digits: integerFormat().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'grading-mode': z.enum(['with-units', 'exact-units', 'only-units']).optional(),
    'initial-value': z.string().optional(),
    label: z.string().optional(),
    'magnitude-partial-credit': numberFormat().optional(),
    placeholder: z.string().optional(),
    rtol: numberFormat().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    suffix: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-units-input',
  schema: z.toJSONSchema(plUnitsInputAttributesSchema, { target: 'draft-04' }),
};
