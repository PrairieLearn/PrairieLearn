import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plWorkspaceAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-workspace',
  schema: z.toJSONSchema(plWorkspaceAttributesSchema, { target: 'draft-04' }),
};
