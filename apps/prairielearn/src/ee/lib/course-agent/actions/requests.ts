/**
 * A course action the agent requests is recorded in `course_agent_actions` and waits in the
 * conversation's review slot. Its decision, result, and delivery are the `course_agent_reviews`
 * row with the same ID, so they are recorded and delivered exactly as a file review's are. The
 * action itself runs here, in the request that carries the instructor's approval.
 */
import { isDeepStrictEqual } from 'node:util';

import {
  CourseActionCardSchema,
  type CourseActionResult,
  CourseActionResultSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import type { CourseAgentAction, CourseAgentConversation } from '../../../../lib/db-types.js';
import {
  insertCourseAgentAction,
  selectOptionalCourseAgentAction,
} from '../../../models/course-agent-action.js';
import {
  insertCourseAgentReview,
  selectOptionalCourseAgentReview,
  updateCourseAgentReviewResult,
} from '../../../models/course-agent-review.js';
import { deliverDenialByMessage, deliverResult, matchDecision } from '../apply-changes.js';

import { type CourseActionContext, CourseActionError } from './action.js';
import { deniedCourseActionResult, finishedCourseActionResult } from './results.js';

import { COURSE_AGENT_ACTIONS } from './index.js';

/**
 * Checks a request and records it for the instructor to decide. Nothing in the course changes.
 * Errors with a status below 500 carry a message the course agent can act on.
 */
export async function requestCourseAction({
  ctx,
  conversation,
  id,
  name,
  input,
}: {
  ctx: CourseActionContext;
  conversation: CourseAgentConversation;
  id: string;
  name: string;
  input: unknown;
}): Promise<{ title: string }> {
  if (!Object.hasOwn(COURSE_AGENT_ACTIONS, name)) {
    throw new HttpStatusError(
      404,
      `Unknown action "${name}". Actions: ${Object.keys(COURSE_AGENT_ACTIONS).join(', ')}.`,
    );
  }
  try {
    const card = await COURSE_AGENT_ACTIONS[name].describe(ctx, input);
    await insertCourseAgentAction({
      course_agent_conversation_id: conversation.id,
      agent_action_id: id,
      action: name,
      input,
      card,
    });
    // The card's rows are course data, which the agent reads only with approval, so it is told
    // only what it asked for.
    return { title: card.title };
  } catch (error) {
    if (error instanceof CourseActionError) throw new HttpStatusError(400, error.message);
    throw error;
  }
}

/** What the action card shows: the request, and its decision and result once it has them. */
export async function getCourseAction(conversation: CourseAgentConversation, actionId: string) {
  const key = { course_agent_conversation_id: conversation.id, agent_action_id: actionId };
  const action = await selectOptionalCourseAgentAction(key);
  if (!action) return null;
  const decided = await selectOptionalCourseAgentReview({
    course_agent_conversation_id: conversation.id,
    agent_review_id: actionId,
  });
  return {
    card: CourseActionCardSchema.parse(action.card),
    decision: decided?.decision ?? null,
    result: decided?.result == null ? null : CourseActionResultSchema.parse(decided.result),
  };
}

async function runCourseAction(
  ctx: CourseActionContext,
  action: CourseAgentAction,
): Promise<CourseActionResult> {
  try {
    const definition = COURSE_AGENT_ACTIONS[action.action];
    // The instructor approved what the card said. If the course has changed since, so that the
    // action would now do something else, it is not run.
    const card = await definition.describe(ctx, action.input);
    if (!isDeepStrictEqual(card, CourseActionCardSchema.parse(action.card))) {
      throw new CourseActionError(
        'Nothing was changed: what this request would do is no longer what the instructor approved, because the course changed in the meantime. Request it again so they can decide on the current change.',
      );
    }
    return finishedCourseActionResult(action, await definition.run(ctx, action.input));
  } catch (error) {
    if (error instanceof CourseActionError) {
      return finishedCourseActionResult(action, { status: 'failed', error: error.message });
    }
    logger.error(`Course agent action ${action.action} failed`, error);
    Sentry.captureException(error);
    return finishedCourseActionResult(action, {
      status: 'failed',
      error: 'PrairieLearn could not complete the action because of an internal error.',
    });
  }
}

/**
 * Records the instructor's decision on a requested action and, for an approval, runs it. The
 * first decision wins, and a repeat must agree with it, as for a file review.
 */
export async function postCourseActionDecision({
  ctx,
  conversation,
  action,
  decision,
  viaMessage = false,
}: {
  ctx: CourseActionContext;
  conversation: CourseAgentConversation;
  action: CourseAgentAction;
  decision: 'approved' | 'denied';
  /** The browser sends a chat message once this denial is recorded, which delivers it. */
  viaMessage?: boolean;
}) {
  const key = {
    course_agent_conversation_id: conversation.id,
    agent_review_id: action.agent_action_id,
  };
  const settleRepeat = async () => {
    const winner = (await selectOptionalCourseAgentReview(key))!;
    matchDecision(winner, decision, viaMessage);
    if (viaMessage) await deliverDenialByMessage(conversation, winner);
    return { decision };
  };
  if (await selectOptionalCourseAgentReview(key)) return await settleRepeat();
  if (!Object.hasOwn(COURSE_AGENT_ACTIONS, action.action)) {
    throw new HttpStatusError(409, 'This action is no longer available.');
  }
  if (decision === 'denied') {
    const result = deniedCourseActionResult(action, viaMessage);
    const row = await insertCourseAgentReview({
      ...key,
      decision,
      job_sequence_id: null,
      result,
    });
    if (!row) return await settleRepeat();
    if (viaMessage) {
      await deliverDenialByMessage(conversation, row);
    } else {
      await deliverResult(conversation, row, result);
    }
    return { decision };
  }
  // Claiming the decision first means a concurrent approval never runs the action twice.
  const row = await insertCourseAgentReview({
    ...key,
    decision,
    job_sequence_id: null,
    result: null,
  });
  if (!row) return await settleRepeat();
  const result = await runCourseAction(ctx, action);
  // The result is recorded before this request answers, so the card that refetches finds it.
  const recorded = await updateCourseAgentReviewResult({ id: row.id, result });
  // As for a file review, the agent's next turn starts once it has the result, so the result is
  // sent after this request answers. A failed send is retried by the result sweep.
  if (recorded) void deliverResult(conversation, recorded, result);
  return { decision };
}
