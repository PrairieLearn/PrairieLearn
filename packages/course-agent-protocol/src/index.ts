import { z } from 'zod';

/*
 * Shared message contracts for the separately deployed PL server and Worker.
 * These schemas validate message shape, not permission to run or inspect an agent.
 * Keep wire changes compatible while the two deployments may be on different versions.
 */
export const COURSE_AGENT_WORKSPACE_ROOT = '/workspace';
export const COURSE_AGENT_SEED_FILE = `${COURSE_AGENT_WORKSPACE_ROOT}/README.md`;

export const CourseAgentEventTypeSchema = z.enum([
  'user.message',
  'sandbox.starting',
  'sandbox.ready',
  'sandbox.destroyed',
  'workspace.seeded',
  'agent.started',
  'assistant.delta',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'agent.completed',
  'usage.updated',
  'run.failed',
  'state.changed',
]);
export type CourseAgentEventType = z.infer<typeof CourseAgentEventTypeSchema>;

export const CourseAgentEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: CourseAgentEventTypeSchema,
  occurredAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type CourseAgentEvent = z.infer<typeof CourseAgentEventSchema>;

export const CourseAgentRuntimeStatusSchema = z.enum([
  'offline',
  'starting',
  'running',
  'waiting_for_user',
  'failed',
]);
export type CourseAgentRuntimeStatus = z.infer<typeof CourseAgentRuntimeStatusSchema>;

export const CourseAgentConversationStateSchema = z.enum([
  'working',
  'waiting_for_user',
  'validating_change',
  'waiting_for_approval',
  'publishing',
  'syncing',
  'refreshing_workspace',
  'resuming_agent',
  'failed',
]);
export type CourseAgentConversationState = z.infer<typeof CourseAgentConversationStateSchema>;

export const CourseAgentSandboxStateSchema = z.enum(['offline', 'starting', 'ready', 'suspending']);
export type CourseAgentSandboxState = z.infer<typeof CourseAgentSandboxStateSchema>;

const CourseAgentIdentitySchema = z.object({
  userId: z.string(),
  courseId: z.string(),
  conversationId: z.uuid(),
  sandboxId: z.string().min(1).max(120),
});

export const CourseAgentRuntimeSettingsSchema = z.object({
  idleTimeoutSeconds: z.number().int().min(60).max(86_400),
  sleepAfterSeconds: z.number().int().min(60).max(86_400).default(21_600),
  turnTimeoutSeconds: z.number().int().min(60).max(86_400).default(21_600),
});
export type CourseAgentRuntimeSettings = z.infer<typeof CourseAgentRuntimeSettingsSchema>;

export const CourseAgentRunCapabilitySchema = CourseAgentIdentitySchema.extend({
  type: z.literal('course-agent-run'),
  runId: z.uuid(),
  promptDigest: z.string().regex(/^[0-9a-f]{64}$/),
  runtimeSettings: CourseAgentRuntimeSettingsSchema,
  expiresAt: z.iso.datetime(),
});
export type CourseAgentRunCapability = z.infer<typeof CourseAgentRunCapabilitySchema>;

export const CourseAgentInspectCapabilitySchema = CourseAgentIdentitySchema.extend({
  type: z.literal('course-agent-inspect'),
  expiresAt: z.iso.datetime(),
});
export type CourseAgentInspectCapability = z.infer<typeof CourseAgentInspectCapabilitySchema>;

export const CourseAgentStartRunRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.uuid(),
  runId: z.uuid(),
  sandboxId: z.string().min(1).max(120),
  prompt: z
    .string()
    .max(20_000)
    .refine((prompt) => prompt.trim().length > 0, 'Prompt cannot be blank'),
  runtimeSettings: CourseAgentRuntimeSettingsSchema,
});
export type CourseAgentStartRunRequest = z.infer<typeof CourseAgentStartRunRequestSchema>;

export const CourseAgentStartRunResponseSchema = z.object({
  accepted: z.literal(true),
  conversationId: z.uuid(),
  runId: z.uuid(),
  sandboxId: z.string(),
});
export type CourseAgentStartRunResponse = z.infer<typeof CourseAgentStartRunResponseSchema>;

export const CourseAgentSnapshotRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.uuid(),
  sandboxId: z.string().min(1).max(120),
});
export type CourseAgentSnapshotRequest = z.infer<typeof CourseAgentSnapshotRequestSchema>;

export const CourseAgentSnapshotSchema = z.object({
  conversationId: z.uuid(),
  sandboxId: z.string(),
  activeRunId: z.uuid().nullable(),
  status: CourseAgentRuntimeStatusSchema,
  conversationState: CourseAgentConversationStateSchema.nullable().default(null),
  sandboxState: CourseAgentSandboxStateSchema.nullable().default(null),
  revision: z.number().int().nonnegative().default(0),
  sandboxGeneration: z.number().int().nonnegative().default(0),
  idleExpiresAt: z.number().nullable().default(null),
  activeRunExpiresAt: z.string().nullable().default(null),
  processId: z.string().nullable().default(null),
  response: z.string().nullable(),
  error: z.string().nullable(),
  events: z.array(CourseAgentEventSchema),
});
export type CourseAgentSnapshot = z.infer<typeof CourseAgentSnapshotSchema>;

export function courseAgentSandboxId(conversationId: string) {
  return `course-agent-${z.uuid().parse(conversationId).toLowerCase()}`;
}
