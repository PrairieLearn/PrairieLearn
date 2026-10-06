import type { UIMessage, UIMessageChunk } from 'ai';
import { z } from 'zod';

export const sendRequestSchema = z.object({
  id: z.uuid(),
  expectedOperationNumber: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(100_000),
});
export type SendRequest = z.infer<typeof sendRequestSchema>;
export const dispatchRequestSchema = sendRequestSchema.extend({ dispatchId: z.uuid().optional() });
export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;
export const admissionReconciliationSchema = z.object({
  admissions: z.array(z.object({ id: z.uuid(), dispatchId: z.uuid() })).max(100),
});

/** One cleanup attempt, persisted with sandbox state so retries survive DO eviction. */
export const cleanupDiagnosticsSchema = z.object({
  id: z.string(),
  stage: z.enum(['stop', 'backup', 'destroy']),
  attempts: z.number().int().positive(),
  error: z.string().optional(),
  retryAt: z.number().nullable(),
});
export type CleanupDiagnostics = z.infer<typeof cleanupDiagnosticsSchema>;

/** Read-time lifecycle view; deadlines are computed from durable timestamps. */
export const sandboxDiagnosticsSchema = z.object({
  state: z.enum([
    'absent',
    'starting',
    'waiting_for_agent',
    'waiting_for_user',
    'suspending',
    'destroying',
    'cleanup_failed',
  ]),
  cleanup: cleanupDiagnosticsSchema.optional(),
  checkpointError: z.string().optional(),
  idleExpiresAt: z.number().nullable(),
  interactionExpiresAt: z.number().nullable(),
});
export type SandboxDiagnostics = z.infer<typeof sandboxDiagnosticsSchema>;

export interface ChatConnection {
  resume(): Promise<ReadableStream<UIMessageChunk> | null>;
  // Detach the subscriber; cancelling the agent is a separate operation.
  close(): void;
}

/** Backend provider boundary: controls/snapshots are JSON; observation yields standard AI SDK chunks. */
export const preparedToolSchema = z.object({ id: z.uuid() });

export interface ChatProvider {
  watch(
    signal: AbortSignal,
    changed: () => void,
    failed: () => void,
    execute?: (call: HostToolCall) => Promise<unknown>,
  ): Promise<() => void>;
  getSnapshot(signal: AbortSignal, operationIds?: string[]): Promise<ChatSnapshot>;
  markToolPrepared(id: string, signal: AbortSignal): Promise<void>;
  deliverToolResult(input: ToolOutcome, signal: AbortSignal): Promise<void>;
  getDiagnostics(signal: AbortSignal): Promise<SandboxDiagnostics>;
  retryCleanup(signal: AbortSignal): Promise<void>;
  getHistory(signal: AbortSignal): Promise<UIMessage[]>;
  send(input: DispatchRequest, signal: AbortSignal): Promise<void>;
  reconcileAdmissions(
    admissions: { id: string; dispatchId: string }[],
    signal: AbortSignal,
  ): Promise<{ rejected: string[] }>;
  cancel(signal: AbortSignal): Promise<void>;
  connect(signal: AbortSignal): Promise<ChatConnection>;
}

export const approvalSchema = z.object({
  id: z.uuid(),
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  proposedSha: z.string().regex(/^[a-f0-9]{40}$/),
  diff: z.string().max(262144),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        content: z.string().max(262144).nullable(),
        mode: z.string(),
        previousMode: z.string(),
      }),
    )
    .max(100),
  digest: z.string(),
  status: z.enum(['pending', 'approved', 'denied']),
  result: z.string().optional(),
});
export type Approval = z.infer<typeof approvalSchema>;
/** History keeps the reviewed diff and verdict, not another copy of publication file blobs. */
export const approvalDisplaySchema = approvalSchema.omit({ files: true });
export type ApprovalDisplay = z.infer<typeof approvalDisplaySchema>;
/** Stable across JSONB object-key normalization; every published byte participates in approval identity. */
export function proposalContent(base: string, proposed: string, files: Approval['files']) {
  return `${base}\n${proposed}\n${JSON.stringify(files.map((f) => [f.path, f.content, f.mode, f.previousMode]))}`;
}
export const approvalDecisionSchema = z.object({
  id: z.uuid(),
  expectedOperationNumber: z.number().int().nonnegative(),
  digest: z.string(),
  decision: z.enum(['approve', 'deny']),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export const conversationUsageSchema = z.object({
  version: z.number().int().nonnegative(),
  model: z.string().min(1),
  input: z.number().int().nonnegative().nullable(),
  cached: z.number().int().nonnegative().nullable(),
  cacheWrite: z.number().int().nonnegative().nullable(),
  output: z.number().int().nonnegative().nullable(),
});
export type ConversationUsage = z.infer<typeof conversationUsageSchema>;
export interface ChatSnapshot {
  /** Dispatch acknowledgments support retries; token attribution is conversation-wide. */
  executions?: Record<
    string,
    {
      dispatchId?: string;
      status: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
    }
  >;
  conversationUsage?: ConversationUsage;
  usage?: { input: number | null; output: number | null; estimatedCost: number | null };
  messages: UIMessage[];
  operationNumber: number;
  newWorkUnavailable?: string;
  blocked?: boolean;
  pendingTool?: PendingTool;
  diagnostics?: SandboxDiagnostics;
  approval?: ApprovalDisplay;
  preparation?: { id: string; error?: string };
  approvals?: ApprovalDisplay[];
  publication?: {
    publishedSha?: string;
    syncedSha?: string;
    syncJobSequenceId?: string;
    repository: string;
    branch: string;
    status: 'ready' | 'publishing' | 'syncing' | 'retry' | 'complete' | 'invalid';
    delivered?: boolean;
    decision?: boolean;
    error?: string;
  };
}
/** Generic durable gate. Product-specific proposals and decisions belong to PL. */
export interface PendingTool {
  id: string;
  sequence: number;
  name: string;
  args: unknown;
  result?: string;
  resultSuccess?: boolean;
  prepared?: boolean;
  error?: string;
}
export const toolOutcomeSchema = z.object({
  id: z.uuid(),
  dispatchId: z.uuid().optional(),
  result: z.string().min(1).max(2000),
  success: z.boolean().optional(),
  display: z.object({ name: z.string(), value: z.json() }).optional(),
});
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;

export class ChatError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const approvalOutcomeSchema = approvalDecisionSchema.extend({
  result: z.string().min(1).max(2000),
  success: z.boolean().optional(),
});

export const hostToolCallSchema = z.object({
  type: z.literal('host-tool-call'),
  id: z.string().uuid(),
  name: z.string().max(100),
  input: z.unknown(),
  sequence: z.number().int().positive().optional(),
});
export type HostToolCall = z.infer<typeof hostToolCallSchema>;

export const hostToolResultSchema = z.object({
  type: z.literal('host-tool-result'),
  id: z.string().uuid(),
  result: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), output: z.unknown() }),
    z.object({ ok: z.literal(false), error: z.string().max(1000) }),
  ]),
});
export const hostToolDefinitions = [
  {
    type: 'function' as const,
    name: 'host_echo',
    description:
      'Echo text through the trusted PL webserver. Use this to demonstrate host execution.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', maxLength: 4096 } },
      required: ['text'],
      additionalProperties: false,
    },
  },
];
