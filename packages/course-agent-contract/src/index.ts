import type { UIMessage, UIMessageChunk } from 'ai';
import { z } from 'zod';

import { type ConversationRuntime, type ModelPrice, modelPriceSchema } from './service-api.js';

export * from './service-api.js';

export const sendRequestSchema = z.object({
  id: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  text: z
    .string()
    .min(1)
    .max(100_000)
    .refine((text) => text.trim().length > 0),
});
export type SendRequest = z.infer<typeof sendRequestSchema>;
export const dispatchRequestSchema = sendRequestSchema.extend({ dispatchId: z.uuid().optional() });
export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;

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

export interface ChatProvider {
  getRuntime(signal: AbortSignal): Promise<ConversationRuntime>;
  exportConversation(signal: AbortSignal): Promise<ConversationExport>;
  configure(
    binding: { repository: string; branch: string; modelPrices?: Record<string, ModelPrice> },
    signal: AbortSignal,
  ): Promise<{ model: string }>;
  watch(signal: AbortSignal, changed: () => void, failed: () => void): Promise<() => void>;
  getSnapshot(signal: AbortSignal, operationIds?: string[]): Promise<ChatSnapshot>;
  getDiagnostics(signal: AbortSignal): Promise<SandboxDiagnostics>;
  retryCleanup(signal: AbortSignal): Promise<void>;
  requestRetention(signal: AbortSignal): Promise<void>;
  getHistory(signal: AbortSignal): Promise<UIMessage[]>;
  send(input: DispatchRequest, signal: AbortSignal): Promise<{ revision: number }>;
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
  const sorted = files.toSorted((a, b) => {
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });
  return `${base}\n${proposed}\n${JSON.stringify(sorted.map((f) => [f.path, f.content, f.mode, f.previousMode]))}`;
}
export const approvalDecisionSchema = z.object({
  id: z.uuid(),
  digest: z.string(),
  decision: z.enum(['approve', 'deny']),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export const conversationUsageSchema = z.object({
  version: z.number().int().nonnegative(),
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  prices: modelPriceSchema.optional(),
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
  revision: number;
  newWorkUnavailable?: string;
  blocked?: boolean;
  budgetStop?: { message: string };
  unconfirmedCost?: number;
  accountingWarning?: string;
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
    complete?: boolean;
    decision?: boolean;
    error?: string;
  };
}
/** Generic durable gate. Product-specific proposals and decisions belong to PL. */
export interface PendingTool {
  id: string;
  name: string;
  args?: unknown;
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
  readonly code: string;
  constructor(status: number, message: string, code = 'unavailable') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const agentSnapshotSchema = z.object({
  messages: z.array(z.unknown()),
  revision: z.number().int().nonnegative(),
  blocked: z.boolean(),
  budgetStop: z.object({ message: z.string() }).optional(),
  unconfirmedCost: z.number().nonnegative().optional(),
  accountingWarning: z.string().optional(),
  conversationUsage: conversationUsageSchema,
  pendingTool: z
    .object({
      id: z.uuid(),
      name: z.string(),
      args: z.unknown().optional(),
      result: z.string().optional(),
      resultSuccess: z.boolean().optional(),
      prepared: z.boolean().optional(),
      error: z.string().optional(),
    })
    .optional(),
  executions: z.record(
    z.string(),
    z.object({
      dispatchId: z.uuid().optional(),
      status: z.enum(['running', 'completed', 'cancelled', 'failed', 'interrupted']),
    }),
  ),
});
export const conversationExportSchema = z.object({
  version: z.literal(1),
  conversationId: z.uuid(),
  exportedAt: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  messages: z.array(z.unknown()),
  usage: conversationUsageSchema,
  diagnostics: sandboxDiagnosticsSchema,
});
export type ConversationExport = z.infer<typeof conversationExportSchema>;
export const historyPageSchema = z.object({
  messages: z.array(z.unknown()).max(100),
  nextCursor: z.string().max(200).nullable(),
});
