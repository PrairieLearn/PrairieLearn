import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

export type ConversationLifecycle =
  // No live container. The next message initializes a sandbox or restores the committed checkpoint.
  | { status: 'offline' }
  // Creating or restoring the sandbox and configuring it before submitting the new input.
  | { status: 'starting' }
  // Preparing or executing a turn; new input waits for this turn and SDK response completion.
  | { status: 'waiting_for_agent' }
  // The live sandbox is ready for input; idle expiry will checkpoint it and shut it down.
  | { status: 'waiting_for_user' }
  // Stop was requested; native execution and SDK response completion must settle before reuse.
  | { status: 'stopping' }
  // Creating a replacement checkpoint or destroying its container; new input is not admitted.
  | { status: 'suspending' }
  // An operation failed or was interrupted. Explicit Resume repairs the sandbox without replaying input.
  | {
      status: 'blocked';
      reason: 'startup_failed' | 'runtime_failed' | 'checkpoint_failed' | 'cleanup_failed';
    };

/**
 * Public sandbox lifecycle. Offline, waiting_for_user, and blocked are stable across DO wakes.
 * Other states represent in-flight operations and require recovery if their owning DO restarts.
 */
export type ConversationState = ConversationLifecycle & {
  deadlineAt: string | null;
  /** The container stopped unexpectedly; the sandbox was restored from its last checkpoint. */
  sandboxLost: boolean;
};

export type BlockedReason = Extract<ConversationState, { status: 'blocked' }>['reason'];

export const CreateConversationInput = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(1024),
});

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

const ReviewContentsSchema = z.base64().max(4 * Math.ceil(MAX_REVIEW_FILE_BYTES / 3));

/** The save and sync outcomes are separate: files may be saved even if syncing fails. */
export const RequestChangesResultSchema = z
  .strictObject({
    decision: z.enum(['approved', 'denied']),
    publication: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('not_attempted') }),
      z.strictObject({ status: z.literal('saved_locally') }),
      z.strictObject({
        status: z.literal('conflict'),
        paths: z.array(ReviewPathSchema).min(1).max(100),
      }),
      z.strictObject({
        status: z.literal('published'),
        commitSha: z
          .string()
          .regex(/^[0-9a-f]{40}$/)
          .optional(),
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
    if (['published', 'saved_locally'].includes(result.publication.status)) {
      return result.sync.status !== 'not_attempted';
    }
    return (
      ['failed', 'conflict'].includes(result.publication.status) &&
      result.sync.status === 'not_attempted'
    );
  });

export type RequestChangesResult = z.infer<typeof RequestChangesResultSchema>;

const ReviewFilesShape = {
  additions: z
    .array(z.strictObject({ path: ReviewPathSchema, contents: ReviewContentsSchema }))
    .max(100),
  deletions: z.array(z.strictObject({ path: ReviewPathSchema })).max(100),
};

/** Captured file contents for instructor review, independent of the live sandbox. */
export const ReviewSnapshotSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...ReviewFilesShape,
      type: z.literal('github'),
      repository: CreateConversationInput.shape.repository,
      branch: CreateConversationInput.shape.branch,
      baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
    }),
    z.strictObject({ ...ReviewFilesShape, type: z.literal('local') }),
  ])
  .refine((snapshot) => {
    const paths = [...snapshot.additions, ...snapshot.deletions].map((file) => file.path);
    return (
      paths.length <= 100 &&
      new Set(paths).size === paths.length &&
      snapshot.additions.reduce((size, file) => size + file.contents.length, 0) <= MAX_REVIEW_BYTES
    );
  });

export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;

/** Public review state returned to PrairieLearn for display and approval. */
export const PendingReviewSchema = z.strictObject({
  callId: z.string(),
  // Identifies the request_changes tool part in chat history so its result can be updated.
  request_changes_tool_part: z.strictObject({ messageId: z.string(), partId: z.string() }),
  snapshot: ReviewSnapshotSchema,
  // Running means a decision was recorded but its result has not reached the agent.
  status: z.enum(['pending', 'running']),
  jobSequenceId: IdSchema.nullable(),
});

export type PendingReview = z.infer<typeof PendingReviewSchema>;

export const ReviewDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    callId: z.string(),
    decision: z.literal('approved'),
    jobSequenceId: IdSchema,
  }),
  z.strictObject({ callId: z.string(), decision: z.literal('denied') }),
]);

export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const ReviewOutcomeSchema = z.strictObject({
  callId: z.string(),
  result: RequestChangesResultSchema,
});

export type ReviewOutcome = z.infer<typeof ReviewOutcomeSchema>;
