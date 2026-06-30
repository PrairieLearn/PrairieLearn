import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plHideInPanelAttributesSchema = z
  .object({
    answer: booleanFormat().optional(),
    question: booleanFormat().optional(),
    submission: booleanFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-hide-in-panel',
  schema: z.toJSONSchema(plHideInPanelAttributesSchema, { target: 'draft-04' }),
};
