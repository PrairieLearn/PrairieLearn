import { z } from 'zod';

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
  /** A review whose outcome the agent has not yet received. New messages wait for it. */
  reviewId: string | null;
};

export type BlockedReason = Extract<ConversationState, { status: 'blocked' }>['reason'];

export const CreateConversationInput = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(1024),
});

// Leave room for base64 encoding within the Durable Object's 2 MB storage-entry limit.
// TODO: Store review contents in R2 and stream them to PL instead of buffering whole reviews.
export const MAX_REVIEW_FILE_BYTES = 1024 * 1024;
// Capture counts base64-encoded originals and proposed contents; leave room for metadata
// under Cloudflare's 32 MiB serialized RPC limit.
export const MAX_REVIEW_BYTES = 20 * 1024 * 1024;

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

/**
 * The save and sync outcomes are separate: files may be saved even if syncing fails. Both are
 * `unknown` when PrairieLearn lost the save job before it recorded how far it got, so the files
 * may or may not have been saved.
 */
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
      z.strictObject({ status: z.literal('published') }),
      z.strictObject({ status: z.literal('failed'), error: z.string() }),
      z.strictObject({ status: z.literal('unknown') }),
    ]),
    sync: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('not_attempted') }),
      z.strictObject({ status: z.literal('succeeded') }),
      z.strictObject({ status: z.literal('failed'), error: z.string() }),
      z.strictObject({ status: z.literal('unknown') }),
    ]),
  })
  .refine((result) => {
    if (result.decision === 'denied') {
      return (
        result.publication.status === 'not_attempted' && result.sync.status === 'not_attempted'
      );
    }
    switch (result.publication.status) {
      case 'published':
      case 'saved_locally':
        return result.sync.status === 'succeeded' || result.sync.status === 'failed';
      case 'failed':
      case 'conflict':
        return result.sync.status === 'not_attempted';
      case 'unknown':
        return result.sync.status === 'unknown';
      case 'not_attempted':
        return false;
    }
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

/**
 * A review the agent requested and whose outcome it has not yet received. PrairieLearn owns the
 * decision and outcome; the agent service owns the snapshot and delivery to the agent.
 */
export const ReviewSchema = z.strictObject({
  id: z.uuid(),
  snapshot: ReviewSnapshotSchema,
});

export type Review = z.infer<typeof ReviewSchema>;

/** Text clipped to a size limit; `omitted` counts the characters removed from its middle. */
const ClipSchema = z.object({ text: z.string(), omitted: z.number().int().nonnegative() });

export type Clip = z.infer<typeof ClipSchema>;

/**
 * One Codex tool call as chat history shows it, in a `data-tool` part keyed by the Codex item
 * ID. Fields come from Codex's own item, and the browser derives labels from them, so labels
 * can change without rewriting history. Bump `v` for a change old parts cannot be read as.
 */
export const ToolCallSchema = z
  .object({
    v: z.literal(1),
    /** `interrupted`: the turn ended before Codex reported the call's outcome. */
    status: z.enum(['running', 'completed', 'failed', 'declined', 'interrupted']),
    durationMs: z.number().nullable(),
  })
  .and(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('command'),
        command: z.string(),
        /** Codex's parse of the command; `unknown` when it is not a read, list, or search. */
        actions: z.array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('read'), name: z.string(), path: z.string() }),
            z.object({ type: z.literal('listFiles'), path: z.string().nullable() }),
            z.object({
              type: z.literal('search'),
              query: z.string().nullable(),
              path: z.string().nullable(),
            }),
            z.object({ type: z.literal('unknown') }),
          ]),
        ),
        exitCode: z.number().nullable(),
        output: ClipSchema.nullable(),
      }),
      z.object({
        kind: z.literal('fileChange'),
        changes: z.array(
          z.object({
            path: z.string(),
            change: z.enum(['add', 'delete', 'update']),
            movePath: z.string().nullable(),
            added: z.number(),
            removed: z.number(),
            diff: ClipSchema,
          }),
        ),
        /** Files beyond the ones listed. */
        omittedChanges: z.number(),
      }),
      z.object({
        kind: z.literal('tool'),
        /** The MCP server or dynamic tool namespace. */
        server: z.string().nullable(),
        tool: z.string(),
        arguments: ClipSchema,
        output: ClipSchema.nullable(),
        error: z.string().nullable(),
      }),
      z.object({
        kind: z.literal('webSearch'),
        action: z.enum(['search', 'openPage', 'findInPage', 'other']),
        query: z.string(),
        target: z.string().nullable(),
      }),
      z.object({ kind: z.literal('other'), itemType: z.string(), path: z.string().nullable() }),
    ]),
  );

export type ToolCall = z.infer<typeof ToolCallSchema>;
