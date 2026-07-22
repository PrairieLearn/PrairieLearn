ALTER TABLE enrollments
ADD COLUMN pending_uin TEXT;

-- These replace pending_lti13_name and pending_lti13_email. The old columns are
-- intentionally retained for compatibility during a rolling deploy and can be
-- dropped in a later migration because the LTI enrollment scaffolding is unused.
ALTER TABLE enrollments
ADD COLUMN pending_name TEXT;

ALTER TABLE enrollments
ADD COLUMN pending_email TEXT;

-- This replaces pending_lti13_instance_id. The old column is intentionally
-- retained for rolling-deploy compatibility and can be dropped later.
ALTER TABLE enrollments
ADD COLUMN pending_lti13_course_instance_id BIGINT;

-- PostgreSQL does not support removing an enum value without recreating the enum
-- and rewriting the column. Keep the legacy value in the database enum, but make
-- it invalid for enrollments.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_status_not_lti13_pending CHECK (status != 'lti13_pending') NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_user_id_null_only_if_invited_rejected_v2 CHECK (
  (status IN ('invited', 'rejected')) = (user_id IS NULL)
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT first_joined_at_not_null_if_joined_and_created_at_not_null_v2 CHECK (
  created_at IS NULL
  OR status IN ('invited', 'rejected')
  OR first_joined_at IS NOT NULL
) NOT VALID;

-- Every pending enrollment must have at least one generic identity key. UID and
-- UIN may coexist when both are known.
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_identity_required CHECK (
  user_id IS NOT NULL
  OR pending_uid IS NOT NULL
  OR pending_uin IS NOT NULL
) NOT VALID;

-- Once an enrollment is resolved, all pending identity, display, and association
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
    AND pending_lti13_course_instance_id IS NULL
    AND pending_lti13_instance_id IS NULL
  )
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_lti13_sub_course_instance_id_pair CHECK (
  (pending_lti13_sub IS NULL) = (pending_lti13_course_instance_id IS NULL)
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_lti13_sub_requires_uin CHECK (
  pending_lti13_sub IS NULL
  OR pending_uin IS NOT NULL
) NOT VALID;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_lti13_course_instance_id_fkey FOREIGN KEY (pending_lti13_course_instance_id) REFERENCES lti13_course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
