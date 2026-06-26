import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plFigureAttributesSchema = z
  .object({
    alt: z.string().optional(),
    directory: z.enum(['clientFilesQuestion', 'clientFilesCourse']).optional(),
    display: z.enum(['block', 'inline']).optional(),
    'file-name': z.string(),
    inline: booleanFormat()
      .meta({ deprecated: true, description: 'Use display="inline" instead.' })
      .optional(),
    type: z.enum(['static', 'dynamic']).optional(),
    width: z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-figure',
  schema: z.toJSONSchema(plFigureAttributesSchema, { target: 'draft-04' }),
};
