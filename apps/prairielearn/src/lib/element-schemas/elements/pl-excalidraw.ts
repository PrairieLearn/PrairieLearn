import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plExcalidrawAttributesSchema = z
  .object({
    'answers-name': z.string().optional(),
    directory: z
      .enum(['serverFilesCourse', 'clientFilesCourse', 'clientFilesQuestion', '.'])
      .optional(),
    gradable: booleanFormat().optional(),
    height: z.string().optional(),
    'source-file-name': z.string().optional(),
    width: z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-excalidraw',
  schema: z.toJSONSchema(plExcalidrawAttributesSchema, { target: 'draft-04' }),
};
