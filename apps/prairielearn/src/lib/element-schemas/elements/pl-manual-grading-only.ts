import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plManualGradingOnlyAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-manual-grading-only',
  schema: z.toJSONSchema(plManualGradingOnlyAttributesSchema, { target: 'draft-04' }),
};
