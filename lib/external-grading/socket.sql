-- BLOCK select_submissions_for_variant
SELECT DISTINCT ON (s.id)
    s.id AS id,
    gj.id AS grading_job_id,
    grading_job_status(gj.id) AS grading_job_status
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
WHERE
    v.id = $variant_id
ORDER BY
    s.id,
    gj.id DESC;

-- BLOCK select_submission_for_grading_job
SELECT
    s.id AS id,
    gj.id AS grading_job_id,
    grading_job_status(gj.id) AS grading_job_status,
    s.variant_id AS variant_id
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
WHERE
    gj.id = (
        SELECT MAX(gj2.id)
        FROM grading_jobs AS gj2
        WHERE gj2.submission_id = (
            SELECT s2.id
            FROM submissions AS s2
            RIGHT JOIN grading_jobs AS gj3 ON (gj3.submission_id = s2.id)
            WHERE gj3.id = $grading_job_id
        )
    );
