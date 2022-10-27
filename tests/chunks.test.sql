-- BLOCK select_course_by_path
SELECT *
FROM pl_courses
WHERE path = $course_path;

-- BLOCK select_course_instance
SELECT id
FROM course_instances
WHERE long_name = $long_name;

-- BLOCK select_assessment
SELECT id
FROM assessments
WHERE tid = $tid;

-- BLOCK select_question
SELECT id
FROM questions
WHERE qid = $qid;
