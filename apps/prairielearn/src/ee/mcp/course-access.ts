import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import type { Course } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectUserById } from '../../models/user.js';
import { OAUTH_SCOPES, type OauthScope } from '../lib/oauth/config.js';
import { selectOauthGrantCourses } from '../models/oauth-grant.js';

import type { McpAuth } from './auth.js';

/** A refusal worded for the agent, which relays it to the user. */
export class McpAccessError extends Error {}

/**
 * Decides whether a connected agent may use a course for one purpose. All of these must hold: the
 * user allowed that permission, the user picked that course, and the user's own role in the course
 * is high enough right now. The role is looked up on every call, so removing someone from a
 * course ends their agent's access at once. Administrator rights never apply.
 */
export async function authorizeMcpCourse({
  auth,
  course_id,
  scope,
}: {
  auth: McpAuth;
  course_id: string;
  scope: OauthScope;
}): Promise<{ course: Course }> {
  if (!auth.scopes.includes(scope)) {
    throw new McpAccessError(
      `This connection was not given permission to: ${OAUTH_SCOPES[scope]}. Ask the user to reconnect PrairieLearn and allow it.`,
    );
  }

  const approved = await selectOauthGrantCourses(auth.oauth_grant_id);
  if (!approved.some((course) => course.id === course_id)) {
    const names = approved.map((course) => `${course.id} (${course.short_name})`).join(', ');
    throw new McpAccessError(
      `This connection is not approved for course ${course_id}. Approved courses: ${names || 'none'}. To use another course, ask the user to reconnect PrairieLearn and pick it.`,
    );
  }

  const user = await selectUserById(auth.user_id);
  const { authzData, course } = await constructCourseOrInstanceContext({
    user,
    course_id,
    course_instance_id: null,
    ip: auth.ip,
    req_date: new Date(),
    is_administrator: false,
  });
  if (authzData === null || course.example_course) {
    throw new McpAccessError(`The user no longer has access to course ${course_id}.`);
  }
  // A student who is staff in another course could otherwise bring course data into an exam.
  if (authzData.mode !== 'Public') {
    throw new McpAccessError('PrairieLearn cannot be used through an agent during an exam.');
  }
  const enabled = await features.enabled('mcp-server', {
    institution_id: course.institution_id,
    course_id: course.id,
    user_id: user.id,
  });
  if (!enabled) {
    throw new McpAccessError(`Connecting agents is not turned on for course ${course_id}.`);
  }
  const allowed =
    scope === 'course_data:read'
      ? authzData.has_course_permission_own
      : authzData.has_course_permission_edit;
  if (!allowed) {
    const role = scope === 'course_data:read' ? 'an owner' : 'an editor';
    throw new McpAccessError(`The user must be ${role} of course ${course_id} to do this.`);
  }
  return { course };
}
