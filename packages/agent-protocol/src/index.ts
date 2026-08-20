import { z } from 'zod';

const IdSchema = z.string().min(1).max(128);
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const AgentHarnessSchema = z.enum(['deterministic', 'claude']);
export type AgentHarness = z.infer<typeof AgentHarnessSchema>;

export const AgentRepositorySchema = z.object({
  https_url: z.url().refine((url) => url.startsWith('https://'), 'Repository URL must use HTTPS'),
  branch: z.string().min(1).max(255),
  base_sha: z.string().regex(/^[0-9a-f]{40}$/),
});
export type AgentRepository = z.infer<typeof AgentRepositorySchema>;

export const AgentToolNameSchema = z.enum([
  'list_entities',
  'read_course_file',
  'query_course_data',
  'render_question',
  'get_job_output',
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

export const AgentEventTypeSchema = z.enum([
  'run_started',
  'user_message',
  'assistant_message_delta',
  'assistant_message',
  'tool_call',
  'tool_result',
  'checkpoint',
  'approval_required',
  'run_cancelled',
  'run_failed',
  'run_completed',
]);
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentRunCapabilityClaimsSchema = z.object({
  iss: z.literal('prairielearn'),
  aud: z.union([
    z.enum(['prairielearn-agent-worker', 'prairielearn-agent-api']),
    z.array(z.enum(['prairielearn-agent-worker', 'prairielearn-agent-api'])).min(1),
  ]),
  sub: IdSchema,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jti: IdSchema,
  run_id: IdSchema,
  conversation_id: IdSchema,
  course_id: IdSchema,
  authn_user_id: IdSchema,
  user_id: IdSchema,
  allowed_tools: z.array(AgentToolNameSchema),
  purpose: z.enum(['run', 'control', 'delete', 'publish']),
  prompt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  prairielearn_base_url: z.url(),
  harness: AgentHarnessSchema,
  repository: AgentRepositorySchema.optional(),
});
export type AgentRunCapabilityClaims = z.infer<typeof AgentRunCapabilityClaimsSchema>;

export const AgentPublicationTargetSchema = z.object({
  https_url: z.url().refine((url) => url.startsWith('https://'), 'Repository URL must use HTTPS'),
  branch: z.string().min(1).max(255),
  head_sha: z.string().regex(/^[0-9a-f]{40}$/),
});
export type AgentPublicationTarget = z.infer<typeof AgentPublicationTargetSchema>;

export const AgentPublicationCapabilityClaimsSchema = AgentRunCapabilityClaimsSchema.extend({
  purpose: z.literal('publish'),
  operation_id: IdSchema,
  target: AgentPublicationTargetSchema,
});
export type AgentPublicationCapabilityClaims = z.infer<
  typeof AgentPublicationCapabilityClaimsSchema
>;

export const StartAgentRunRequestSchema = z.object({
  conversation_id: IdSchema,
  run_id: IdSchema,
  course_id: IdSchema,
  prompt: z.string().min(1).max(100_000),
  prairielearn_base_url: z.url(),
  harness: AgentHarnessSchema,
  repository: AgentRepositorySchema.optional(),
});
export type StartAgentRunRequest = z.infer<typeof StartAgentRunRequestSchema>;

export const AgentRunStatusSchema = z.enum([
  'queued',
  'running',
  'cancelling',
  'cancelled',
  'failed',
  'completed',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunStatusResponseSchema = z.object({
  conversation_id: IdSchema,
  run_id: IdSchema,
  status: AgentRunStatusSchema,
  sandbox_id: z.string().optional(),
  checkpoint_key: z.string().optional(),
  error: z.string().optional(),
});
export type AgentRunStatusResponse = z.infer<typeof AgentRunStatusResponseSchema>;

export const AgentEventInputSchema = z.object({
  event_id: IdSchema,
  type: AgentEventTypeSchema,
  data: JsonObjectSchema,
  operation_id: IdSchema.optional(),
});
export type AgentEventInput = z.infer<typeof AgentEventInputSchema>;

export const AppendAgentEventsRequestSchema = z.object({
  events: z.array(AgentEventInputSchema).min(1).max(100),
});
export type AppendAgentEventsRequest = z.infer<typeof AppendAgentEventsRequestSchema>;

export const AgentToolRequestSchema = z.object({
  operation_id: IdSchema,
  input: JsonObjectSchema,
  expected_revision: z.string().optional(),
});
export type AgentToolRequest = z.infer<typeof AgentToolRequestSchema>;

export const AgentToolResponseSchema = z.object({
  operation_id: IdSchema,
  event_id: IdSchema,
  result: JsonObjectSchema,
  checkpoint_revision: z.string().optional(),
});
export type AgentToolResponse = z.infer<typeof AgentToolResponseSchema>;

export const PublishAgentRunRequestSchema = z.object({
  operation_id: IdSchema,
  target: AgentPublicationTargetSchema,
});
export type PublishAgentRunRequest = z.infer<typeof PublishAgentRunRequestSchema>;

export const PublishAgentRunResponseSchema = z.object({
  operation_id: IdSchema,
  branch: z.string().min(1).max(255),
  head_sha: z.string().regex(/^[0-9a-f]{40}$/),
});
export type PublishAgentRunResponse = z.infer<typeof PublishAgentRunResponseSchema>;
