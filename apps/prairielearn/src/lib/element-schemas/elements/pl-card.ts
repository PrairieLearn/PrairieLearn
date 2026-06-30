import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plCardAttributesSchema = z
  .object({
    footer: z.string().optional(),
    header: z.string().optional(),
    'img-bottom-alt': z.string().optional(),
    'img-bottom-src': z.string().optional(),
    'img-top-alt': z.string().optional(),
    'img-top-src': z.string().optional(),
    subtitle: z.string().optional(),
    title: z.string().optional(),
    width: z.enum(['25%', '50%', '75%', 'auto']).optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-card',
  schema: z.toJSONSchema(plCardAttributesSchema, { target: 'draft-04' }),
};
