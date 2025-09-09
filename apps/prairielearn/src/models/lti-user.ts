import { z } from 'zod';

import { callRow } from '@prairielearn/postgres';

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
  const { id: institution_id } = await selectInstitutionByShortName({ short_name: 'LTI' });

  let user = await selectUserByUidAndInstitution({
    uid,
    institution_id,
  });

  if (!user) {
    user = await insertUserLti({
      uid,
      name,
      lti_course_instance_id,
      lti_user_id,
      lti_context_id,
      institution_id,
    });
  }

  // Update user name if needed
  if (name !== null && name !== user.name) {
    user = await updateUserName({
      user_id: user.user_id,
      name,
    });
  }

  const userId = user.user_id;
  const hasAccess = await callRow(
    'check_course_instance_access',
    [lti_course_instance_id, user.uid, user.institution_id, req_date],
    z.boolean(),
  );

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
