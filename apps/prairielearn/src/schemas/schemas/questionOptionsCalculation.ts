import { z } from 'zod';

export default z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
  })
  .describe('Options for a Calculation question.');
