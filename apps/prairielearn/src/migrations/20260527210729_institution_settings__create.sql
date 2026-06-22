CREATE TABLE institution_settings (
  institution_id bigint PRIMARY KEY REFERENCES institutions ON UPDATE CASCADE ON DELETE CASCADE,
  course_request_message text,
  CONSTRAINT course_request_message_length CHECK (char_length(course_request_message) <= 10000)
);
