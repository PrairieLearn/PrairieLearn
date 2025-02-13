CREATE TYPE enum_course_instance_usages_type AS ENUM(
  -- The user made at least one submission.
  'Submission',
  -- Total compute time in external grading.
  'External grading',
  -- Total compute time in workspaces.
  'Workspace'
);

CREATE TABLE course_instance_usages (
  id BIGSERIAL PRIMARY KEY,
  type enum_course_instance_usages_type NOT NULL,
  institution_id BIGINT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  course_id BIGINT NOT NULL REFERENCES pl_courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  -- Note that `course_instance_id` can be NULL for course staff working outside
  -- of a course instance.
  course_instance_id BIGINT REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  include_in_statistics BOOLEAN NOT NULL,
  duration INTERVAL NOT NULL DEFAULT '0',
  -- NULLS NOT DISTINCT is because we want a NULL `course_instance_id` to be a
  -- single row.
  --
  -- Note that course staff might have two rows recorded for them, one with a
  -- `course_instance_id` and one without, but this is ok because all of our
  -- billing queries will either count distinct `user_id`s or sum the `duration`
  -- for compute usage.
  --
  -- We order the columns in the UNIQUE constraint to have `date` first so that
  -- we can do efficient queries on all data in a date range.
  UNIQUE NULLS NOT DISTINCT (
    date,
    type,
    course_id,
    course_instance_id,
    user_id
  )
);

-- Support per-institution queries with date ranges.
CREATE INDEX course_instance_usages_institution_id_date_idx ON course_instance_usages (institution_id, date);

-- Support getting all rows for a course to enable moving courses between institutions.
CREATE INDEX course_instance_usages_course_id_idx ON course_instance_usages (course_id);
