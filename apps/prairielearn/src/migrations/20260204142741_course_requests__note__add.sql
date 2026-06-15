ALTER TABLE course_requests
ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE course_requests
ADD CONSTRAINT note_length CHECK (char_length(note) <= 10000) NOT VALID;
