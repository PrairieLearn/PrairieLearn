import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const partialCreditAttribute = () =>
  z.union([
    booleanFormat().meta({
      deprecated: true,
      description: 'Use partial-credit="off|coverage|each-answer|net-correct" instead.',
    }),
    z.enum(['off', 'coverage', 'each-answer', 'net-correct']),
  ]);

const plCheckboxAnswerAttributesSchema = z
  .object({
    correct: booleanFormat().optional(),
    feedback: z.string().optional(),
  })
  .strict();

const plCheckboxAttributesSchema = z
  .object({
    'answers-name': z.string(),
    'detailed-help-text': booleanFormat().optional(),
    display: z.enum(['block', 'inline']).optional(),
    'fixed-order': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "order" attribute instead.' })
      .optional(),
    'hide-answer-panel': booleanFormat().optional(),
    'hide-help-text': booleanFormat().optional(),
    'hide-letter-keys': booleanFormat().optional(),
    'hide-score-badge': booleanFormat().optional(),
    inline: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "display" attribute instead.' })
      .optional(),
    'max-correct': integerFormat().optional(),
    'max-select': integerFormat().optional(),
    'min-correct': integerFormat().optional(),
    'min-select': integerFormat().optional(),
    'number-answers': integerFormat().optional(),
    order: z.enum(['random', 'fixed']).optional(),
    'partial-credit': partialCreditAttribute().optional(),
    'partial-credit-method': z
      .enum(['COV', 'EDC', 'PC'])
      .meta({
        deprecated: true,
        description: 'Use partial-credit="coverage|each-answer|net-correct" instead.',
      })
      .optional(),
    'show-number-correct': booleanFormat().optional(),
    weight: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-checkbox',
  schema: z.toJSONSchema(plCheckboxAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-answer': {
      schema: z.toJSONSchema(plCheckboxAnswerAttributesSchema, { target: 'draft-04' }),
    },
  },
};
