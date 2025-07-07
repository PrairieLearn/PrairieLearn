-- Add new enum type for enrollment status if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_enrollment_status') THEN
        CREATE TYPE enum_enrollment_status AS ENUM ('invited', 'joined', 'removed', 'blocked');
    END IF;
END$$;

-- Add status column
ALTER TABLE enrollments
ADD COLUMN status enum_enrollment_status NOT NULL DEFAULT 'joined';

-- Add lti_synced column
ALTER TABLE enrollments
ADD COLUMN lti_synced BOOLEAN NOT NULL DEFAULT FALSE;

-- Add pending_uid column
ALTER TABLE enrollments
ADD COLUMN pending_uid TEXT;

-- Make user_id nullable
ALTER TABLE enrollments
ALTER COLUMN user_id
DROP NOT NULL;

-- Forbid impossible states: invited + lti_synced, blocked + lti_synced
ALTER TABLE enrollments
ADD CONSTRAINT enrollments_no_invited_synced CHECK (
  NOT (
    status = 'invited'
    AND lti_synced
  )
),
ADD CONSTRAINT enrollments_no_blocked_synced CHECK (
  NOT (
    status = 'blocked'
    AND lti_synced
  )
);
