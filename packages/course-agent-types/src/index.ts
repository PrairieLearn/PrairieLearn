import { z } from 'zod';

const ConversationLifecycleSchema = z.discriminatedUnion('status', [
  // No live container. The next message clones the repository or restores the committed checkpoint.
  z.object({ status: z.literal('offline') }),
  // Creating or restoring the sandbox and configuring it before submitting the new input.
  z.object({ status: z.literal('starting') }),
  // Preparing or executing a turn; new input waits for native cleanup and SDK response completion.
  z.object({ status: z.literal('waiting_for_agent') }),
  // The live workspace is ready for input; idle expiry will checkpoint it and shut it down.
  z.object({ status: z.literal('waiting_for_user') }),
  // Stop was requested; native execution and SDK response completion must settle before reuse.
  z.object({ status: z.literal('stopping') }),
  // Creating a replacement checkpoint or destroying its container; new input is not admitted.
  z.object({ status: z.literal('suspending') }),
  // An operation failed or was interrupted. Explicit Resume repairs the workspace without replaying input.
  z.object({
    status: z.literal('blocked'),
    reason: z.enum(['startup_failed', 'runtime_failed', 'checkpoint_failed', 'cleanup_failed']),
  }),
]);
export type ConversationLifecycle = z.infer<typeof ConversationLifecycleSchema>;
export const ConversationStateSchema = ConversationLifecycleSchema.and(
  z.object({ deadlineAt: z.iso.datetime().nullable() }),
);
/**
 * Public workspace lifecycle. Offline, waiting_for_user, and blocked are stable across DO wakes.
 * Other states represent in-flight operations and require recovery if their owning DO restarts.
 */
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type BlockedReason = Extract<ConversationState, { status: 'blocked' }>['reason'];

export const CreateConversationInput = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(1024),
});
