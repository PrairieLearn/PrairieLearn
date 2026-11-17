import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const plOrderBlocksAnswerAttributesSchema = z
  .object({
    correct: booleanFormat().optional(),
    depends: z.string().optional(),
    'distractor-feedback': z.string().optional(),
    'distractor-for': z.string().optional(),
    final: booleanFormat().optional(),
    indent: integerFormat().optional(),
    'initially-placed': booleanFormat().optional(),
    'ordering-feedback': z.string().optional(),
    ranking: integerFormat().optional(),
    tag: z.string().optional(),
  })
  .strict();

const plOrderBlocksBlockGroupAttributesSchema = z
  .object({
    depends: z.string().optional(),
    tag: z.string().optional(),
  })
  .strict();

const plOrderBlocksAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'code-language': z.string().optional(),
    'display-blocks': z.enum(['vertical', 'inline-wrap', 'inline-nowrap']).optional(),
    'distractor-order': z.enum(['random', 'inherit']).optional(),
    feedback: z.enum(['none', 'first-wrong', 'first-wrong-verbose']).optional(),
    'file-name': z.string().optional(),
    format: z.enum(['default', 'code']).optional(),
    'grading-method': z.enum(['unordered', 'ordered', 'ranking', 'dag', 'external']).optional(),
    indentation: booleanFormat().optional(),
    inline: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "display-blocks" attribute instead.' })
      .optional(),
    'max-incorrect': integerFormat().optional(),
    'max-indent': integerFormat().optional(),
    'min-incorrect': integerFormat().optional(),
    'partial-credit': z.enum(['none', 'lcs']).optional(),
    'solution-header': z.string().optional(),
    'solution-placement': z.enum(['right', 'bottom']).optional(),
    'source-blocks-order': z
      .enum(['random', 'alphabetized', 'ordered', 'random-sections'])
      .optional(),
    'source-header': z.string().optional(),
    weight: integerFormat().optional(),
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
};
