import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { CourseAgentConversationSchema, CourseAgentExecutionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);
export const selectOptionalExecution = (conversation_id: string, operation_id: string) =>
  queryOptionalRow(sql.existing, { conversation_id, operation_id }, CourseAgentExecutionSchema);
export const selectExecutions = (conversation_id: string) =>
  queryRows(sql.list, { conversation_id }, CourseAgentExecutionSchema);
export const selectUsageStats = (course_id: string, user_id: string) =>
  queryRow(
    sql.stats,
    { course_id, user_id },
    z.object({
      user_active: z.number(),
      course_active: z.number(),
      cost: z.number(),
      unknown_cost: z.number(),
    }),
  );
export const selectRecentRequests = (user_id: string) =>
  queryRow(sql.recent, { user_id }, z.object({ requests: z.number() }));
export const selectActiveExecution = (conversation_id: string) =>
  queryRow(sql.active, { conversation_id }, z.object({ active: z.boolean() }));
export const insertExecution = (
  conversation_id: string,
  operation_id: string,
  retry_result = false,
) => execute(sql.insert, { conversation_id, operation_id, retry_result });
export const saveExecutions = (
  conversation_id: string,
  updates: {
    operation_id: string;
    dispatch_id: string;
    status: string;
    input: number | null;
    cached: number | null;
    output: number | null;
    cost: number | null;
    model: string;
    pricing: { input: number; cachedInput: number; output: number } | null;
  }[],
) => execute(sql.update, { conversation_id, updates: JSON.stringify(updates) });
export const selectUsageSummary = (conversation_id: string) =>
  queryRow(
    sql.summary,
    { conversation_id },
    z.object({
      input: z.number().nullable(),
      output: z.number().nullable(),
      estimatedCost: z.number().nullable(),
    }),
  );

export const selectActiveConversations = (course_id: string, user_id: string) =>
  queryRows(sql.active_conversations, { course_id, user_id }, CourseAgentConversationSchema);

export const rejectExecution = (
  conversation_id: string,
  operation_id: string,
  dispatch_id: string | null = null,
) => execute(sql.reject, { conversation_id, operation_id, dispatch_id });
