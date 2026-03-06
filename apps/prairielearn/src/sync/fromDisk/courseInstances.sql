-- BLOCK select_valid_institution_short_names
SELECT
  short_name
FROM
  institutions
WHERE
  short_name = ANY ($short_names::text[]);

-- BLOCK select_existing_enrollment_code
SELECT
  enrollment_code
FROM
  course_instances
WHERE
  enrollment_code = $enrollment_code;

-- BLOCK sync_course_instances
WITH
  json_course_instances AS (
    SELECT
      entries ->> 0 AS short_name,
      (entries ->> 1)::uuid AS uuid,
      entries ->> 2 AS enrollment_code,
      entries ->> 3 AS errors,
      entries ->> 4 AS warnings,
      (entries -> 5)::JSONB AS data
    FROM
      UNNEST($course_instances_data::jsonb[]) AS entries
  ),
  -- Synchronize the dest (course_instances) with the src
  -- (json_course_instances). This soft-deletes, un-soft-deletes,
  -- and inserts new rows in course_instances. No data is synced
  -- yet. Only the (id, course_id, uuid, short_name, deleted_at)
  -- columns are used.
  matched_rows AS (
    -- See `sync_questions.sql` for an explanation of the use of DISTINCT ON.
    SELECT DISTINCT
      ON (src_short_name) src.short_name AS src_short_name,
      src.uuid AS src_uuid,
      src.enrollment_code AS src_enrollment_code,
      dest.id AS dest_id
    FROM
      json_course_instances AS src
      LEFT JOIN course_instances AS dest ON (
        dest.course_id = $course_id
        AND (
          src.uuid = dest.uuid
          OR (
            (
              src.uuid IS NULL
              OR dest.uuid IS NULL
            )
            AND src.short_name = dest.short_name
            AND dest.deleted_at IS NULL
          )
        )
      )
    ORDER BY
      src_short_name,
      (src.uuid = dest.uuid) DESC NULLS LAST
  ),
  deactivate_unmatched_dest_rows AS (
    UPDATE course_instances AS dest
    SET
      deleted_at = now()
    WHERE
      dest.id NOT IN (
        SELECT
          dest_id
        FROM
          matched_rows
        WHERE
          dest_id IS NOT NULL
      )
      AND dest.deleted_at IS NULL
      AND dest.course_id = $course_id
  ),
  update_matched_dest_rows AS (
    UPDATE course_instances AS dest
    SET
      short_name = src_short_name,
      uuid = src_uuid,
      deleted_at = NULL
      -- enrollment_code is not updated here, because it is only used for new rows
    FROM
      matched_rows
    WHERE
      dest.id = dest_id
      AND dest.course_id = $course_id
  ),
  insert_unmatched_src_rows AS (
    -- UTC is used as a temporary timezone, which will be updated in following statements
    INSERT INTO
      course_instances AS dest (
        course_id,
        short_name,
        uuid,
        display_timezone,
        deleted_at,
        enrollment_code
      )
    SELECT
      $course_id,
      src_short_name,
      src_uuid,
      'UTC',
      NULL,
      src_enrollment_code
    FROM
      matched_rows
    WHERE
      dest_id IS NULL
    ORDER BY
      -- This is a hack to ensure that `Sp15` will have ID 1 in the test
      -- course. This assumes that it is in fact that first course instance,
      -- which is currently true. Mainly, this ensures that the tests are
      -- deterministic. We specifically use C collation to ensure that "Sp15"
      -- ends up before "public".
      -- See: https://github.com/PrairieLearn/PrairieLearn/pull/12037 and follow-up PRs.
      src_short_name COLLATE "C" ASC
    RETURNING
      dest.short_name AS src_short_name,
      dest.id AS inserted_dest_id
  ),
  valid_course_instances AS (
    -- At this point, there will be exactly one non-deleted row for
    -- all short_names that we loaded from disk. It is now safe to
    -- update all those rows with the new information from disk (if we
    -- have any).
    SELECT
      ci.id AS course_instance_id,
      ci.short_name,
      src.warnings,
      src.data,
      -- This is pre-computed as it is used in multiple expressions below.
      COALESCE(
        src.data ->> 'display_timezone',
        c.display_timezone
      ) AS display_timezone
    FROM
      json_course_instances AS src
      JOIN courses AS c ON (c.id = $course_id)
      JOIN course_instances AS ci ON (
        ci.course_id = c.id
        AND ci.short_name = src.short_name
        AND ci.deleted_at IS NULL
      )
    WHERE
      src.errors IS NULL
      OR src.errors = ''
  ),
  updated_course_instances AS (
    -- First, update complete information for all course instances without errors.
    UPDATE course_instances AS dest
    SET
      long_name = src.data ->> 'long_name',
      assessments_group_by = (src.data ->> 'assessments_group_by')::enum_assessment_grouping,
      display_timezone = src.display_timezone,
      json_comment = (src.data ->> 'comment')::jsonb,
      modern_publishing = (src.data ->> 'modern_publishing')::boolean,
      publishing_start_date = input_date (
        src.data ->> 'publishing_start_date',
        src.display_timezone
      ),
      publishing_end_date = input_date (
        src.data ->> 'publishing_end_date',
        src.display_timezone
      ),
      self_enrollment_enabled = (src.data ->> 'self_enrollment_enabled')::boolean,
      self_enrollment_enabled_before_date = input_date (
        src.data ->> 'self_enrollment_enabled_before_date',
        src.display_timezone
      ),
      self_enrollment_restrict_to_institution = (
        src.data ->> 'self_enrollment_restrict_to_institution'
      )::boolean,
      self_enrollment_use_enrollment_code = (
        src.data ->> 'self_enrollment_use_enrollment_code'
      )::boolean,
      share_source_publicly = (src.data ->> 'share_source_publicly')::boolean,
      sync_errors = NULL,
      sync_warnings = src.warnings
    FROM
      valid_course_instances AS src
    WHERE
      dest.id = src.course_instance_id
      AND dest.course_id = $course_id
  ),
  inserted_access_rules AS (
    -- Now, sync access rules for all valid course instances.
    INSERT INTO
      course_instance_access_rules (
        course_instance_id,
        number,
        uids,
        start_date,
        end_date,
        institution,
        json_comment
      )
    SELECT
      ci.course_instance_id,
      number,
      jsonb_array_to_text_array (access_rule -> 'uids'),
      input_date (access_rule ->> 'start_date', ci.display_timezone),
      input_date (access_rule ->> 'end_date', ci.display_timezone),
      access_rule ->> 'institution',
      access_rule -> 'comment'
    FROM
      valid_course_instances AS ci,
      JSONB_ARRAY_ELEMENTS(ci.data -> 'access_rules') WITH ORDINALITY AS t (access_rule, number)
    ON CONFLICT (number, course_instance_id) DO UPDATE
    SET
      uids = EXCLUDED.uids,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      institution = EXCLUDED.institution,
      json_comment = EXCLUDED.json_comment
  ),
  deleted_access_rules AS (
    DELETE FROM course_instance_access_rules AS ciar USING valid_course_instances AS ci
    WHERE
      ciar.course_instance_id = ci.course_instance_id
      AND ciar.number > JSONB_ARRAY_LENGTH(ci.data -> 'access_rules')
  ),
  updated_course_instance_errors AS (
    -- Add errors where needed.
    UPDATE course_instances AS dest
    SET
      sync_errors = src.errors,
      sync_warnings = src.warnings
    FROM
      json_course_instances AS src
    WHERE
      dest.short_name = src.short_name
      AND dest.deleted_at IS NULL
      AND dest.course_id = $course_id
      AND src.errors IS NOT NULL
      AND src.errors != ''
  )
SELECT
  -- Make a map from CIID to ID to return to the caller
  COALESCE(
    jsonb_object_agg(
      src_short_name,
      COALESCE(dest_id, inserted_dest_id)
    ),
    '{}'::JSONB
  )
FROM
  matched_rows
  LEFT JOIN insert_unmatched_src_rows USING (src_short_name);
