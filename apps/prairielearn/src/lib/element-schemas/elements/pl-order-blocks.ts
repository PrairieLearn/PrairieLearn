import * as z from 'zod/v4';

import { plBoolean, plInteger } from '../element-schema-helpers.ts';
import type { ElementSchemaModule } from '../types.js';

import { blockGroupValidators, validators } from './pl-order-blocks.validator.ts';

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

const answerSchema = z.toJSONSchema(plOrderBlocksAnswerAttributesSchema, { target: 'draft-04' });

export const element: ElementSchemaModule = {
  tag: 'pl-order-blocks',
  schema: z.toJSONSchema(plOrderBlocksAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-answer': { schema: answerSchema },
    'pl-block-group': {
      schema: z.toJSONSchema(plOrderBlocksBlockGroupAttributesSchema, { target: 'draft-04' }),
      children: {
        'pl-answer': { schema: answerSchema },
      },
    },
  },
  validators: [...validators, ...blockGroupValidators],
};
