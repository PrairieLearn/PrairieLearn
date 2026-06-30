import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plDropdownAnswerAttributesSchema = z
  .object({
    correct: booleanFormat().optional(),
  })
  .strict();

const plDropdownAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    blank: booleanFormat().optional(),
    sort: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-dropdown',
  schema: z.toJSONSchema(plDropdownAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-answer': {
      schema: z.toJSONSchema(plDropdownAnswerAttributesSchema, { target: 'draft-04' }),
    },
  },
};
