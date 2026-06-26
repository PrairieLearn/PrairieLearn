import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plCodeAttributesSchema = z
  .object({
    'copy-code-button': booleanFormat().optional(),
    directory: z.string().optional(),
    'highlight-lines': z.string().optional(),
    'highlight-lines-color': z.string().optional(),
    language: z.string().optional(),
    'no-highlight': booleanFormat()
      .meta({ deprecated: true, description: 'Omit the "language" attribute instead.' })
      .optional(),
    'normalize-whitespace': booleanFormat().optional(),
    'prevent-select': booleanFormat().optional(),
    'show-line-numbers': booleanFormat().optional(),
    'source-file-name': z.string().optional(),
    style: z
      .string()
      .meta({ deprecated: true, description: 'Use the "style-name" attribute instead.' })
      .optional(),
    'style-name': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-code',
  schema: z.toJSONSchema(plCodeAttributesSchema, { target: 'draft-04' }),
};
