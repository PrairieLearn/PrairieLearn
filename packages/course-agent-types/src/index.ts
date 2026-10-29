import { z } from 'zod';

export type ConversationLifecycle =
  // No live container. The next message initializes a workspace or restores the committed checkpoint.
  | { status: 'offline' }
  // Creating or restoring the sandbox and configuring it before submitting the new input.
  | { status: 'starting' }
  // Preparing or executing a turn; new input waits for this turn and SDK response completion.
  | { status: 'waiting_for_agent' }
  // The live workspace is ready for input; idle expiry will checkpoint it and shut it down.
  | { status: 'waiting_for_user' }
  // Stop was requested; native execution and SDK response completion must settle before reuse.
  | { status: 'stopping' }
  // Creating a replacement checkpoint or destroying its container; new input is not admitted.
  | { status: 'suspending' }
  // An operation failed or was interrupted. Explicit Resume repairs the workspace without replaying input.
  | {
      status: 'blocked';
      reason: 'startup_failed' | 'runtime_failed' | 'checkpoint_failed' | 'cleanup_failed';
    };

/**
 * Public workspace lifecycle. Offline, waiting_for_user, and blocked are stable across DO wakes.
 * Other states represent in-flight operations and require recovery if their owning DO restarts.
 */
export type ConversationState = ConversationLifecycle & { deadlineAt: string | null };

export type BlockedReason = Extract<ConversationState, { status: 'blocked' }>['reason'];

export const CreateConversationInput = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(1024),
});
