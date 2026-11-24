import { CourseActionCardSchema, type CourseActionResult } from '@prairielearn/course-agent-types';

import type { CourseAgentAction } from '../../../../lib/db-types.js';

import type { CourseActionOutcome } from './action.js';

/** Names the request in its result, so the course agent knows what the outcome is about. */
function named(action: CourseAgentAction) {
  return { name: action.action, title: CourseActionCardSchema.parse(action.card).title };
}

export function deniedCourseActionResult(
  action: CourseAgentAction,
  viaMessage: boolean,
): CourseActionResult {
  return {
    decision: 'denied',
    action: named(action),
    outcome: { status: 'not_attempted' },
    ...(viaMessage ? { viaMessage: true as const } : {}),
  };
}

export function finishedCourseActionResult(
  action: CourseAgentAction,
  outcome: CourseActionOutcome,
): CourseActionResult {
  return { decision: 'approved', action: named(action), outcome };
}

/** An approval that PrairieLearn lost before recording how the action ended. */
export function unknownCourseActionResult(action: CourseAgentAction): CourseActionResult {
  return { decision: 'approved', action: named(action), outcome: { status: 'unknown' } };
}
