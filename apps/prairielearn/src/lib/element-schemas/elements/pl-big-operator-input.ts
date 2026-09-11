import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const correctAnswerPattern =
  /^\s*(?:Sum|Product|Integral|Limit|Union|Intersection|DisjointUnion|Min|Max|Custom)\s*\(.+\)\s*$/;

const plBigOperatorInputAttributesSchema = z
  .object({
    'allow-complex': booleanFormat().default('false').optional(),
    'allow-limit-direction-input': booleanFormat().default('true').optional(),
    'allowed-blank': z.enum(['none', 'indices', 'body', 'all']).default('none').optional(),
    'answers-name': z.string(),
    'body-relative-weight': integerFormat().default('3').optional(),
    'body-size': integerFormat().optional(),
    'correct-answer': z.string().regex(correctAnswerPattern).optional(),
    'custom-functions': z.string().optional(),
    'grading-method': z.enum(['exact', 'component', 'equivalent', 'none']).optional(),
    'imaginary-unit-for-display': z.enum(['i', 'j']).default('i').optional(),
    'limit-size': integerFormat().optional(),
    'operator-latex': z.string().optional(),
    'prefix-latex': z.string().optional(),
    'show-help-text': booleanFormat().default('true').optional(),
    'suffix-latex': z.string().optional(),
    variables: z.string().optional(),
    weight: integerFormat().default('1').optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-big-operator-input',
  schema: z.toJSONSchema(plBigOperatorInputAttributesSchema, { target: 'draft-04' }),
};
