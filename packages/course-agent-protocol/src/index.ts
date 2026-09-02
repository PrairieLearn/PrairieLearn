import { z } from 'zod';

export const COURSE_AGENT_WORKSPACE_ROOT = '/workspace';
export const COURSE_AGENT_SEED_FILE = `${COURSE_AGENT_WORKSPACE_ROOT}/README.md`;

export const CourseAgentEventTypeSchema = z.enum([
  'sandbox.starting',
  'sandbox.ready',
  'workspace.seeded',
  'git.clone.started',
  'git.clone.completed',
  'git.configured',
  'agent.started',
  'assistant.delta',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'agent.completed',
  'run.failed',
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
  'starting',
  'running',
  'waiting_for_user',
  'failed',
]);
export type CourseAgentRuntimeStatus = z.infer<typeof CourseAgentRuntimeStatusSchema>;

const CourseAgentIdentitySchema = z.object({
  userId: z.string(),
  courseId: z.string(),
  conversationId: z.uuid(),
  sandboxId: z.string().min(1).max(120),
});

export const CourseAgentRepositorySchema = z.object({
  repository: z.string().min(1),
  branch: z.string().min(1).max(255),
  expectedSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
});
export type CourseAgentRepository = z.infer<typeof CourseAgentRepositorySchema>;

export const CourseAgentRunCapabilitySchema = CourseAgentIdentitySchema.extend({
  type: z.literal('course-agent-run'),
  runId: z.uuid(),
  promptDigest: z.string().regex(/^[0-9a-f]{64}$/),
  repository: z.string(),
  branch: z.string(),
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
  prompt: z.string().trim().min(1).max(20_000),
  course: CourseAgentRepositorySchema,
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
  response: z.string().nullable(),
  error: z.string().nullable(),
  events: z.array(CourseAgentEventSchema),
});
export type CourseAgentSnapshot = z.infer<typeof CourseAgentSnapshotSchema>;

export function courseAgentSandboxId(conversationId: string) {
  return `course-agent-${z.uuid().parse(conversationId)}`;
}
