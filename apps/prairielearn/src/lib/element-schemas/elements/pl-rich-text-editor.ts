import * as z from 'zod/v4';

import { booleanFormat, integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plRichTextEditorAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'clipboard-enabled': booleanFormat().optional(),
    counter: z.enum(['none', 'character', 'word']).optional(),
    directory: z.string().optional(),
    'file-name': z.string().optional(),
    format: z.enum(['html', 'markdown']).optional(),
    'markdown-shortcuts': booleanFormat().optional(),
    'max-word-count': integerFormat().optional(),
    'min-word-count': integerFormat().optional(),
    placeholder: z.string().optional(),
    'quill-theme': z.string().optional(),
    'source-file-name': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-rich-text-editor',
  schema: z.toJSONSchema(plRichTextEditorAttributesSchema, { target: 'draft-04' }),
};
