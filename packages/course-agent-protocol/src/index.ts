import { z } from 'zod';

export const COURSE_AGENT_WORKSPACE_ROOT = '/workspace';

export const CourseDataResourceSchema = z.enum([
  'course_instances',
  'students',
  'assessments',
  'assessment_attempts',
]);
export type CourseDataResource = z.infer<typeof CourseDataResourceSchema>;

export const CourseDataFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'datetime']);
export type CourseDataFieldType = z.infer<typeof CourseDataFieldTypeSchema>;

export const CourseDataFilterOperatorSchema = z.enum([
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'contains',
  'is_null',
]);
export type CourseDataFilterOperator = z.infer<typeof CourseDataFilterOperatorSchema>;

export const CourseDataResourceDescriptionSchema = z.object({
  resource: CourseDataResourceSchema,
  description: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      type: CourseDataFieldTypeSchema,
      description: z.string(),
      filterOperators: z.array(CourseDataFilterOperatorSchema),
      aggregatable: z.boolean(),
    }),
  ),
});
export type CourseDataResourceDescription = z.infer<typeof CourseDataResourceDescriptionSchema>;

const CourseDataScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const CourseDataQuerySchema = z
  .object({
    resource: CourseDataResourceSchema,
    select: z.array(z.string().min(1)).max(30).default([]),
    where: z
      .array(
        z.object({
          field: z.string().min(1),
          op: CourseDataFilterOperatorSchema,
          value: z.union([CourseDataScalarSchema, z.array(CourseDataScalarSchema).max(100)]),
        }),
      )
      .max(30)
      .default([]),
    groupBy: z.array(z.string().min(1)).max(10).default([]),
    metrics: z
      .array(
        z.object({
          op: z.enum(['count', 'count_distinct', 'sum', 'min', 'max', 'avg']),
          field: z.string().min(1).optional(),
          as: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        }),
      )
      .max(10)
      .default([]),
    orderBy: z
      .array(
        z.object({
          field: z.string().min(1),
          direction: z.enum(['asc', 'desc']),
        }),
      )
      .max(10)
      .default([]),
    limit: z.number().int().positive().max(50_000).default(1000),
  })
  .superRefine((query, ctx) => {
    if (query.select.length === 0 && query.groupBy.length === 0 && query.metrics.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select at least one field, grouping field, or metric.',
      });
    }
    for (const metric of query.metrics) {
      if (metric.op !== 'count' && metric.field === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `Metric "${metric.as}" requires a field.`,
        });
      }
    }
  });
export type CourseDataQuery = z.infer<typeof CourseDataQuerySchema>;

export const CourseDataQueryResultSchema = z.object({
  queryId: z.string(),
  resource: CourseDataResourceSchema,
  columns: z.array(z.object({ name: z.string(), type: CourseDataFieldTypeSchema })),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type CourseDataQueryResult = z.infer<typeof CourseDataQueryResultSchema>;

export const CourseAgentRuntimeStatusSchema = z.enum([
  'unallocated',
  'booting',
  'preparing',
  'cloning',
  'restoring',
  'ready',
  'running',
  'finalizing',
  'syncing',
  'checkpointing',
  'destroying',
  'offline',
  'error',
]);
export type CourseAgentRuntimeStatus = z.infer<typeof CourseAgentRuntimeStatusSchema>;

export const CourseAgentRunStatusSchema = z.enum([
  'queued',
  'preparing',
  'running',
  'finalizing',
  'syncing',
  'checkpointing',
  'completed',
  'failed',
  'canceled',
]);
export type CourseAgentRunStatus = z.infer<typeof CourseAgentRunStatusSchema>;

export const CourseAgentMessageRoleSchema = z.enum(['user', 'assistant']);
export type CourseAgentMessageRole = z.infer<typeof CourseAgentMessageRoleSchema>;

export const CourseAgentMessageStatusSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'errored',
  'canceled',
]);
export type CourseAgentMessageStatus = z.infer<typeof CourseAgentMessageStatusSchema>;

export const CourseAgentBackupReasonSchema = z.enum([
  'idle_timeout',
  'test_kill',
  'conversation_deleted',
]);
export type CourseAgentBackupReason = z.infer<typeof CourseAgentBackupReasonSchema>;

