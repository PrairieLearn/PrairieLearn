import { z } from 'zod';

import type { UsageReport } from '@prairielearn/course-agent-types';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type CourseAgentConversation, CourseAgentUsageReportSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Returns false when this report was already recorded, so a retry is not counted twice. */
export async function insertCourseAgentUsageReport({
  conversation,
  report,
  cost_milli_dollars,
}: {
  conversation: CourseAgentConversation;
  report: UsageReport;
  cost_milli_dollars: number;
}) {
  const inserted = await queryOptionalRow(
    sql.insert_usage_report,
    {
      course_agent_conversation_id: conversation.id,
      user_id: conversation.user_id,
      report_id: report.reportId,
      model: report.model,
      input_tokens: report.usage.inputTokens,
      input_tokens_cache_read: report.usage.cachedInputTokens,
      output_tokens: report.usage.outputTokens,
      output_tokens_reasoning: report.usage.reasoningTokens,
      cost_milli_dollars,
    },
    z.object({ id: IdSchema }),
  );
  return inserted !== null;
}

export async function selectCourseAgentUsageReport({
  course_agent_conversation_id,
  report_id,
}: {
  course_agent_conversation_id: string;
  report_id: string;
}) {
  return await queryRow(
    sql.select_usage_report,
    { course_agent_conversation_id, report_id },
    CourseAgentUsageReportSchema,
  );
}

export async function selectCourseAgentUserCostSince({
  user_id,
  since,
}: {
  user_id: string;
  since: Date;
}) {
  return await queryScalar(sql.select_user_cost_since, { user_id, since }, z.coerce.number());
}

export const CourseAgentConversationUsageSchema = z.object({
  input_tokens: z.coerce.number(),
  input_tokens_cache_read: z.coerce.number(),
  output_tokens: z.coerce.number(),
  output_tokens_reasoning: z.coerce.number(),
  cost_milli_dollars: z.coerce.number(),
});

export async function selectCourseAgentConversationUsage(course_agent_conversation_id: string) {
  return await queryRow(
    sql.select_conversation_usage,
    { course_agent_conversation_id },
    CourseAgentConversationUsageSchema,
  );
}
