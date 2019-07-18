-- BLOCK select_for_integrity_check
WITH uuid_from_qid AS (
    SELECT
        uuid
    FROM
        questions AS q,
        pl_courses AS c
    WHERE
        q.qid = $qid
        AND c.path = $course_path
        AND q.course_id = c.id
), qid_from_uuid AS (
    SELECT
        qid
    FROM
        questions AS q,
        pl_courses AS c
    WHERE
        q.uuid = $uuid
        AND c.path = $course_path
        AND q.course_id = c.id
)
SELECT uuid, qid
FROM uuid_from_qid, qid_from_uuid;
