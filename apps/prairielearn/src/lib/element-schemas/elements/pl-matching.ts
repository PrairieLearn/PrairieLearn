import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plMatchingStatementAttributesSchema = z
  .object({
    match: z.string(),
  })
  .strict();

const plMatchingOptionAttributesSchema = z
  .object({
    name: z.string().optional(),
  })
  .strict();

const plMatchingAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    blank: booleanFormat().optional(),
    'counter-type': z.enum(['decimal', 'lower-alpha', 'upper-alpha', 'full-text']).optional(),
    'fixed-options-order': booleanFormat().optional(),
    'fixed-order': booleanFormat().optional(),
    'hide-score-badge': booleanFormat().optional(),
    'none-of-the-above': booleanFormat().optional(),
    'number-options': integerFormat().optional(),
    'number-statements': integerFormat().optional(),
    'options-placement': z.enum(['right', 'bottom']).optional(),
    'partial-credit': booleanFormat().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-matching',
  schema: z.toJSONSchema(plMatchingAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-statement': {
      schema: z.toJSONSchema(plMatchingStatementAttributesSchema, { target: 'draft-04' }),
    },
    'pl-option': {
      schema: z.toJSONSchema(plMatchingOptionAttributesSchema, { target: 'draft-04' }),
    },
  },
};
