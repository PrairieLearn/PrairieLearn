import * as z from 'zod/v4';

import { booleanFormat, numberFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plOverlayLocationAttributesSchema = z
  .object({
    bottom: numberFormat().optional(),
    halign: z.enum(['left', 'middle', 'center', 'right']).optional(),
    left: numberFormat().optional(),
    right: numberFormat().optional(),
    top: numberFormat().optional(),
    valign: z.enum(['top', 'middle', 'center', 'bottom']).optional(),
  })
  .strict();

const plOverlayBackgroundAttributesSchema = z.object({}).strict();

const plOverlayAttributesSchema = z
  .object({
    clip: booleanFormat().optional(),
    height: numberFormat().optional(),
    width: numberFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-overlay',
  schema: z.toJSONSchema(plOverlayAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-background': {
      schema: z.toJSONSchema(plOverlayBackgroundAttributesSchema, { target: 'draft-04' }),
    },
    'pl-location': {
      schema: z.toJSONSchema(plOverlayLocationAttributesSchema, { target: 'draft-04' }),
    },
  },
};
