import { z } from 'zod';

export const ConversationStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('offline') }),
  z.object({ status: z.literal('starting') }),
  z.object({ status: z.literal('waiting_for_agent') }),
  z.object({ status: z.literal('waiting_for_user') }),
  z.object({ status: z.literal('stopping') }),
  z.object({ status: z.literal('suspending') }),
  z.object({
    status: z.literal('blocked'),
    reason: z.enum(['startup_failed', 'runtime_failed', 'checkpoint_failed', 'cleanup_failed']),
  }),
]);
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type BlockedReason = Extract<ConversationState, { status: 'blocked' }>['reason'];

export const CreateConversationInput = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(1024),
});
