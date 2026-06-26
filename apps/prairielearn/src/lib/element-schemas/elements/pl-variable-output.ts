import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const defaultTabAttribute = () =>
  z.union([
    z.enum(['matlab', 'mathematica', 'numpy', 'r', 'sympy']),
    z.literal('python').meta({ deprecated: true, description: 'Use default-tab="numpy" instead.' }),
  ]);

const plVariableAttributesSchema = z
  .object({
    comment: z.string().optional(),
    digits: integerFormat().optional(),
    'params-name': z.string(),
  })
  .strict();

const plVariableOutputAttributesSchema = z
  .object({
    'default-tab': defaultTabAttribute().optional(),
    digits: integerFormat().optional(),
    'show-mathematica': booleanFormat().optional(),
    'show-matlab': booleanFormat().optional(),
    'show-numpy': booleanFormat().optional(),
    'show-python': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "show-numpy" attribute instead.' })
      .optional(),
    'show-r': booleanFormat().optional(),
    'show-sympy': booleanFormat().optional(),
  })
  .strict();

const variableSchema = z.toJSONSchema(plVariableAttributesSchema, { target: 'draft-04' });

export const element: ElementSchemaModule = {
  tag: 'pl-variable-output',
  schema: z.toJSONSchema(plVariableOutputAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-variable': { schema: variableSchema },
    variable: { schema: variableSchema },
  },
};
