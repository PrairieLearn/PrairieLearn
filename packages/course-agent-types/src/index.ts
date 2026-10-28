import { z } from 'zod';

export type ConversationLifecycle =
  // No live container. The next message clones the repository or restores the committed checkpoint.
  | { status: 'offline' }
  // Creating or restoring the sandbox and configuring it before submitting the new input.
  | { status: 'starting' }
  // Preparing or executing a turn; new input waits for native cleanup and SDK response completion.
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
export const MAX_REVIEW_FILE_BYTES = 64 * 1024;
export const MAX_REVIEW_BYTES = 1024 * 1024;
const ReviewPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      [...path].every((character) => character.charCodeAt(0) >= 32) &&
      path
        .split('/')
        .every(
          (part) => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git',
        ),
  );
export const ReviewSnapshotSchema = z
  .strictObject({
    repository: CreateConversationInput.shape.repository,
    branch: CreateConversationInput.shape.branch,
    baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
    additions: z
      .array(
        z.strictObject({
          path: ReviewPathSchema,
          contents: z.base64().max(4 * Math.ceil(MAX_REVIEW_FILE_BYTES / 3)),
        }),
      )
      .max(100),
    deletions: z.array(z.strictObject({ path: ReviewPathSchema })).max(100),
  })
  .refine((snapshot) => {
    const paths = [...snapshot.additions, ...snapshot.deletions].map((file) => file.path);
    return (
      new Set(paths).size === paths.length &&
      snapshot.additions.reduce((size, file) => size + file.contents.length, 0) <= MAX_REVIEW_BYTES
    );
  });
export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;
export const PendingReviewSchema = z.strictObject({
  callId: z.string(),
  card: z.strictObject({ messageId: z.string(), partId: z.string() }),
  snapshot: ReviewSnapshotSchema,
  status: z.enum(['pending', 'running', 'blocked']),
  jobSequenceId: z.string().regex(/^\d+$/).nullable(),
  error: z.string().nullable(),
});
export type PendingReview = z.infer<typeof PendingReviewSchema>;
export const ReviewDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    callId: z.string(),
    decision: z.literal('approved'),
    jobSequenceId: z.string().regex(/^\d+$/),
  }),
  z.strictObject({ callId: z.string(), decision: z.literal('denied') }),
]);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export const ReviewOutcomeSchema = z.strictObject({
  callId: z.string(),
  result: PushSyncResultSchema,
});
export type ReviewOutcome = z.infer<typeof ReviewOutcomeSchema>;
export const SavedJobOutcomeSchema = z.strictObject({
  callId: z.string().nullable(),
  jobSequenceId: z.string().regex(/^\d+$/),
  status: z.enum(['running', 'completed', 'blocked']),
  result: PushSyncResultSchema.nullable(),
  error: z.string().nullable(),
});
