import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plFileEditorAttributesSchema = z
  .object({
    'ace-mode': z.string().optional(),
    'ace-theme': z.string().optional(),
    'allow-blank': booleanFormat().optional(),
    'auto-resize': booleanFormat().optional(),
    directory: z.string().optional(),
    'file-name': z.string(),
    focus: booleanFormat().optional(),
    'font-size': z.string().optional(),
    'max-lines': integerFormat().optional(),
    'min-lines': integerFormat().optional(),
    'normalize-to-ascii': booleanFormat().optional(),
    preview: z.string().optional(),
    'source-file-name': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-file-editor',
  schema: z.toJSONSchema(plFileEditorAttributesSchema, { target: 'draft-04' }),
};
