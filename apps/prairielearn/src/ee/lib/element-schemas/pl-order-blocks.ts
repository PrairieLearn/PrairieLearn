import * as z from 'zod/v4';

import { plBoolean, plInteger, toDraft06JsonSchema } from './element-schema-helpers.js';

const plOrderBlocksAnswerAttributesSchema = z
  .object({
    correct: plBoolean().optional(),
    'initially-placed': plBoolean().optional(),
    tag: z.string().optional(),
    depends: z.string().optional(),
    comment: z.string().optional(),
    indent: plInteger().optional(),
    'distractor-feedback': z.string().optional(),
    'distractor-for': z.string().optional(),
    'ordering-feedback': z.string().optional(),
    ranking: plInteger().optional(),
    final: plBoolean().optional(),
  })
  .strict();

const plOrderBlocksBlockGroupAttributesSchema = z
  .object({
    tag: z.string().optional(),
    depends: z.string().optional(),
  })
  .strict();

const plOrderBlocksAttributesSchema = z
  .object({
    'answers-name': z.string(),
    weight: plInteger().optional(),
    'source-blocks-order': z
      .enum(['random', 'alphabetized', 'ordered', 'random-sections'])
      .optional(),
    'distractor-order': z.enum(['random', 'inherit']).optional(),
    'grading-method': z.enum(['unordered', 'ordered', 'ranking', 'dag', 'external']).optional(),
    indentation: plBoolean().optional(),
    'source-header': z.string().optional(),
    'solution-header': z.string().optional(),
    'file-name': z.string().optional(),
    'solution-placement': z.enum(['right', 'bottom']).optional(),
    'max-incorrect': plInteger().optional(),
    'min-incorrect': plInteger().optional(),
    inline: plBoolean().optional(),
    'max-indent': plInteger().optional(),
    feedback: z.enum(['none', 'first-wrong', 'first-wrong-verbose']).optional(),
    'partial-credit': z.enum(['none', 'lcs']).optional(),
    format: z.enum(['default', 'code']).optional(),
    'code-language': z.string().optional(),
    'allow-blank': plBoolean().optional(),
  })
  .strict();

export function plOrderBlocksJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plOrderBlocksAttributesSchema);
}

export function plOrderBlocksAnswerJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plOrderBlocksAnswerAttributesSchema);
}

export function plOrderBlocksBlockGroupJsonSchema(): Record<string, unknown> {
  return toDraft06JsonSchema(plOrderBlocksBlockGroupAttributesSchema);
}
