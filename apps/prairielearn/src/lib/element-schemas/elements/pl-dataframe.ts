import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plDataframeAttributesSchema = z
  .object({
    digits: integerFormat().optional(),
    'display-language': z.enum(['python', 'r']).optional(),
    'display-variable-name': z.string().optional(),
    'params-name': z.string(),
    'presentation-type': z.enum(['e', 'E', 'f', 'F', 'g', 'G', 'n', '%']).optional(),
    'show-dimensions': booleanFormat().optional(),
    'show-dtype': booleanFormat().optional(),
    'show-header': booleanFormat().optional(),
    'show-index': booleanFormat().optional(),
    'show-python': booleanFormat().optional(),
    width: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-dataframe',
  schema: z.toJSONSchema(plDataframeAttributesSchema, { target: 'draft-04' }),
};
