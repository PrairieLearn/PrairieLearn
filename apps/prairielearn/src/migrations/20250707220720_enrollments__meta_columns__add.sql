CREATE TYPE enum_enrollment_status AS ENUM(
  'invited',
  'joined',
  'removed',
  'rejected',
  'blocked'
);

ALTER TABLE enrollments
ADD COLUMN status enum_enrollment_status NOT NULL DEFAULT 'joined';

ALTER TABLE enrollments
ADD COLUMN lti_synced BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE enrollments
ADD COLUMN pending_uid TEXT;

ALTER TABLE enrollments
ALTER COLUMN user_id
DROP NOT NULL;

-- Forbid impossible states: invited + lti_synced, rejected + lti_synced , blocked + lti_synced
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_impossible_synced CHECK (
  NOT (
    status IN ('invited', 'rejected', 'blocked')
    AND lti_synced
  )
);

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_user_id_null_only_if_invited CHECK (
  -- To reject an invitation, you will need to sign in as the user and then reject the invitation.
  -- So user_id can be NULL only if status is 'invited'.
  (user_id IS NULL) = (status = 'invited')
);

-- Require exactly one of user_id and pending_uid to be NULL.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_exactly_one_null_user_id_pending_uid CHECK (
  (
    user_id IS NULL
    AND pending_uid IS NOT NULL
  )
  OR (
    user_id IS NOT NULL
    AND pending_uid IS NULL
  )
);

-- user_id+course_instance_id must be unique.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_user_id_course_instance_id_key UNIQUE (user_id, course_instance_id);

-- pending_uid+course_instance_id must be unique.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_uid_course_instance_id_key UNIQUE (pending_uid, course_instance_id);
