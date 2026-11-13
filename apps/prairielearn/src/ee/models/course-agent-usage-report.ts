import { z } from 'zod';

import type { UsageReport } from '@prairielearn/course-agent-types';
import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';

import type { CourseAgentConversation } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** A retried report has the same ID, so it is recorded once. */
export async function insertCourseAgentUsageReport({
  conversation,
  report,
  cost,
}: {
  conversation: CourseAgentConversation;
  report: UsageReport;
  cost: number;
}) {
  await execute(sql.insert_usage_report, {
    course_agent_conversation_id: conversation.id,
    user_id: conversation.user_id,
    report_id: report.reportId,
    model: report.model,
    input_tokens: report.usage.inputTokens,
    input_tokens_cache_read: report.usage.cachedInputTokens,
    input_tokens_cache_write: report.usage.cacheWriteInputTokens,
    output_tokens: report.usage.outputTokens,
    output_tokens_reasoning: report.usage.reasoningTokens,
    web_search_calls: report.usage.webSearchCalls,
    cost,
  });
}

export async function selectCourseAgentUserCostSince({
  user_id,
  since,
}: {
  user_id: string;
  since: Date;
}) {
  return await queryScalar(sql.select_user_cost_since, { user_id, since }, z.number());
}

export const CourseAgentConversationUsageSchema = z.object({
  input_tokens: z.coerce.number(),
  input_tokens_cache_read: z.coerce.number(),
  input_tokens_cache_write: z.coerce.number(),
  output_tokens: z.coerce.number(),
  output_tokens_reasoning: z.coerce.number(),
  web_search_calls: z.coerce.number(),
  cost: z.number(),
});

export async function selectCourseAgentConversationUsage(course_agent_conversation_id: string) {
  return await queryRow(
    sql.select_conversation_usage,
    { course_agent_conversation_id },
    CourseAgentConversationUsageSchema,
  );
}
