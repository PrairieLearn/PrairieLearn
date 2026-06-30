import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plBigOInputAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    'blank-value': z.string().optional(),
    'correct-answer': z.string().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'initial-value': z.string().optional(),
    placeholder: z.string().optional(),
    'show-help-text': booleanFormat().optional(),
    'show-score': booleanFormat().optional(),
    size: integerFormat().optional(),
    type: z.enum(['big-o', 'theta', 'omega', 'little-o', 'little-omega']).optional(),
    variable: z
      .string()
      .meta({ deprecated: true, description: 'Use the "variables" attribute instead.' })
      .optional(),
    variables: z.string().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-big-o-input',
  schema: z.toJSONSchema(plBigOInputAttributesSchema, { target: 'draft-04' }),
};
