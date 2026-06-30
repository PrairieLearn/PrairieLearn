import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plHideInManualGradingAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-hide-in-manual-grading',
  schema: z.toJSONSchema(plHideInManualGradingAttributesSchema, { target: 'draft-04' }),
};
