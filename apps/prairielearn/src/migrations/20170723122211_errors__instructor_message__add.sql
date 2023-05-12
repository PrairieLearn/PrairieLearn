ALTER TABLE errors
RENAME COLUMN message TO student_message;

ALTER TABLE errors
ADD COLUMN instructor_message text;
