-- There was previously another index of the same name, but it didn't actually
-- index on the question ID; it was a misnamed duplicate of another index.
-- We'll drop it and replace it with the correct index.
DROP INDEX IF EXISTS issues_question_id_open_idx;

CREATE INDEX issues_question_id_course_caused_open_idx ON issues (question_id, course_caused, open);
