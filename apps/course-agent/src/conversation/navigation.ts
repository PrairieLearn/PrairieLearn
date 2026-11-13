import { NavigationPartSchema, type NavigationTarget } from '@prairielearn/course-agent-types';

import { type CourseDataContext, authHeaders, errorMessage } from './course-data.js';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Asks PrairieLearn for the URL, label, and subtitle of the page the agent named, from
 * `POST /pl/api/v1/course/:course_id/agent_navigation`. A wrong name fails with PrairieLearn's
 * message, so the agent can correct it before the instructor's browser moves.
 */
export async function resolveNavigation(context: CourseDataContext, target: NavigationTarget) {
  if (!context.courseId) {
    throw new Error('Navigation is unavailable. Reload the PrairieLearn page.');
  }
  const response = await fetch(
    new URL(`/pl/api/v1/course/${context.courseId}/agent_navigation`, context.plUrl),
    {
      method: 'POST',
      headers: { ...authHeaders(context), 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  return NavigationPartSchema.parse(await response.json());
}
