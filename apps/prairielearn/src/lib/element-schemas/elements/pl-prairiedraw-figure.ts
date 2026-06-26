import * as z from 'zod/v4';

import { integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plPrairiedrawFigureAttributesSchema = z
  .object({
    height: integerFormat().optional(),
    'param-names': z.string().optional(),
    'script-name': z.string(),
    width: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-prairiedraw-figure',
  schema: z.toJSONSchema(plPrairiedrawFigureAttributesSchema, { target: 'draft-04' }),
};
