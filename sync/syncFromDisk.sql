-- BLOCK select_course_id
SELECT id
FROM pl_courses
WHERE path = $path;

-- BLOCK select_for_integrity_check
WITH uuid_from_qid AS (
    SELECT
        uuid
    FROM
        questions AS q
    WHERE
        q.qid = $qid
        AND q.course_id = $course_id
), qid_from_uuid AS (
    SELECT
        qid
    FROM
        questions AS q,
        pl_courses AS c
    WHERE
        q.uuid = $uuid
        AND q.course_id = $course_id
)
SELECT uuid, qid
FROM uuid_from_qid, qid_from_uuid;
