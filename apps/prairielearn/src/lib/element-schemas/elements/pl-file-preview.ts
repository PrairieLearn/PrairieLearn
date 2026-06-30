import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plFilePreviewAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-file-preview',
  schema: z.toJSONSchema(plFilePreviewAttributesSchema, { target: 'draft-04' }),
};
