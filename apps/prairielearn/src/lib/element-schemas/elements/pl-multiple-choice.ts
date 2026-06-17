import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.js';

const aotaNotaAttribute = () =>
  z.union([booleanFormat(), z.enum(['false', 'random', 'correct', 'incorrect'])]);

const plMultipleChoiceAnswerAttributesSchema = z
  .object({
    correct: booleanFormat().optional(),
    feedback: z.string().optional(),
    score: numberFormat().optional(),
  })
  .strict();

const plMultipleChoiceAttributesSchema = z
  .object({
    'answers-name': z.string(),
    weight: integerFormat().optional(),
    'number-answers': integerFormat().optional(),
    order: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    display: z.enum(['block', 'inline', 'dropdown']).optional(),
    'hide-letter-keys': booleanFormat().optional(),
    'fixed-order': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "order" attribute instead.' })
      .optional(),
    inline: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "display" attribute instead.' })
      .optional(),
    'hide-score-badge': booleanFormat().optional(),
    'allow-blank': booleanFormat().optional(),
    'builtin-grading': booleanFormat().optional(),
    size: integerFormat().optional(),
    placeholder: z.string().optional(),
    'aria-label': z.string().optional(),
    'external-json': z
      .string()
      .meta({
        deprecated: true,
        description: 'Define answer choices inline with <pl-answer> instead.',
      })
      .optional(),
    'external-json-correct-key': z.string().meta({ deprecated: true }).optional(),
    'external-json-incorrect-key': z.string().meta({ deprecated: true }).optional(),
    'all-of-the-above': aotaNotaAttribute().optional(),
    'none-of-the-above': aotaNotaAttribute().optional(),
    'all-of-the-above-feedback': z.string().optional(),
    'none-of-the-above-feedback': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-multiple-choice',
  schema: z.toJSONSchema(plMultipleChoiceAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-answer': {
      schema: z.toJSONSchema(plMultipleChoiceAnswerAttributesSchema, { target: 'draft-04' }),
    },
  },
};
