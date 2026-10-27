import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';

import {
  type BudgetRequest,
  type BudgetResponse,
  BudgetResponseSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { CourseAgentBudgetRequestSchema } from '../../../lib/db-types.js';
import { selectCoursePermissionForUser } from '../../../models/course-permissions.js';
import { selectOptionalCourseById } from '../../../models/course.js';
import { selectInstitutionForCourse } from '../../../models/institution.js';
import { selectAndLockUser } from '../../../models/user.js';
import {
  addCourseAgentConversationUsage,
  selectOptionalCourseAgentConversationByAgentId,
} from '../../models/course-agent-conversation.js';

import { courseAgentEnabled } from './access.js';
import { allocateCourseAgentBudget } from './budget-policy.js';

const sql = loadSqlEquiv(import.meta.url);

export async function applyCourseAgentBudgetRequest(agentId: string, request: BudgetRequest) {
  // Final usage still belongs in the ledger after its course is soft-deleted.
  const conversation = await selectOptionalCourseAgentConversationByAgentId(agentId, {
    includeDeletedCourse: true,
  });
  if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
  return runInTransactionAsync(async () => {
    const user = await selectAndLockUser(conversation.user_id);
    const receipt = await queryOptionalRow(
      sql.select_receipt,
      { conversation_id: conversation.id, sequence: request.sequence },
      CourseAgentBudgetRequestSchema,
    );
    if (receipt) {
      if (!isDeepStrictEqual(receipt.request, request)) {
        throw new HttpStatusError(409, 'The usage report changed.');
      }
      return { status: receipt.http_status, body: BudgetResponseSchema.parse(receipt.response) };
    }
    const next = await queryScalar(
      sql.select_next_sequence,
      { conversation_id: conversation.id },
      z.coerce.number(),
    );
    if (request.sequence !== next) {
      throw new HttpStatusError(409, 'The usage report is out of order.');
    }
    const now = Date.now();
    const startsAt = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
    let allocation: BudgetResponse['allocation'] = { status: 'not_requested' };
    let status = 200;
    if (request.requestCredit) {
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
        status = 403;
        allocation = { status: 'denied', reason: 'not_allowed', retryAt: null };
      } else {
        const allocated = await queryScalar(
          sql.select_allocated,
          { user_id: user.id, window_start: startsAt },
          z.coerce.number(),
        );
        const amount = allocateCourseAgentBudget(allocated);
        if (amount > 0) {
          allocation = {
            status: 'granted',
            grantedMilliDollars: amount,
            window: { startsAt, endsAt },
          };
        } else {
          status = 429;
          allocation = {
            status: 'denied',
            reason: 'hourly_limit',
            retryAt: endsAt,
            window: { startsAt, endsAt },
          };
        }
      }
    }
    const body: BudgetResponse = { sequence: request.sequence, allocation };
    await addCourseAgentConversationUsage(conversation.id, request.usageDelta);
    await execute(sql.insert_receipt, {
      conversation_id: conversation.id,
      user_id: user.id,
      sequence: request.sequence,
      window_start: startsAt,
      request,
      response: body,
      http_status: status,
      granted_milli_dollars: allocation.status === 'granted' ? allocation.grantedMilliDollars : 0,
    });
    return { status, body };
  });
}
