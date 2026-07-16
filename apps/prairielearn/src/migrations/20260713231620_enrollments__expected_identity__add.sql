ALTER TABLE enrollments
ADD COLUMN pending_uin TEXT;

-- These replace pending_lti13_name and pending_lti13_email. The old columns are
-- intentionally retained for compatibility during a rolling deploy and can be
-- dropped in a later migration because the LTI enrollment scaffolding is unused.
ALTER TABLE enrollments
ADD COLUMN pending_name TEXT;

ALTER TABLE enrollments
ADD COLUMN pending_email TEXT;

-- PostgreSQL does not support removing an enum value without recreating the enum
-- and rewriting the column. Keep the legacy value in the database enum, but make
-- it invalid for enrollments.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_status_not_lti13_pending CHECK (status != 'lti13_pending') NOT VALID;

-- A generic identity is either resolved or waiting on exactly one supported key
-- type. An LTI sub is a separate association and may accompany a pending key.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_at_most_one_generic_identity CHECK (
  num_nonnulls (user_id, pending_uid, pending_uin) <= 1
) NOT VALID;

-- Sub-only pending enrollments are allowed, but display fields alone do not
-- identify an expected user.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_identity_required CHECK (
  num_nonnulls (
    user_id,
    pending_uid,
    pending_uin,
    pending_lti13_sub
  ) >= 1
) NOT VALID;

-- Once the generic identity is resolved, all pending identity and association
-- data must have been consumed.
ALTER TABLE enrollments
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
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_lti13_sub_instance_id_pair CHECK (
  (pending_lti13_sub IS NULL) = (pending_lti13_instance_id IS NULL)
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_lti13_sub_requires_lti_managed CHECK (
  pending_lti13_sub IS NULL
  OR lti_managed
) NOT VALID;
