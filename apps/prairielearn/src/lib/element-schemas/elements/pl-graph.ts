import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plGraphAttributesSchema = z.looseObject({
  directed: booleanFormat().optional(),
  directory: z.string().optional(),
  engine: z.string().optional(),
  'log-warnings': booleanFormat().optional(),
  'negative-weights': booleanFormat().optional(),
  'params-name': z.string().optional(),
  'params-name-labels': z.string().optional(),
  'params-name-matrix': z
    .string()
    .meta({ deprecated: true, description: 'Use the "params-name" attribute instead.' })
    .optional(),
  'params-type': z.string().optional(),
  'source-file-name': z.string().optional(),
  weights: booleanFormat().optional(),
  'weights-digits': integerFormat().optional(),
  'weights-presentation-type': z.string().optional(),
});

export const element: ElementSchemaModule = {
  tag: 'pl-graph',
  schema: z.toJSONSchema(plGraphAttributesSchema, { target: 'draft-04' }),
};
