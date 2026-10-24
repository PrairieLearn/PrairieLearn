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
  // Incorporating a reviewed publication outcome before allowing another turn.
  z.object({ status: z.literal('refreshing_workspace') }),
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

export const PushSyncResultSchema = z
  .strictObject({
    decision: z.enum(['approved', 'denied']),
    publication: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('not_attempted') }),
      z.strictObject({
        status: z.literal('published'),
        commitSha: z.string().regex(/^[0-9a-f]{40}$/),
      }),
      z.strictObject({ status: z.literal('failed'), error: z.string() }),
    ]),
    sync: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('not_attempted') }),
      z.strictObject({ status: z.literal('succeeded') }),
      z.strictObject({ status: z.literal('failed'), error: z.string() }),
    ]),
  })
  .refine((result) => {
    if (result.decision === 'denied') {
      return (
        result.publication.status === 'not_attempted' && result.sync.status === 'not_attempted'
      );
    }
    if (result.publication.status === 'published') return result.sync.status !== 'not_attempted';
    return result.publication.status === 'failed' && result.sync.status === 'not_attempted';
  });
export type PushSyncResult = z.infer<typeof PushSyncResultSchema>;
export const PendingReviewSchema = z.strictObject({
  callId: z.string(),
  card: z.strictObject({ messageId: z.string(), partId: z.string() }),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  repository: CreateConversationInput.shape.repository,
  branch: CreateConversationInput.shape.branch,
  baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
  patch: z.string(),
});
export type PendingReview = z.infer<typeof PendingReviewSchema>;
export const ReviewOutcomeSchema = z.strictObject({
  callId: z.string(),
  revision: PendingReviewSchema.shape.revision,
  result: PushSyncResultSchema,
});
export type ReviewOutcome = z.infer<typeof ReviewOutcomeSchema>;

/** Hash the base and exact patch bytes identically in Workers and Node. */
export async function reviewRevision(baseCommit: string, patch: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${baseCommit}\n${patch}`),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
