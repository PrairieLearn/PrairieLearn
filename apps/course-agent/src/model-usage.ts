import { z } from 'zod';

import { type UsageDelta, UsageDeltaSchema } from '@prairielearn/course-agent-types';

// gpt-6-luna's fixed input/output prices. Cached input uses the input rate in this pilot.
const INPUT_MILLI_DOLLARS_PER_MILLION_TOKENS = 100;
const OUTPUT_MILLI_DOLLARS_PER_MILLION_TOKENS = 500;

export const ModelEventSchema = z.looseObject({
  type: z.string(),
  response: z
    .looseObject({
      usage: z
        .looseObject({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
          input_tokens_details: z
            .looseObject({ cached_tokens: z.number().int().nonnegative().optional() })
            .optional(),
          output_tokens_details: z
            .looseObject({ reasoning_tokens: z.number().int().nonnegative().optional() })
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export function requestUsage(event: z.infer<typeof ModelEventSchema>): UsageDelta | null {
  const usage = event.response?.usage;
  if (!usage) return null;
  return UsageDeltaSchema.parse({
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    costMilliDollars: Math.ceil(
      (usage.input_tokens * INPUT_MILLI_DOLLARS_PER_MILLION_TOKENS +
        usage.output_tokens * OUTPUT_MILLI_DOLLARS_PER_MILLION_TOKENS) /
        1_000_000,
    ),
  });
}
