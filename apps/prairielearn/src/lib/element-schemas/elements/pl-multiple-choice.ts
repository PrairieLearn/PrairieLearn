import * as z from 'zod/v4';

import { booleanFormat, integerFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

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
    'all-of-the-above': aotaNotaAttribute().optional(),
    'all-of-the-above-feedback': z.string().optional(),
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    'builtin-grading': booleanFormat().optional(),
    display: z.enum(['block', 'inline', 'dropdown']).optional(),
    'external-json': z
      .string()
      .meta({
        deprecated: true,
        description: 'Define answer choices inline with <pl-answer> instead.',
      })
      .optional(),
    'external-json-correct-key': z.string().meta({ deprecated: true }).optional(),
    'external-json-incorrect-key': z.string().meta({ deprecated: true }).optional(),
    'fixed-order': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "order" attribute instead.' })
      .optional(),
    'hide-letter-keys': booleanFormat().optional(),
    'hide-score-badge': booleanFormat().optional(),
    inline: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "display" attribute instead.' })
      .optional(),
    'none-of-the-above': aotaNotaAttribute().optional(),
    'none-of-the-above-feedback': z.string().optional(),
    'number-answers': integerFormat().optional(),
    order: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    placeholder: z.string().optional(),
    size: integerFormat().optional(),
    weight: integerFormat().optional(),
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
