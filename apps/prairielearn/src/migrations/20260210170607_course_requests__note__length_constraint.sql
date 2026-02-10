ALTER TABLE course_requests
ADD CONSTRAINT note_length CHECK (char_length(note) <= 10000);

ALTER TABLE course_requests VALIDATE CONSTRAINT note_length;
