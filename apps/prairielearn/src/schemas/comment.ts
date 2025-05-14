import { z } from 'zod';

export const CommentJsonSchema = z
  .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
  .describe('Arbitrary comment for reference purposes.');

export type CommentJson = z.infer<typeof CommentJsonSchema>;
export type CommentJsonInput = z.input<typeof CommentJsonSchema>;
