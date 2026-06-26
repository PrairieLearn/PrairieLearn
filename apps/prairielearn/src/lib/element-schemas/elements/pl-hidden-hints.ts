import * as z from 'zod/v4';

import { integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plHiddenHintsAttributesSchema = z.object({}).strict();

const plHintAttributesSchema = z
  .object({
    'hint-name': z.string().optional(),
    'show-after-submission': integerFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-hidden-hints',
  schema: z.toJSONSchema(plHiddenHintsAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-hint': {
      schema: z.toJSONSchema(plHintAttributesSchema, { target: 'draft-04' }),
    },
  },
};
