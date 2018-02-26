-- BLOCK select_home
WITH
course_permissions_for_user AS (
    SELECT
        *
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = $user_id
),
courses_list AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object('label', c.short_name || ': ' || c.title,'id', c.id) ORDER BY c.short_name, c.title, c.id), '[]'::jsonb)
         AS courses
    FROM
        pl_courses AS c
        LEFT JOIN course_permissions_for_user AS cp ON (cp.course_id = c.id)
    WHERE
        c.deleted_at IS NULL
        AND (
            $is_administrator
            OR (cp.id IS NOT NULL)
        )
),
enrollments_for_user AS (
    SELECT
        e.*,
        u.uid
    FROM
        enrollments AS e
        JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
        u.user_id = $user_id
),
course_instances_list AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'label', c.short_name || ': ' || c.title || ', ' || ci.long_name,
            'id', ci.id
        ) ORDER BY c.short_name, c.title, c.id, ci.number DESC, ci.id), '[]'::jsonb) AS course_instances
    FROM
        pl_courses AS c
        JOIN course_instances AS ci ON (ci.course_id = c.id)
        LEFT JOIN enrollments_for_user AS e ON (e.course_instance_id = ci.id)
    WHERE
        ci.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND (
            $is_administrator
            OR (
                e.id IS NOT NULL
                AND check_course_instance_access(ci.id, e.role, e.uid, $req_date)
            )
        )
),

course_instances_result AS (
    SELECT
        ci.*
    FROM
        course_instances AS ci
      JOIN enrollments_for_user AS efu ON (ci.course_id = efu.course_instance_id)

),


assessments_result_sql AS (
      SELECT
          ass.*
      FROM
           assessments AS ass
         JOIN course_instances_result AS cir ON (ass.course_instance_id = cir.id)

  ),

rules AS (
        SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id,'title', ar.title, 'deadline', r.end_date, 'assessmentID', r.assessment_id, 'courseID', ar.course_instance_id
        ) ORDER BY r.id), '[]'::jsonb) AS aar
        FROM
            assessment_access_rules AS r
        JOIN assessments_result_sql AS ar ON (ar.id = r.assessment_id AND (DATE(CURRENT_TIMESTAMP) + 3000 >= r.end_date) AND (DATE(CURRENT_TIMESTAMP) <= r.end_date))

        /*TIMESTAMPDIFF(day, CURRENT_TIMESTAMP, r.deadline) BETWEEN 0 AND 3*/
),


rules_passed AS (
  SELECT
  coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,'title', ar.title, 'deadline', r.end_date, 'assessmentID', r.assessment_id, 'courseID', ar.course_instance_id
  ) ORDER BY r.id), '[]'::jsonb) AS assessment_access_rules_passed
  FROM
      assessment_access_rules AS r
  JOIN assessments_result_sql AS ar ON (ar.id = r.assessment_id AND (DATE(CURRENT_TIMESTAMP) - 50000 <=  r.end_date) AND (DATE(CURRENT_TIMESTAMP) >=  r.end_date))

)

/*
rules AS (
SELECT
coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,'title', ar.title, 'deadline', r.end_date, 'assessmentID', r.assessment_id
) ORDER BY r.id), '[]'::jsonb) AS assessment_access_rules
FROM
    assessment_access_rules AS r
JOIN assessments_result_sql AS ar ON (ar.id = r.assessment_id)
WHERE CURRENT_TIMESTAMP BETWEEN ar.date AND ar.date_limit
)
*/
/*rules AS (
      SELECT
      coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'deadline', r.end_date
      ) ORDER BY r.id), '[]'::jsonb) AS assessment_access_rules
      FROM
      enrollments AS e
      JOIN course_instances AS ci ON (ci.course_id = e.course_instance_id)
      JOIN assessments AS asse ON (asse.course_instance_id = ci.id)
      JOIN assessment_access_rules AS aar ON (aar.id = asse.assessment_id)
*/


SELECT
    cl.courses,
    cil.course_instances,
    ar.aar,
    rp.assessment_access_rules_passed
FROM
    rules_passed AS rp,
    rules AS ar,
    courses_list AS cl,
    course_instances_list AS cil;
