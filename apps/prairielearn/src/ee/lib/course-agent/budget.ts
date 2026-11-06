import type { UsageDecision, UsageReport } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { runInTransactionAsync } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { calculateResponseCost } from '../../../lib/ai-util.js';
import { selectUserAuthnData } from '../../../lib/authn.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import { config } from '../../../lib/config.js';
import type { CourseAgentConversation, CourseAgentUsageReport } from '../../../lib/db-types.js';
import { selectOptionalCourseAgentConversationByAgentIdForUpdate } from '../../models/course-agent-conversation.js';
import {
  insertCourseAgentUsageReport,
  selectCourseAgentUsageReport,
  selectCourseAgentUserCostSince,
} from '../../models/course-agent-usage-report.js';

import { courseAgentEnabled } from './access.js';

const HOUR_MILLISECONDS = 60 * 60 * 1000;
// Spending is limited per user per UTC hour, across courses and conversations.
const HOURLY_LIMIT_MILLI_DOLLARS = 50_000;

function priceUsage(report: UsageReport) {
  if (!Object.hasOwn(config.costPerMillionTokens, report.model)) {
    throw new HttpStatusError(400, 'The model has no configured price.');
  }
  const model = report.model as keyof typeof config.costPerMillionTokens;
  const { inputTokens, cachedInputTokens, outputTokens, reasoningTokens } = report.usage;
  const dollars = calculateResponseCost({
    model,
    usage: {
      inputTokens,
      inputTokenDetails: {
        noCacheTokens: inputTokens - cachedInputTokens,
        cacheReadTokens: cachedInputTokens,
        cacheWriteTokens: 0,
      },
      outputTokens,
      outputTokenDetails: { textTokens: outputTokens - reasoningTokens, reasoningTokens },
      totalTokens: inputTokens + outputTokens,
    },
  });
  return Math.ceil(dollars * 1000);
}

function sameReport(recorded: CourseAgentUsageReport, report: UsageReport) {
  return (
    recorded.model === report.model &&
    recorded.input_tokens === report.usage.inputTokens &&
    recorded.input_tokens_cache_read === report.usage.cachedInputTokens &&
    recorded.output_tokens === report.usage.outputTokens &&
    recorded.output_tokens_reasoning === report.usage.reasoningTokens
  );
}

/** Ownership and the feature flag are checked again for each report, outside a browser request. */
async function conversationAllowed(conversation: CourseAgentConversation) {
  const { user, is_administrator } = await selectUserAuthnData(conversation.user_id);
  const { course, institution, authzData } = await constructCourseOrInstanceContext({
    user,
    course_id: conversation.course_id,
    course_instance_id: null,
    is_administrator,
    ip: null,
    req_date: new Date(),
    // Background accounting checks ownership without a browser's exam context.
    overrides: { mode: 'Public' },
  });
  return (
    course !== null &&
    (await courseAgentEnabled({
      course,
      institution,
      authn_user: user,
      authz_data: {
        has_course_permission_own: authzData.has_course_permission_own,
        authn_has_course_permission_own: authzData.has_course_permission_own,
      },
    }))
  );
}

/**
 * Record a usage report once and decide whether the next model request may run. A retried
 * report is recognized by its ID and gets a fresh decision without being counted again.
 */
export async function recordCourseAgentUsageReport(
  agentId: string,
  report: UsageReport,
): Promise<UsageDecision> {
  return await runInTransactionAsync(async () => {
    const conversation = await selectOptionalCourseAgentConversationByAgentIdForUpdate(agentId);
    if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
    const inserted = await insertCourseAgentUsageReport({
      conversation,
      report,
      cost_milli_dollars: priceUsage(report),
    });
    if (!inserted) {
      const recorded = await selectCourseAgentUsageReport({
        course_agent_conversation_id: conversation.id,
        report_id: report.reportId,
      });
      // A retry resends identical usage; anything else means the service has a bug. The first
      // recording stands either way, so a retry never changes what was counted.
      if (!sameReport(recorded, report)) {
        const error = new Error('A course agent usage report was resent with different usage.');
        logger.error(error.message, { agentId, reportId: report.reportId });
        Sentry.captureException(error);
      }
    }
    if (!(await conversationAllowed(conversation))) {
      return { status: 'denied', reason: 'not_allowed' };
    }
    const hourStart = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
    const spent = await selectCourseAgentUserCostSince({
      user_id: conversation.user_id,
      since: new Date(hourStart),
    });
    if (spent >= HOURLY_LIMIT_MILLI_DOLLARS) {
      return {
        status: 'denied',
        reason: 'hourly_limit',
        retryAt: new Date(hourStart + HOUR_MILLISECONDS).toISOString(),
      };
    }
    return { status: 'allowed' };
  });
}
