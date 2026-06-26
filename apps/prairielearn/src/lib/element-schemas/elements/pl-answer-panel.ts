import * as z from 'zod/v4';

import type { ElementSchemaModule } from '../types.ts';

const plAnswerPanelAttributesSchema = z.object({}).strict();

export const element: ElementSchemaModule = {
  tag: 'pl-answer-panel',
  schema: z.toJSONSchema(plAnswerPanelAttributesSchema, { target: 'draft-04' }),
};
