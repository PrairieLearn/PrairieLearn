import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plPythonVariableAttributesSchema = z
  .object({
    compact: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "compact-sequences" attribute instead.' })
      .optional(),
    'compact-sequences': booleanFormat().optional(),
    'copy-code-button': booleanFormat().optional(),
    depth: integerFormat().optional(),
    indent: integerFormat().optional(),
    'no-highlight': booleanFormat().optional(),
    'params-name': z.string(),
    prefix: z.string().optional(),
    'prefix-newline': booleanFormat().optional(),
    'show-dimensions': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "pl-dataframe" element instead.' })
      .optional(),
    'show-header': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "pl-dataframe" element instead.' })
      .optional(),
    'show-index': booleanFormat()
      .meta({ deprecated: true, description: 'Use the "pl-dataframe" element instead.' })
      .optional(),
    'show-line-numbers': booleanFormat().optional(),
    'sort-dicts': booleanFormat().optional(),
    suffix: z.string().optional(),
    'suffix-newline': booleanFormat().optional(),
    text: booleanFormat()
      .meta({ deprecated: true, description: 'Use the "pl-dataframe" element instead.' })
      .optional(),
    width: integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-python-variable',
  schema: z.toJSONSchema(plPythonVariableAttributesSchema, { target: 'draft-04' }),
};
