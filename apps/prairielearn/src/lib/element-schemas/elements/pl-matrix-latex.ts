import * as z from 'zod/v4';

import { integerFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plMatrixLatexAttributesSchema = z
  .object({
    digits: integerFormat().optional(),
    'params-name': z.string(),
    'presentation-type': z.string().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-matrix-latex',
  schema: z.toJSONSchema(plMatrixLatexAttributesSchema, { target: 'draft-04' }),
};
