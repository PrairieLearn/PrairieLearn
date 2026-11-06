-- Course agent SQL queries run on a separate login role that is a member of
-- `course_agent_reader`. The reader may only SELECT allowlisted columns, and
-- row-level security limits it to the course named by signed claims. Every
-- other role keeps unrestricted access through a permissive `true` policy.
--
-- Child policies use `= ANY (ARRAY(...))` rather than `IN (...)`. Postgres plans
-- subqueries in policies as hashed filters, which scan the whole child table;
-- an array of parent IDs can use the child's foreign-key index instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT
      1
    FROM
      pg_roles
    WHERE
      rolname = 'course_agent_reader'
  ) THEN
    CREATE ROLE course_agent_reader NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS course_agent;

CREATE EXTENSION IF NOT EXISTS pgcrypto
WITH
  SCHEMA course_agent;

-- The reader can call `set_config`, so the claims carry an HMAC whose key it cannot read.
CREATE TABLE IF NOT EXISTS course_agent.claim_keys (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  key bytea NOT NULL
);

INSERT INTO
  course_agent.claim_keys (key)
VALUES
  (course_agent.gen_random_bytes (32))
ON CONFLICT DO NOTHING;

-- Claims have the form `<user_id>.<course_id>.<expires_epoch>.<hex HMAC of the first three parts>`.
-- Returns the course only while the user still owns it, otherwise NULL (so policies match no rows).
CREATE OR REPLACE FUNCTION course_agent.current_course_id () RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  parts text[] := string_to_array(current_setting('course_agent.claims', true), '.');
  payload text := array_to_string(parts[1:3], '.');
BEGIN
  -- Check the format before casting, so a malformed claim returns NULL instead of an error.
  IF cardinality(parts) IS DISTINCT FROM 4
  OR payload !~ '^[0-9]{1,18}\.[0-9]{1,18}\.[0-9]{1,18}$' THEN
    RETURN NULL;
  END IF;
  IF parts[4] IS DISTINCT FROM encode(
    course_agent.hmac (
      convert_to(payload, 'UTF8'),
      (
        SELECT
          key
        FROM
          course_agent.claim_keys
      ),
      'sha256'
    ),
    'hex'
  )
  OR parts[3]::bigint <= extract(epoch FROM now()) THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT
      c.id
    FROM
      public.courses AS c
      JOIN public.course_permissions AS cp ON (cp.course_id = c.id)
    WHERE
      c.id = parts[2]::bigint
      AND c.deleted_at IS NULL
      AND cp.user_id = parts[1]::bigint
      AND cp.course_role = 'Owner'
  );
END;
$$;

GRANT USAGE ON SCHEMA course_agent TO course_agent_reader;

GRANT
SELECT
  (
    id,
    uuid,
    course_id,
    short_name,
    long_name,
    display_timezone,
    publishing_start_date,
    publishing_end_date
  ) ON course_instances TO course_agent_reader;

GRANT
SELECT
  (
    id,
    uuid,
    course_instance_id,
    tid,
    title,
    type,
    number,
    assessment_set_id,
    assessment_module_id,
    max_points,
    max_bonus_points,
    multiple_instance,
    team_work,
    score_stat_number,
    score_stat_mean,
    score_stat_median,
    score_stat_n_zero,
    score_stat_n_hundred
  ) ON assessments TO course_agent_reader;

GRANT
SELECT
  (
    id,
    uuid,
    course_id,
    qid,
    title,
    type,
    topic_id,
    grading_method,
    partial_credit,
    single_variant,
    draft
  ) ON questions TO course_agent_reader;

GRANT
SELECT
  (
    id,
    assessment_id,
    question_id,
    alternative_group_id,
    number,
    init_points,
    max_points,
    max_auto_points,
    max_manual_points,
    mean_question_score,
    median_question_score,
    discrimination,
    average_number_submissions,
    some_perfect_submission_perc,
    some_nonzero_submission_perc
  ) ON assessment_questions TO course_agent_reader;

GRANT
SELECT
  (
    id,
    assessment_id,
    user_id,
    team_id,
    number,
    mode,
    open,
    date,
    closed_at,
    duration,
    points,
    max_points,
    score_perc,
    include_in_statistics
  ) ON assessment_instances TO course_agent_reader;

GRANT
SELECT
  (
    id,
    assessment_instance_id,
    assessment_question_id,
    number,
    status,
    points,
    auto_points,
    manual_points,
    score_perc,
    number_attempts,
    first_submission_score,
    last_submission_score,
    highest_submission_score,
    requires_manual_grading,
    duration,
    first_duration,
    created_at,
    modified_at
  ) ON instance_questions TO course_agent_reader;

GRANT
SELECT
  (
    id,
    course_id,
    course_instance_id,
    question_id,
    instance_question_id,
    user_id,
    team_id,
    number,
    date,
    open,
    broken_at,
    num_tries,
    variant_seed,
    params,
    true_answer
  ) ON variants TO course_agent_reader;

GRANT
SELECT
  (
    id,
    variant_id,
    date,
    mode,
    duration,
    submitted_answer,
    gradable,
    broken,
    graded_at,
    score,
    correct,
    partial_scores,
    feedback,
    override_score,
    credit,
    is_ai_graded
  ) ON submissions TO course_agent_reader;

ALTER TABLE course_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON course_instances FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON course_instances AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    deleted_at IS NULL
    AND course_id = (
      SELECT
        course_agent.current_course_id ()
    )
  );

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON assessments FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON assessments AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    deleted_at IS NULL
    AND course_instance_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          course_instances
      )
    )
  );

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON questions FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON questions AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    deleted_at IS NULL
    AND course_id = (
      SELECT
        course_agent.current_course_id ()
    )
  );

ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON assessment_questions FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON assessment_questions AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    deleted_at IS NULL
    AND assessment_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          assessments
      )
    )
  );

ALTER TABLE assessment_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON assessment_instances FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON assessment_instances AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    assessment_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          assessments
      )
    )
  );

ALTER TABLE instance_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON instance_questions FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON instance_questions AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    assessment_instance_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          assessment_instances
      )
    )
  );

ALTER TABLE variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON variants FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

-- variants has no course_id index, so scope it through instance_questions. This
-- leaves out instructor previews, which have no instance question.
CREATE POLICY course_agent_read ON variants AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    instance_question_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          instance_questions
      )
    )
  );

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_roles ON submissions FOR ALL TO PUBLIC USING (true)
WITH
  CHECK (true);

CREATE POLICY course_agent_read ON submissions AS RESTRICTIVE FOR
SELECT
  TO course_agent_reader USING (
    variant_id = ANY (
      ARRAY(
        SELECT
          id
        FROM
          variants
      )
    )
  );
