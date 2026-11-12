import type { UsageDecision, UsageReport } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

import { calculateResponseCost } from '../../../lib/ai-util.js';
import { config } from '../../../lib/config.js';
import { selectOptionalCourseAgentConversationByAgentId } from '../../models/course-agent-conversation.js';
import {
  insertCourseAgentUsageReport,
  selectCourseAgentUserCostSince,
} from '../../models/course-agent-usage-report.js';

const HOUR_MILLISECONDS = 60 * 60 * 1000;

function priceUsage(report: UsageReport) {
  if (!Object.hasOwn(config.costPerMillionTokens, report.model)) {
    throw new HttpStatusError(400, 'The model has no configured price.');
  }
  const model = report.model as keyof typeof config.costPerMillionTokens;
  const {
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens,
    reasoningTokens,
    webSearchCalls,
  } = report.usage;
  const tokens = calculateResponseCost({
    model,
    usage: {
      inputTokens,
      inputTokenDetails: {
        noCacheTokens: inputTokens - cachedInputTokens - cacheWriteInputTokens,
        cacheReadTokens: cachedInputTokens,
        cacheWriteTokens: cacheWriteInputTokens,
      },
      outputTokens,
      outputTokenDetails: { textTokens: outputTokens - reasoningTokens, reasoningTokens },
      totalTokens: inputTokens + outputTokens,
    },
  });
  return tokens + webSearchCalls * config.courseAgentWebSearchCallCostDollars;
}

/**
 * Record a usage report once and decide whether the next model request may run. Spending is
 * limited per user per UTC hour, across courses and conversations. A retried report is
 * recognized by its ID and gets a fresh decision without being counted again.
 */
export async function recordCourseAgentUsageReport(
  agentId: string,
  report: UsageReport,
): Promise<UsageDecision> {
  const conversation = await selectOptionalCourseAgentConversationByAgentId(agentId);
  if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
  const cost = priceUsage(report);
  // A report that only asks for a decision is not worth a row.
  if (cost > 0) await insertCourseAgentUsageReport({ conversation, report, cost });
  const hourStart = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const spent = await selectCourseAgentUserCostSince({
    user_id: conversation.user_id,
    since: new Date(hourStart),
  });
  if (spent >= config.courseAgentRateLimitDollars) {
    return { status: 'limited', retryAt: new Date(hourStart + HOUR_MILLISECONDS).toISOString() };
  }
  return { status: 'allowed' };
}
