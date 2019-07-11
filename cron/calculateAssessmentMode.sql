WITH assessment_instance_modes AS (
    SELECT
        count(ai.id) as count,
        ai.mode,
        a.id AS assessment_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (ai.assessment_id = a.id)
    GROUP BY
        ai.mode,
        a.id
),
assessment_modes AS (
    SELECT DISTINCT ON (aim.assessment_id)
        aim.assessment_id,
        aim.mode
    FROM
        assessment_instance_modes AS aim
    ORDER BY
        aim.assessment_id,
        aim.count
        DESC
)
UPDATE assessments AS ai
    SET
        mode = am.mode
    FROM
        assessment_modes AS am
    WHERE
        am.assessment_id = ai.id;
