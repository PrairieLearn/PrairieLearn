import * as z from 'zod/v4';

import { plBoolean, plInteger, toDraft06JsonSchema } from './element-schema-helpers.js';

const aotaNotaAttribute = () =>
  z.union([plBoolean(), z.enum(['false', 'random', 'correct', 'incorrect'])]);

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

export function plMultipleChoiceJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plMultipleChoiceAttributesSchema);
}
