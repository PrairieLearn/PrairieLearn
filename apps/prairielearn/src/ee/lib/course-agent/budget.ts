import { isDeepStrictEqual } from 'node:util';

import {
  type BudgetRequest,
  type BudgetResponse,
  BudgetResponseSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { selectCoursePermissionForUser } from '../../../models/course-permissions.js';
import { selectOptionalCourseById } from '../../../models/course.js';
import { selectInstitutionForCourse } from '../../../models/institution.js';
import { selectUserById } from '../../../models/user.js';
import {
  recordCourseAgentConversationUsage,
  selectOptionalCourseAgentConversationByAgentIdForUpdate,
} from '../../models/course-agent-conversation.js';

import { courseAgentEnabled } from './access.js';
import { addCourseAgentCostToIntervalUsage, allocateCourseAgentBudget } from './budget-policy.js';

function budgetResult(body: BudgetResponse) {
  const allocation = body.allocation;
  const status =
    allocation.status !== 'denied' ? 200 : allocation.reason === 'hourly_limit' ? 429 : 403;
  return { status, body };
}

export async function applyCourseAgentBudgetRequest(agentId: string, request: BudgetRequest) {
  const report = await runInTransactionAsync(async () => {
    const conversation = await selectOptionalCourseAgentConversationByAgentIdForUpdate(agentId);
    if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
    // The DO sends one report at a time, so only its latest acknowledgement is needed.
    if (request.sequence === conversation.usage_report_sequence) {
      if (!isDeepStrictEqual(conversation.usage_report_request, request)) {
        throw new HttpStatusError(409, 'The usage report changed.');
      }
      return {
        ...budgetResult(BudgetResponseSchema.parse(conversation.usage_report_response)),
        userId: conversation.user_id,
        costMilliDollars: 0,
      };
    }
    if (request.sequence !== conversation.usage_report_sequence + 1) {
      throw new HttpStatusError(409, 'The usage report is out of order.');
    }
    let allocation: BudgetResponse['allocation'] = { status: 'not_requested' };
    if (request.requestCredit) {
      const user = await selectUserById(conversation.user_id);
      const course = await selectOptionalCourseById(conversation.course_id);
      const permission = await selectCoursePermissionForUser({
        course_id: conversation.course_id,
        user_id: user.id,
      });
      const allowed =
        course !== null &&
        course.deleted_at === null &&
        (await courseAgentEnabled({
          course,
          institution: await selectInstitutionForCourse({ course_id: course.id }),
          authn_user: user,
          authz_data: {
            has_course_permission_own: permission === 'Owner',
            authn_has_course_permission_own: permission === 'Owner',
          },
        }));
      if (!allowed) {
        allocation = { status: 'denied', reason: 'not_allowed', retryAt: null };
      } else {
        const credit = await allocateCourseAgentBudget(
          user.id,
          request.usageDelta.costMilliDollars,
        );
        const window = { startsAt: credit.startsAt, endsAt: credit.endsAt };
        allocation =
          credit.amount > 0
            ? { status: 'granted', grantedMilliDollars: credit.amount, window }
            : { status: 'denied', reason: 'hourly_limit', retryAt: window.endsAt, window };
      }
    }
    const body: BudgetResponse = { sequence: request.sequence, allocation };
    await recordCourseAgentConversationUsage(conversation.id, request, body);
    return {
      ...budgetResult(body),
      userId: conversation.user_id,
      costMilliDollars: request.usageDelta.costMilliDollars,
    };
  });
  // SQL is authoritative. Commit before updating the soft Redis limit so a retry
  // cannot double-count durable usage. Redis failures may leave the hour undercounted.
  if (report.costMilliDollars > 0) {
    await addCourseAgentCostToIntervalUsage(report.userId, report.costMilliDollars);
  }
  return { status: report.status, body: report.body };
}
