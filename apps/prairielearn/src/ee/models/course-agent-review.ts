import { z } from 'zod';

import type { RequestChangesResult } from '@prairielearn/course-agent-types';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  queryScalars,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  CourseAgentConversationSchema,
  CourseAgentReviewSchema,
  type EnumCourseAgentReviewDecision,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Returns null if the review already has a decision, which the caller must then compare. */
export async function insertCourseAgentReview({
  course_agent_conversation_id,
  agent_review_id,
  decision,
  job_sequence_id,
  result,
}: {
  course_agent_conversation_id: string;
  agent_review_id: string;
  decision: EnumCourseAgentReviewDecision;
  job_sequence_id: string | null;
  result: RequestChangesResult | null;
}) {
  return await queryOptionalRow(
    sql.insert_course_agent_review,
    { course_agent_conversation_id, agent_review_id, decision, job_sequence_id, result },
    CourseAgentReviewSchema,
  );
}

export async function selectOptionalCourseAgentReview({
  course_agent_conversation_id,
  agent_review_id,
}: {
  course_agent_conversation_id: string;
  agent_review_id: string;
}) {
  return await queryOptionalRow(
    sql.select_course_agent_review,
    { course_agent_conversation_id, agent_review_id },
    CourseAgentReviewSchema,
  );
}

/** The first recorded result wins; returns null if another caller recorded it first. */
export async function updateCourseAgentReviewResult({
  id,
  result,
}: {
  id: string;
  result: RequestChangesResult;
}) {
  return await queryOptionalRow(
    sql.update_course_agent_review_result,
    { id, result },
    CourseAgentReviewSchema,
  );
}

export async function updateCourseAgentReviewDelivered(id: string) {
  await execute(sql.update_course_agent_review_delivered, { id });
}

export async function updateCourseAgentReviewStuckReported(id: string) {
  await execute(sql.update_course_agent_review_stuck_reported, { id });
}

/** Stop the sweep from resending results undelivered for longer than the cutoff; returns their IDs. */
export async function expireUndeliveredCourseAgentReviews({ cutoff }: { cutoff: string }) {
  return await queryScalars(sql.expire_undelivered_course_agent_reviews, { cutoff }, IdSchema);
}

/**
 * Reviews whose result the course agent service has not acknowledged, oldest first. The sweep
 * (no conversation) omits expired results; Resume (a conversation) includes them.
 */
export async function selectUndeliveredCourseAgentReviews({
  course_agent_conversation_id = null,
}: { course_agent_conversation_id?: string | null } = {}) {
  return await queryRows(
    sql.select_undelivered_course_agent_reviews,
    { course_agent_conversation_id },
    z.object({ review: CourseAgentReviewSchema, conversation: CourseAgentConversationSchema }),
  );
}
