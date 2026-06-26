import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plXssSafeAttributesSchema = z
  .object({
    contents: z.string().optional(),
    language: z.enum(['html', 'markdown']).optional(),
    'source-file-name': z.string().optional(),
    'submitted-file-name': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-xss-safe',
  schema: z.toJSONSchema(plXssSafeAttributesSchema, { target: 'draft-04' }),
};
