import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plSubmissionPanelAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-submission-panel',
  schema: z.toJSONSchema(plSubmissionPanelAttributesSchema, { target: 'draft-04' }),
};
