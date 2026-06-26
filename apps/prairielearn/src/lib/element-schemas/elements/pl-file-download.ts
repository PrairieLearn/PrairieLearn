import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plFileDownloadAttributesSchema = z
  .object({
    directory: z.enum(['clientFilesQuestion', 'clientFilesCourse']).optional(),
    'file-name': z.string(),
    'force-download': booleanFormat().optional(),
    label: z.string().optional(),
    type: z.enum(['static', 'dynamic']).optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-file-download',
  schema: z.toJSONSchema(plFileDownloadAttributesSchema, { target: 'draft-04' }),
};
