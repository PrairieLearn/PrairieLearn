import {
  type BudgetRequest,
  type BudgetResponse,
  budgetResponseStatus,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { selectUserAuthnData } from '../../../lib/authn.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import {
  recordCourseAgentConversationUsage,
  selectOptionalCourseAgentConversationByAgentIdForUpdate,
} from '../../models/course-agent-conversation.js';

import { courseAgentEnabled } from './access.js';
import { addCourseAgentCostToIntervalUsage, allocateCourseAgentBudget } from './budget-policy.js';

export async function applyCourseAgentBudgetRequest(agentId: string, request: BudgetRequest) {
  const report = await runInTransactionAsync(async () => {
    const conversation = await selectOptionalCourseAgentConversationByAgentIdForUpdate(agentId);
    if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
    // TODO: Recover replies lost after commit so the DO can receive its credit
    // without counting usage twice. For now, duplicate reports are rejected.
    // https://github.com/PrairieLearn/PrairieLearn/issues/15684
    if (request.usageReportCount !== conversation.usage_report_count + 1) {
      throw new HttpStatusError(409, 'The usage report is out of order.');
    }
    let allocation: BudgetResponse['allocation'] = { status: 'not_requested' };
    if (request.requestCredit) {
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
      const allowed =
        course !== null &&
        (await courseAgentEnabled({
          course,
          institution,
          authn_user: user,
          authz_data: {
            has_course_permission_own: authzData.has_course_permission_own,
            authn_has_course_permission_own: authzData.has_course_permission_own,
          },
        }));
      if (!allowed) {
        allocation = { status: 'denied', reason: 'not_allowed' };
      } else {
        allocation = await allocateCourseAgentBudget(user.id, request.usageDelta.costMilliDollars);
      }
    }
    const body: BudgetResponse = { usageReportCount: request.usageReportCount, allocation };
    await recordCourseAgentConversationUsage(conversation.id, request);
    return {
      body,
      userId: conversation.user_id,
      costMilliDollars: request.usageDelta.costMilliDollars,
    };
  });
  // SQL is authoritative. Commit before updating the soft Redis limit so a retry
  // cannot double-count durable usage. Redis failures may leave the hour undercounted.
  if (report.costMilliDollars > 0) {
    await addCourseAgentCostToIntervalUsage(report.userId, report.costMilliDollars);
  }
  return { status: budgetResponseStatus(report.body), body: report.body };
}