export const CourseAgentEventTypeSchema = z.enum([
  'conversation.created',
  'run.created',
  'sandbox.requested',
  'sandbox.booting',
  'sandbox.ready',
  'sandbox.idle_timeout',
  'sandbox.destroying',
  'sandbox.destroyed',
  'sandbox.test_kill_requested',
  'workspace.created',
  'workspace.restore.started',
  'workspace.restore.completed',
  'workspace.backup.started',
  'workspace.backup.completed',
  'git.clone.started',
  'git.clone.completed',
  'git.fetch.started',
  'git.fetch.completed',
  'git.commit.started',
  'git.commit.completed',
  'git.push.started',
  'git.push.completed',
  'agent.started',
  'agent.completed',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'sync.started',
  'sync.completed',
  'run.completed',
  'run.failed',
]);
export type CourseAgentEventType = z.infer<typeof CourseAgentEventTypeSchema>;

export const CourseAgentEventSchema = z.object({
  eventId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  type: CourseAgentEventTypeSchema,
  occurredAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type CourseAgentEvent = z.infer<typeof CourseAgentEventSchema>;

const WorkspaceDirectorySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/);

export const CourseAgentCapabilitySchema = z.object({
  type: z.literal('course-agent-run'),
  userId: z.string(),
  courseId: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  sandboxId: z.string(),
  promptDigest: z.string(),
  repository: z.string(),
  branch: z.string(),
  callbackOrigin: z.url(),
  expiresAt: z.iso.datetime(),
});
export type CourseAgentCapability = z.infer<typeof CourseAgentCapabilitySchema>;

export const CourseAgentControlCapabilitySchema = z.object({
  type: z.literal('course-agent-control'),
  userId: z.string(),
  courseId: z.string(),
  conversationId: z.string(),
  sandboxId: z.string(),
  action: z.enum(['inspect', 'kill', 'cancel']),
  expiresAt: z.iso.datetime(),
});
export type CourseAgentControlCapability = z.infer<typeof CourseAgentControlCapabilitySchema>;

export const CourseAgentStartRunRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.string(),
  runId: z.string(),
  sandboxId: z.string(),
  prompt: z.string().min(1),
  course: z.object({
    id: z.string(),
    directory: WorkspaceDirectorySchema,
    repository: z.string().min(1),
    branch: z.string().min(1),
    expectedSha: z.string().nullable(),
  }),
  callbackOrigin: z.url(),
  localDevelopment: z.boolean(),
  workspaceBackup: z
    .object({
      id: z.string(),
      dir: z.string(),
      localBucket: z.boolean().optional(),
    })
    .nullable(),
});
export type CourseAgentStartRunRequest = z.infer<typeof CourseAgentStartRunRequestSchema>;

export const CourseAgentStartRunResponseSchema = z.object({
  accepted: z.literal(true),
  conversationId: z.string(),
  runId: z.string(),
  sandboxId: z.string(),
});
export type CourseAgentStartRunResponse = z.infer<typeof CourseAgentStartRunResponseSchema>;

export const CourseAgentCallbackRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.string(),
  runId: z.string(),
  sandboxId: z.string(),
  event: CourseAgentEventSchema,
});
export type CourseAgentCallbackRequest = z.infer<typeof CourseAgentCallbackRequestSchema>;

export const CourseAgentKillRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.string(),
  sandboxId: z.string(),
  hard: z.boolean(),
  reason: z.enum(['test_kill', 'conversation_deleted']).default('test_kill'),
});
export type CourseAgentKillRequest = z.infer<typeof CourseAgentKillRequestSchema>;

export const CourseAgentSyncRequestSchema = z.object({
  capability: z.string().min(1),
  conversationId: z.string(),
  runId: z.string(),
  sandboxId: z.string(),
  pushedSha: z.string().min(1),
});
export type CourseAgentSyncRequest = z.infer<typeof CourseAgentSyncRequestSchema>;

export function makeCourseWorkspacePath(directory: string) {
  return `${COURSE_AGENT_WORKSPACE_ROOT}/${WorkspaceDirectorySchema.parse(directory)}`;
}

export function normalizeCourseWorkspaceDirectory(shortName: string) {
  const normalized = shortName
    .normalize('NFKD')
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 120);
  return WorkspaceDirectorySchema.parse(normalized || 'course');
}
