-- STUDENTS (connected to "users" with additional information for ranked profiles and live scores)
CREATE TABLE IF NOT EXISTS PLR_students (
    user_id BIGINT PRIMARY KEY,
    --user_id BIGINT NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    color VARCHAR(256),
    course_instance_id bigint,
    live_score INT DEFAULT 0
    -- FOREIGN KEY (user_id) REFERENCES users (user_id),
    -- CONSTRAINT unique_student_user UNIQUE (user_id)
);

-- This insert will grab every student in the DB when the table is made.
INSERT INTO PLR_students (user_id, display_name, course_instance_id)
SELECT 
    user_id, name, lti_course_instance_id
FROM
    users
WHERE
    user_id NOT IN (
        SELECT
            user_id
        FROM
            job_sequences
    );

-- This trigger inserts into our PLR_students table all the necessary information
-- if a new student is entered into the users DB.
CREATE OR REPLACE FUNCTION insert_student_from_users()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.user_id NOT IN (SELECT user_id FROM job_sequences)) THEN
    INSERT INTO PLR_students (user_id, display_name, course_instance_id)
    VALUES (NEW.user_id, NEW.name, NEW.lti_course_instance_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--This trigger is what listens for inserts on the users table and calls our other trigger
CREATE TRIGGER trigger_insert_student
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION insert_student_from_users();