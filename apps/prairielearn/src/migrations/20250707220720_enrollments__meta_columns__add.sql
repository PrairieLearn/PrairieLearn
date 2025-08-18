CREATE TYPE enum_enrollment_status AS ENUM(
  'invited',
  'joined',
  'removed',
  'rejected',
  'blocked',
  'lti13_pending'
);

ALTER TABLE enrollments
ADD COLUMN status enum_enrollment_status NOT NULL DEFAULT 'joined';

ALTER TABLE enrollments
ADD COLUMN lti_managed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE enrollments
ADD COLUMN pending_uid TEXT;

ALTER TABLE enrollments
ADD COLUMN pending_lti13_sub TEXT;

-- If a lti13_course_instance is deleted, we want to delete the enrollment.
-- This should only happen if the user is in the 'lti13_pending' state.
ALTER TABLE enrollments
ADD COLUMN pending_lti13_instance_id BIGINT REFERENCES lti13_course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE;

-- lti13_course_instances can be hard deleted, which cascades to deleting associated enrollments.
-- We index this column to speed up the deletion of those enrollments and avoid a table scan.
CREATE INDEX enrollments_pending_lti13_instance_id_idx ON enrollments (pending_lti13_instance_id);

ALTER TABLE enrollments
ALTER COLUMN user_id
DROP NOT NULL;

-- Forbid impossible states: rejected + lti_synced, blocked + lti_synced
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_impossible_synced CHECK (
  NOT (
    status IN ('rejected', 'blocked')
    AND lti_managed
  )
);

-- If a user is invited or rejected, we don't link them to a user to avoid PII leakage.
-- Further discussion: https://github.com/PrairieLearn/PrairieLearn/issues/12198#issuecomment-3161792357
-- Provisional 'lti13_pending' enrollments should never be associated with a user.
-- A user in any other state must have a user_id (including rejected users).
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_user_id_null_only_if_invited_rejected_pending CHECK (
  (status IN ('invited', 'rejected', 'lti13_pending')) = (user_id IS NULL)
);

-- Only enrollments in the 'invited' or 'rejected' state can have a pending_uid.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_uid_null_only_if_invited_rejected CHECK ((status IN ('invited', 'rejected')) = (pending_uid IS NOT NULL));

-- Enrollments in the 'joined' state must have a user_id, and they cannot have any pending_* columns.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_user_id_not_null_only_if_joined_no_pending CHECK (
  (status != 'joined')
  OR (
    user_id IS NOT NULL
    AND pending_uid IS NULL
    AND pending_lti13_sub IS NULL
    AND pending_lti13_instance_id IS NULL
  )
);

-- Only enrollments in the 'lti13_pending' state can have a pending_lti13_sub and pending_lti13_instance_id.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_invited_lti_synced_true_only_if_pending_set CHECK (
  (status = 'lti13_pending') = (
    pending_lti13_sub IS NOT NULL
    AND pending_lti13_instance_id IS NOT NULL
  )
);

-- Require exactly one of user_id, pending_lti13_sub, and pending_uid to be NULL.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_exactly_one_null_user_id_pending_uid_lti13_sub CHECK (
  (
    user_id IS NULL
    AND pending_lti13_sub IS NULL
    AND pending_uid IS NOT NULL
  )
  OR (
    user_id IS NOT NULL
    AND pending_lti13_sub IS NULL
    AND pending_uid IS NULL
  ) OR (
    user_id IS NULL
    AND pending_lti13_sub IS NOT NULL
    AND pending_uid IS NULL
  )
);

-- If an enrollment is in the 'lti13_pending' state, it must have a lti_managed = TRUE.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_lti13_pending_lti_managed_true CHECK (
  (
    status = 'lti13_pending'
    AND lti_managed = TRUE
  )
  OR (status != 'lti13_pending')
);

-- pending_uid + course_instance_id must be unique.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_uid_course_instance_id_key UNIQUE (pending_uid, course_instance_id);

-- pending_lti13_instance_id + pending_lti13_sub + course_instance_id must be unique.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_lti13_iid_pending_lti13_sub_ciid_key UNIQUE (
  pending_lti13_instance_id,
  pending_lti13_sub,
  course_instance_id
);
