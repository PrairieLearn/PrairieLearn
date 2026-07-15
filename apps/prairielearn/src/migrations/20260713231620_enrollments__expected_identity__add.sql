ALTER TABLE enrollments
ADD COLUMN pending_uin TEXT;

-- These replace pending_lti13_name and pending_lti13_email. The old columns are
-- intentionally retained for compatibility during a rolling deploy and can be
-- dropped in a later migration because the LTI enrollment scaffolding is unused.
ALTER TABLE enrollments
ADD COLUMN pending_name TEXT;

ALTER TABLE enrollments
ADD COLUMN pending_email TEXT;

ALTER TABLE enrollments
DROP CONSTRAINT enrollments_exactly_one_null_user_id_pending_uid_lti13_sub;

ALTER TABLE enrollments
DROP CONSTRAINT enrollments_lti13_keys_only_if_lti13_pending;

ALTER TABLE enrollments
DROP CONSTRAINT enrollments_lti13_pending_lti_managed_true;

ALTER TABLE enrollments
DROP CONSTRAINT enrollments_pending_uid_null_only_if_invited_rejected;

ALTER TABLE enrollments
DROP CONSTRAINT enrollments_user_id_null_only_if_invited_rejected_pending;

ALTER TABLE enrollments
DROP CONSTRAINT first_joined_at_not_null_if_joined_and_created_at_not_null;

-- PostgreSQL does not support removing an enum value without recreating the enum
-- and rewriting the column. Keep the legacy value in the database enum, but make
-- it invalid for enrollments.
ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_status_not_lti13_pending CHECK (status != 'lti13_pending');

-- Invited and rejected enrollments have not resolved to a user. Every other
-- lifecycle state belongs to a resolved user.
ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_user_id_null_only_if_invited_rejected CHECK (
  (status IN ('invited', 'rejected')) = (user_id IS NULL)
);

-- A generic identity is either resolved or waiting on exactly one supported key
-- type. An LTI sub is a separate association and may accompany a pending key.
ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_at_most_one_generic_identity CHECK (
  num_nonnulls (user_id, pending_uid, pending_uin) <= 1
);

-- Sub-only pending enrollments are allowed, but display fields alone do not
-- identify an expected user.
ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_identity_required CHECK (
  num_nonnulls (
    user_id,
    pending_uid,
    pending_uin,
    pending_lti13_sub
  ) >= 1
);

-- Once the generic identity is resolved, all pending identity and association
-- data must have been consumed.
ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_pending_fields_null_if_resolved CHECK (
  user_id IS NULL
  OR (
    pending_uid IS NULL
    AND pending_uin IS NULL
    AND pending_name IS NULL
    AND pending_email IS NULL
    AND pending_lti13_name IS NULL
    AND pending_lti13_email IS NULL
    AND pending_lti13_sub IS NULL
    AND pending_lti13_instance_id IS NULL
  )
);

ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_lti13_sub_instance_id_pair CHECK (
  (pending_lti13_sub IS NULL) = (pending_lti13_instance_id IS NULL)
);

ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT enrollments_lti13_sub_requires_lti_managed CHECK (
  pending_lti13_sub IS NULL
  OR lti_managed
);

ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT first_joined_at_not_null_if_joined_and_created_at_not_null CHECK (
  -- Old enrollments have a null created_at. Don't enforce the constraint for those.
  created_at IS NULL
  -- Pending enrollments may or may not have been joined previously.
  OR status IN ('invited', 'rejected')
  -- All resolved lifecycle states require a first join time.
  OR first_joined_at IS NOT NULL
);

ALTER TABLE enrollments
-- squawk-ignore constraint-missing-not-valid, disallowed-unique-constraint
ADD CONSTRAINT enrollments_pending_uin_course_instance_id_key UNIQUE (pending_uin, course_instance_id);
