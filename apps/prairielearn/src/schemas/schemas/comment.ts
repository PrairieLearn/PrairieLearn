import { z } from 'zod';

export const CommentSchema = z
  .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
  .describe('Arbitrary comment for reference purposes.');
