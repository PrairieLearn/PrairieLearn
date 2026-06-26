import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plVariableScoreAttributesSchema = z
  .object({
    'answers-name': z.string(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-variable-score',
  schema: z.toJSONSchema(plVariableScoreAttributesSchema, { target: 'draft-04' }),
};
