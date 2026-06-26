import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plExternalGraderResultsAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-external-grader-results',
  schema: z.toJSONSchema(plExternalGraderResultsAttributesSchema, { target: 'draft-04' }),
};
