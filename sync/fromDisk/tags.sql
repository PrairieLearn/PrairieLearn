-- BLOCK update_tags
SELECT * FROM sync_course_tags($new_tags::jsonb, $course_id);

-- BLOCK update_question_tags
SELECT * FROM sync_question_tags($new_question_tags::jsonb);
