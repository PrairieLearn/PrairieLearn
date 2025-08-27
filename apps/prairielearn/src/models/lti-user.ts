import { z } from 'zod';

import { callRow } from '@prairielearn/postgres';

import { insertAuditEvent } from './audit-event.js';
import { ensureEnrollment } from './enrollment.js';
import { selectInstitutionByShortName } from './institution.js';
import { insertUserLti, selectUserByUidAndInstitution, updateUserName } from './user.js';

export interface LtiUserResult {
  userId: string;
  hasAccess: boolean;
}

export async function selectOrInsertAndEnrollLtiUser({
  uid,
  name,
  lti_course_instance_id,
  lti_user_id,
  lti_context_id,
  req_date,
}: {
  uid: string;
  name: string | null;
  lti_course_instance_id: string;
  lti_user_id: string;
  lti_context_id: string;
  req_date: Date;
}): Promise<LtiUserResult> {
  // Find the LTI institution
  const ltiInstitution = await selectInstitutionByShortName({ short_name: 'LTI' });
  const institution_id = ltiInstitution.id;
  // Try to get an existing user with uid and LTI institution
  let user = await selectUserByUidAndInstitution({
    uid,
    institution_id,
  });

  // If we don't have the user already, create it
  if (!user) {
    user = await insertUserLti({
      uid,
      name,
      lti_course_instance_id,
      lti_user_id,
      lti_context_id,
      institution_id,
    });

    await insertAuditEvent({
      action: 'insert',
      table_name: 'users',
      row_id: user.user_id,
      new_row: user,
      institution_id,
      course_instance_id: lti_course_instance_id,
      subject_user_id: user.user_id,
      agent_authn_user_id: null,
    });
  }

  // Update user name if needed
  if (name !== null && name !== user.name) {
    const oldUser = user;
    user = await updateUserName({
      user_id: user.user_id,
      name,
    });

    await insertAuditEvent({
      action: 'update',
      action_detail: 'name',
      table_name: 'users',
      row_id: user.user_id,
      old_row: oldUser,
      new_row: user,
      institution_id,
      course_instance_id: lti_course_instance_id,
      subject_user_id: user.user_id,
      agent_authn_user_id: null,
    });
  }

  const userId = user.user_id;

  // Verify user_id exists and is valid
  if (!userId) {
    throw new Error('computed NULL user_id');
  }
  const userIdNum = Number.parseInt(userId);
  if (userIdNum < 1 || userIdNum > 1000000000) {
    throw new Error('user_id out of bounds');
  }

  // Check course instance access using the stored procedure
  const hasAccess = await callRow(
    'check_course_instance_access',
    [lti_course_instance_id, user.uid, user.institution_id, req_date],
    z.boolean(),
  );

  // If user has access, then ensure enrollment
  if (hasAccess) {
    await ensureEnrollment({
      course_instance_id: lti_course_instance_id,
      user_id: userId,
    });
  }

  return {
    userId,
    hasAccess,
  };
}
