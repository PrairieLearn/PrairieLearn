import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plImageCaptureAttributesSchema = z
  .object({
    'allow-blank': booleanFormat().optional(),
    'file-name': z.string(),
    'manual-upload-enabled': booleanFormat().optional(),
    'mobile-capture-enabled': booleanFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-image-capture',
  schema: z.toJSONSchema(plImageCaptureAttributesSchema, { target: 'draft-04' }),
};
