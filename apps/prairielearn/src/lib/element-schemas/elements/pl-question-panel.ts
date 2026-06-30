import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plQuestionPanelAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-question-panel',
  schema: z.toJSONSchema(plQuestionPanelAttributesSchema, { target: 'draft-04' }),
};
