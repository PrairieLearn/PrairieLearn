import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plFileUploadAttributesSchema = z
  .object({
    'file-names': z.string().optional(),
    'file-patterns': z.string().optional(),
    'optional-file-names': z.string().optional(),
    'optional-file-patterns': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-file-upload',
  schema: z.toJSONSchema(plFileUploadAttributesSchema, { target: 'draft-04' }),
};
