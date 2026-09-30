import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const plSpreadsheetAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    height: z.string().optional(),
    'params-name': z.string(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-spreadsheet',
  schema: z.toJSONSchema(plSpreadsheetAttributesSchema, { target: 'draft-04' }),
};
