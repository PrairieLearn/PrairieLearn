import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.js';
import type { ElementSchemaModule } from '../types.js';

const plSpreadsheetAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'answers-name': z.string(),
    'aria-label': z.string().optional(),
    height: z.string().optional(),
    'params-name': z.string().optional(),
  })
  .strict();

const plSpreadsheetDataAttributesSchema = z
  .object({
    directory: z.enum(['.', 'serverFilesCourse']).optional(),
    'editable-ranges': z.string().optional(),
    'sheet-name': z.string(),
    'source-file': z.string(),
    'student-range': z.string(),
  })
  .strict();

const plSpreadsheetOutputAttributesSchema = z
  .object({
    cell: z.string(),
    name: z.string(),
    required: booleanFormat().optional(),
    'sheet-name': z.string(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-spreadsheet',
  schema: z.toJSONSchema(plSpreadsheetAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-spreadsheet-data': {
      schema: z.toJSONSchema(plSpreadsheetDataAttributesSchema, { target: 'draft-04' }),
    },
    'pl-spreadsheet-output': {
      schema: z.toJSONSchema(plSpreadsheetOutputAttributesSchema, { target: 'draft-04' }),
    },
  },
};
