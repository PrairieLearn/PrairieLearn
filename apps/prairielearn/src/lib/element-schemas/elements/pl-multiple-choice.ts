import * as z from 'zod/v4';

import { plBoolean, plInteger, plNumber } from '../element-schema-helpers.ts';
import type { ElementSchemaModule } from '../types.js';

import { validators } from './pl-multiple-choice.validator.ts';

const aotaNotaAttribute = () =>
  z.union([plBoolean(), z.enum(['false', 'random', 'correct', 'incorrect'])]);

const plMultipleChoiceAnswerAttributesSchema = z
  .object({
    correct: plBoolean().optional(),
    feedback: z.string().optional(),
    score: plNumber().optional(),
  })
  .strict();

const plMultipleChoiceAttributesSchema = z
  .object({
    'answers-name': z.string(),
    weight: plInteger().optional(),
    'number-answers': plInteger().optional(),
    order: z.enum(['random', 'ascend', 'descend', 'fixed']).optional(),
    display: z.enum(['block', 'inline', 'dropdown']).optional(),
    'hide-letter-keys': plBoolean().optional(),
    'fixed-order': plBoolean()
      .meta({ deprecated: true, description: 'Use the "order" attribute instead.' })
      .optional(),
    inline: plBoolean()
      .meta({ deprecated: true, description: 'Use the "display" attribute instead.' })
      .optional(),
    'hide-score-badge': plBoolean().optional(),
    'allow-blank': plBoolean().optional(),
    'builtin-grading': plBoolean().optional(),
    size: plInteger().optional(),
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
  validators,
};
