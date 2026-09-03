import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const correctAnswerPattern =
  /^\s*(?:Sum|Product|Integral|Limit|Union|Intersection|DisjointUnion|Min|Max|Custom)\s*\(.+\)\s*$/;

const plBigOperatorInputAttributesSchema = z
  .object({
    'allow-complex': booleanFormat().default('false').optional(),
    'allow-limit-direction-input': booleanFormat().default('true').optional(),
    'allowed-blank': z.enum(['none', 'limits', 'body', 'all']).default('none').optional(),
    'answers-name': z.string(),
    'body-relative-weight': integerFormat().default('3').optional(),
    'body-size': integerFormat().optional(),
    'correct-answer': z.string().regex(correctAnswerPattern).optional(),
    'custom-functions': z.string().optional(),
    'grading-method': z.enum(['exact', 'component', 'equivalent']).default('equivalent').optional(),
    'index-variable': z.string().optional(),
    'limit-direction': z
      .enum(['two-sided', 'from-left', 'from-right'])
      .default('two-sided')
      .optional(),
    'limit-size': integerFormat().optional(),
    limits: z.enum(['auto', 'bounds', 'domain', 'approach']).default('auto').optional(),
    operator: z
      .enum([
        'sum',
        'product',
        'integral',
        'limit',
        'union',
        'intersection',
        'disjoint-union',
        'min',
        'max',
        'custom',
      ])
      .optional(),
    'operator-latex': z.string().optional(),
    'show-help-text': booleanFormat().default('true').optional(),
    variables: z.string().optional(),
    weight: integerFormat().default('1').optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-big-operator-input',
  schema: z.toJSONSchema(plBigOperatorInputAttributesSchema, { target: 'draft-04' }),
};
