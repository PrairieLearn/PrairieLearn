import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { AI_GRADING_MODEL_IDS, AI_GRADING_MODEL_PROVIDERS } from './ai-grading-models.shared.js';

export const AiGradingSelectionSchema = z.union([
  z
    .object({
      model_id: z.enum(AI_GRADING_MODEL_IDS),
      provider: z.enum(['openai', 'google', 'anthropic']).optional(),
      credential_id: z.null().optional(),
    })
    .refine(
      (selection) =>
        selection.provider === undefined ||
        selection.provider === AI_GRADING_MODEL_PROVIDERS[selection.model_id],
      { message: 'Model does not belong to the selected provider' },
    ),
  z.object({
    model_id: z
      .string()
      .min(1)
      .max(256)
      .refine((id) => id.trim().length > 0),
    provider: z.literal('openai-compatible'),
    credential_id: IdSchema,
  }),
]);

export type AiGradingSelection = z.infer<typeof AiGradingSelectionSchema>;
