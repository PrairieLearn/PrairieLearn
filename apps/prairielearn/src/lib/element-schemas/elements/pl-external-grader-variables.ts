import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const plExternalGraderVariablesAttributesSchema = z
  .object({
    empty: booleanFormat().optional(),
    'params-name': z.string(),
  })
  .strict();

const plVariableAttributesSchema = z
  .object({
    name: z.string(),
    type: z.string(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-external-grader-variables',
  schema: z.toJSONSchema(plExternalGraderVariablesAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-variable': {
      schema: z.toJSONSchema(plVariableAttributesSchema, { target: 'draft-04' }),
    },
  },
};
